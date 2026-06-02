package com.aimeeting.backend.controller;

import com.aimeeting.backend.dto.AuthResponse;
import com.aimeeting.backend.dto.LoginRequest;
import com.aimeeting.backend.dto.RegisterRequest;
import com.aimeeting.backend.model.User;
import com.aimeeting.backend.repository.UserRepository;
import com.aimeeting.backend.security.JwtTokenProvider;
import com.aimeeting.backend.security.UserPrincipal;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthenticationManager authenticationManager;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtTokenProvider tokenProvider;

    @Value("${app.n8n-otp-webhook-url}")
    private String n8nOtpWebhookUrl;

    // In-memory OTP storage
    private final ConcurrentHashMap<String, OtpInfo> otpStore = new ConcurrentHashMap<>();

    // In-memory Forgot Password OTP storage
    private final ConcurrentHashMap<String, OtpInfo> forgotPasswordOtpStore = new ConcurrentHashMap<>();

    public static class OtpInfo {
        private final String code;
        private final LocalDateTime expiryTime;

        public OtpInfo(String code, int expiryMinutes) {
            this.code = code;
            this.expiryTime = LocalDateTime.now().plusMinutes(expiryMinutes);
        }

        public String getCode() {
            return code;
        }

        public boolean isExpired() {
            return LocalDateTime.now().isAfter(expiryTime);
        }
    }

    private boolean isValidEmail(String email) {
        if (email == null) return false;
        String emailRegex = "^[a-zA-Z0-9_+&*-]+(?:\\.[a-zA-Z0-9_+&*-]+)*@(?:[a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,7}$";
        return email.matches(emailRegex);
    }

    private boolean isPasswordStrict(String password) {
        if (password == null || password.length() < 8) {
            return false;
        }
        boolean hasUpper = false;
        boolean hasLower = false;
        boolean hasDigit = false;
        boolean hasSpecial = false;
        String specialChars = "~!@#$%^&*()-_=+[{]}\\|;:'\",<.>/?";

        for (char c : password.toCharArray()) {
            if (Character.isUpperCase(c)) {
                hasUpper = true;
            } else if (Character.isLowerCase(c)) {
                hasLower = true;
            } else if (Character.isDigit(c)) {
                hasDigit = true;
            } else if (specialChars.indexOf(c) >= 0) {
                hasSpecial = true;
            }
        }
        return hasUpper && hasLower && hasDigit && hasSpecial;
    }

    @PostMapping("/login")
    public ResponseEntity<?> authenticateUser(@RequestBody LoginRequest loginRequest, HttpServletResponse response) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        loginRequest.getEmail(),
                        loginRequest.getPassword()
                )
        );

        SecurityContextHolder.getContext().setAuthentication(authentication);
        String jwt = tokenProvider.generateToken(authentication);
        UserPrincipal userPrincipal = (UserPrincipal) authentication.getPrincipal();
        User user = userRepository.findById(userPrincipal.getId()).orElseThrow();

        // Set HttpOnly cookie
        response.addHeader("Set-Cookie", "token=" + jwt + "; Path=/; HttpOnly; Max-Age=3600; SameSite=Lax");

        return ResponseEntity.ok(new AuthResponse(jwt, user));
    }

    @PostMapping("/send-otp")
    public ResponseEntity<?> sendOtp(@RequestParam String email) {
        if (!isValidEmail(email)) {
            return ResponseEntity.badRequest().body("Invalid Email Address format!");
        }
        if (userRepository.existsByEmail(email)) {
            return ResponseEntity.badRequest().body("Email Address already in use!");
        }

        String code = String.format("%06d", new java.util.Random().nextInt(1000000));
        otpStore.put(email.toLowerCase().trim(), new OtpInfo(code, 5));
        System.out.println("[DEBUG AuthController] Generated OTP for " + email + ": " + code);

        // Trigger n8n webhook to send email
        try {
            Map<String, String> payload = new HashMap<>();
            payload.put("email", email);
            payload.put("otp", code);

            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
            org.springframework.http.HttpEntity<Map<String, String>> request = new org.springframework.http.HttpEntity<>(payload, headers);

            new RestTemplate().postForEntity(n8nOtpWebhookUrl, request, Map.class);
            System.out.println("[DEBUG AuthController] Dispatched OTP payload to n8n webhook");
        } catch (Exception e) {
            System.err.println("[DEBUG AuthController] Failed to forward OTP to n8n webhook: " + e.getMessage());
        }

        return ResponseEntity.ok().body(Map.of("message", "Verification OTP sent successfully!"));
    }

    @PostMapping("/verify-otp")
    public ResponseEntity<?> verifyOtp(@RequestParam String email, @RequestParam String otp) {
        String emailKey = email.toLowerCase().trim();
        OtpInfo storedOtp = otpStore.get(emailKey);
        if (storedOtp == null || storedOtp.isExpired() || !storedOtp.getCode().equals(otp.trim())) {
            return ResponseEntity.badRequest().body("Invalid or expired verification OTP!");
        }
        return ResponseEntity.ok().body(Map.of("message", "OTP verified successfully!"));
    }

    @PostMapping("/forgot-password/send-otp")
    public ResponseEntity<?> forgotPasswordSendOtp(@RequestParam String email) {
        if (!isValidEmail(email)) {
            return ResponseEntity.badRequest().body("Invalid Email Address format!");
        }
        if (!userRepository.existsByEmail(email)) {
            return ResponseEntity.badRequest().body("Email Address is not registered!");
        }

        String code = String.format("%06d", new java.util.Random().nextInt(1000000));
        forgotPasswordOtpStore.put(email.toLowerCase().trim(), new OtpInfo(code, 5));
        System.out.println("[DEBUG AuthController] Generated Forgot Password OTP for " + email + ": " + code);

        // Trigger n8n webhook to send email
        try {
            Map<String, String> payload = new HashMap<>();
            payload.put("email", email);
            payload.put("otp", code);

            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
            org.springframework.http.HttpEntity<Map<String, String>> request = new org.springframework.http.HttpEntity<>(payload, headers);

            new RestTemplate().postForEntity(n8nOtpWebhookUrl, request, Map.class);
            System.out.println("[DEBUG AuthController] Dispatched Forgot Password OTP payload to n8n webhook");
        } catch (Exception e) {
            System.err.println("[DEBUG AuthController] Failed to forward Forgot Password OTP to n8n: " + e.getMessage());
        }

        return ResponseEntity.ok().body(Map.of("message", "Verification OTP sent successfully!"));
    }

    @PostMapping("/forgot-password/reset")
    public ResponseEntity<?> forgotPasswordReset(
            @RequestParam String email, 
            @RequestParam String otp, 
            @RequestParam String newPassword) {
        if (!isValidEmail(email)) {
            return ResponseEntity.badRequest().body("Invalid Email Address format!");
        }
        if (!isPasswordStrict(newPassword)) {
            return ResponseEntity.badRequest().body("Password must be at least 8 characters long and contain at least one uppercase, lowercase, digit, and special character.");
        }

        String emailKey = email.toLowerCase().trim();
        OtpInfo storedOtp = forgotPasswordOtpStore.get(emailKey);
        if (storedOtp == null || storedOtp.isExpired() || !storedOtp.getCode().equals(otp.trim())) {
            return ResponseEntity.badRequest().body("Invalid or expired verification OTP!");
        }

        User user = userRepository.findByEmail(emailKey)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        forgotPasswordOtpStore.remove(emailKey);
        return ResponseEntity.ok().body(Map.of("message", "Password has been reset successfully!"));
    }

    @PostMapping("/register")
    public ResponseEntity<?> registerUser(@RequestBody RegisterRequest registerRequest, HttpServletResponse response) {
        if (!isValidEmail(registerRequest.getEmail())) {
            return ResponseEntity.badRequest().body("Invalid Email Address format!");
        }
        if (userRepository.existsByEmail(registerRequest.getEmail())) {
            return ResponseEntity.badRequest().body("Email Address already in use!");
        }
        if (!isPasswordStrict(registerRequest.getPassword())) {
            return ResponseEntity.badRequest().body("Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one digit, and one special character.");
        }

        // Verify OTP
        String emailKey = registerRequest.getEmail().toLowerCase().trim();
        OtpInfo storedOtp = otpStore.get(emailKey);
        if (storedOtp == null || storedOtp.isExpired() || !storedOtp.getCode().equals(registerRequest.getOtp())) {
            return ResponseEntity.badRequest().body("Invalid or expired verification OTP!");
        }
        
        // Remove OTP once verified
        otpStore.remove(emailKey);

        // Create user
        User user = User.builder()
                .name(registerRequest.getName())
                .email(registerRequest.getEmail())
                .password(passwordEncoder.encode(registerRequest.getPassword()))
                .avatar("https://api.dicebear.com/7.x/adventurer/svg?seed=" + UUID.randomUUID())
                .build();

        User savedUser = userRepository.save(user);

        // Auto authenticate after registration
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        registerRequest.getEmail(),
                        registerRequest.getPassword()
                )
        );

        SecurityContextHolder.getContext().setAuthentication(authentication);
        String jwt = tokenProvider.generateToken(authentication);

        // Set HttpOnly cookie
        response.addHeader("Set-Cookie", "token=" + jwt + "; Path=/; HttpOnly; Max-Age=3600; SameSite=Lax");

        return ResponseEntity.ok(new AuthResponse(jwt, savedUser));
    }

    @GetMapping("/me")
    public ResponseEntity<?> getCurrentUser(@AuthenticationPrincipal UserPrincipal userPrincipal) {
        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
        }
        User user = userRepository.findById(userPrincipal.getId())
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        return ResponseEntity.ok(user);
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logoutUser(HttpServletResponse response) {
        response.addHeader("Set-Cookie", "token=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax");
        return ResponseEntity.ok().body(Map.of("message", "Logged out successfully!"));
    }
}
