package com.aimeeting.backend.controller;

import com.aimeeting.backend.dto.MessageDTO;
import com.aimeeting.backend.model.Message;
import com.aimeeting.backend.model.Room;
import com.aimeeting.backend.model.User;
import com.aimeeting.backend.repository.UserRepository;
import com.aimeeting.backend.security.UserPrincipal;
import com.aimeeting.backend.service.ChatService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
public class ChatController {

    @Autowired
    private ChatService chatService;

    @Autowired
    private UserRepository userRepository;

    // WebSocket / STOMP Mappings
    @MessageMapping("/chat.send-message")
    public void receiveMessage(@Payload MessageDTO messageDTO) {
        User sender = userRepository.findById(messageDTO.getSenderId())
                .orElseThrow(() -> new IllegalArgumentException("Sender not found"));
        chatService.sendMessage(
                messageDTO.getRoomId(),
                sender,
                messageDTO.getMessageText(),
                messageDTO.getMediaUrl(),
                messageDTO.getMediaType()
        );
    }

    // REST API for uploading Chat Media (Images/Videos)
    @PostMapping("/api/chat/media")
    public ResponseEntity<?> uploadChatMedia(@RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body("File is empty");
        }
        try {
            String uploadDir = "chat_media";
            java.nio.file.Path uploadPath = java.nio.file.Paths.get(uploadDir).toAbsolutePath().normalize();
            if (!java.nio.file.Files.exists(uploadPath)) {
                java.nio.file.Files.createDirectories(uploadPath);
            }
            String fileName = System.currentTimeMillis() + "_" + file.getOriginalFilename().replaceAll("[^a-zA-Z0-9\\.\\-]", "_");
            java.nio.file.Path filePath = uploadPath.resolve(fileName);
            java.nio.file.Files.copy(file.getInputStream(), filePath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            
            String mediaUrl = "/api/chat/media/file/" + fileName;
            
            String contentType = file.getContentType();
            String mediaType = "FILE";
            if (contentType != null) {
                if (contentType.startsWith("image/")) {
                    mediaType = "IMAGE";
                } else if (contentType.startsWith("video/")) {
                    mediaType = "VIDEO";
                }
            }
            
            java.util.Map<String, String> response = new java.util.HashMap<>();
            response.put("url", mediaUrl);
            response.put("mediaType", mediaType);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Failed to upload media: " + e.getMessage());
        }
    }

    // REST API for serving Chat Media files
    @GetMapping("/api/chat/media/file/{fileName:.+}")
    public ResponseEntity<org.springframework.core.io.Resource> getChatMediaFile(@PathVariable String fileName) {
        try {
            java.nio.file.Path filePath = java.nio.file.Paths.get("chat_media").resolve(fileName).normalize().toAbsolutePath();
            org.springframework.core.io.Resource resource = new org.springframework.core.io.UrlResource(filePath.toUri());
            if (resource.exists()) {
                String contentType = java.nio.file.Files.probeContentType(filePath);
                if (contentType == null) {
                    contentType = "application/octet-stream";
                }
                return ResponseEntity.ok()
                        .contentType(org.springframework.http.MediaType.parseMediaType(contentType))
                        .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + resource.getFilename() + "\"")
                        .body(resource);
            } else {
                return ResponseEntity.notFound().build();
            }
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @MessageMapping("/chat.typing")
    public void receiveTypingIndicator(@Payload MessageDTO messageDTO) {
        User sender = userRepository.findById(messageDTO.getSenderId())
                .orElseThrow(() -> new IllegalArgumentException("Sender not found"));
        boolean isTyping = "typing".equalsIgnoreCase(messageDTO.getMessageText());
        chatService.sendTypingIndicator(messageDTO.getRoomId(), sender, isTyping);
    }

    // REST APIs for Chat Rooms
    @GetMapping("/api/chat/rooms")
    public ResponseEntity<List<Room>> getAllRooms() {
        return ResponseEntity.ok(chatService.getAllRooms());
    }

    @GetMapping("/api/chat/rooms/my")
    public ResponseEntity<List<Room>> getMyRooms(@AuthenticationPrincipal UserPrincipal userPrincipal) {
        User user = userRepository.findById(userPrincipal.getId()).orElseThrow();
        return ResponseEntity.ok(chatService.getRoomsForUser(user));
    }

    @PostMapping("/api/chat/rooms")
    public ResponseEntity<Room> createRoom(
            @RequestParam("name") String name,
            @RequestParam(value = "description", required = false) String description,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        User user = userRepository.findById(userPrincipal.getId()).orElseThrow();
        return ResponseEntity.ok(chatService.createRoom(name, description, user));
    }

    @GetMapping("/api/chat/rooms/{roomId}/history")
    public ResponseEntity<List<MessageDTO>> getHistory(@PathVariable Long roomId) {
        return ResponseEntity.ok(chatService.getHistory(roomId));
    }

    @PostMapping("/api/chat/rooms/{roomId}/join")
    public ResponseEntity<Room> joinRoom(
            @PathVariable Long roomId,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        User user = userRepository.findById(userPrincipal.getId()).orElseThrow();
        return ResponseEntity.ok(chatService.joinRoom(roomId, user));
    }

    @PostMapping("/api/chat/rooms/{roomId}/leave")
    public ResponseEntity<Room> leaveRoom(
            @PathVariable Long roomId,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        User user = userRepository.findById(userPrincipal.getId()).orElseThrow();
        return ResponseEntity.ok(chatService.leaveRoom(roomId, user));
    }

    @GetMapping("/api/chat/users")
    public ResponseEntity<List<User>> getAllUsers() {
        return ResponseEntity.ok(userRepository.findAll());
    }
}
