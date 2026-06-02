package com.aimeeting.backend.controller;

import com.aimeeting.backend.dto.ChatAnswerResponse;
import com.aimeeting.backend.dto.ChatQuestionRequest;
import com.aimeeting.backend.model.Meeting;
import com.aimeeting.backend.model.User;
import com.aimeeting.backend.repository.UserRepository;
import com.aimeeting.backend.security.UserPrincipal;
import com.aimeeting.backend.service.MeetingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/meetings")
public class MeetingController {

    @Autowired
    private MeetingService meetingService;

    @Autowired
    private UserRepository userRepository;

    @PostMapping("/upload")
    public ResponseEntity<?> uploadMeeting(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "title", required = false) String title,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            User user = userRepository.findById(userPrincipal.getId()).orElseThrow();
            Meeting meeting = meetingService.uploadAndProcessAudio(file, title, user);
            return ResponseEntity.ok(meeting);
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to upload file: " + e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Error processing meeting: " + e.getMessage());
        }
    }

    @GetMapping
    public ResponseEntity<List<Meeting>> getMeetings(@AuthenticationPrincipal UserPrincipal userPrincipal) {
        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        User user = userRepository.findById(userPrincipal.getId()).orElseThrow();
        List<Meeting> meetings = meetingService.getAllMeetingsByUser(user);
        return ResponseEntity.ok(meetings);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getMeeting(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal userPrincipal) {
        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            User user = userRepository.findById(userPrincipal.getId()).orElseThrow();
            Meeting meeting = meetingService.getMeetingByIdAndUser(id, user);
            return ResponseEntity.ok(meeting);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Access denied: " + e.getMessage());
        }
    }

    @PostMapping("/bot/join")
    public ResponseEntity<?> joinBot(
            @RequestParam("url") String url,
            @RequestParam(value = "title", required = false) String title,
            @RequestHeader("Authorization") String authHeader,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            User user = userRepository.findById(userPrincipal.getId()).orElseThrow();
            Meeting meeting = meetingService.createBotMeetingAndJoin(url, title, authHeader, user);
            return ResponseEntity.ok(meeting);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Error joining bot: " + e.getMessage());
        }
    }

    @PostMapping("/bot/stop")
    public ResponseEntity<?> stopBot(
            @RequestParam("meetingId") Long meetingId,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            User user = userRepository.findById(userPrincipal.getId()).orElseThrow();
            // Verify meeting ownership
            meetingService.getMeetingByIdAndUser(meetingId, user);
            meetingService.stopBotMeeting(meetingId);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Error stopping bot: " + e.getMessage());
        }
    }

    @PostMapping("/{id}/upload-audio")
    public ResponseEntity<?> uploadAudio(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            User user = userRepository.findById(userPrincipal.getId()).orElseThrow();
            Meeting meeting = meetingService.getMeetingByIdAndUser(id, user);
            Meeting updatedMeeting = meetingService.processUploadedAudioForMeeting(meeting.getId(), file);
            return ResponseEntity.ok(updatedMeeting);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Error uploading audio: " + e.getMessage());
        }
    }

    @PostMapping("/{id}/chat")
    public ResponseEntity<?> chatWithMeeting(
            @PathVariable Long id,
            @RequestBody ChatQuestionRequest request,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        if (userPrincipal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            User user = userRepository.findById(userPrincipal.getId()).orElseThrow();
            // Verify meeting ownership
            meetingService.getMeetingByIdAndUser(id, user);
            ChatAnswerResponse response = meetingService.queryRagChatbot(id, request.getQuestion());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Error chatting: " + e.getMessage());
        }
    }
}
