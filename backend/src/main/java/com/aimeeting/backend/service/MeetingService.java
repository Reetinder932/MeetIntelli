package com.aimeeting.backend.service;

import com.aimeeting.backend.dto.ChatAnswerResponse;
import com.aimeeting.backend.dto.ChatQuestionRequest;
import com.aimeeting.backend.dto.FastApiProcessResponse;
import com.aimeeting.backend.model.Meeting;
import com.aimeeting.backend.model.Task;
import com.aimeeting.backend.model.TranscriptChunk;
import com.aimeeting.backend.model.User;
import com.aimeeting.backend.repository.MeetingRepository;
import com.aimeeting.backend.repository.TaskRepository;
import com.aimeeting.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.concurrent.CompletableFuture;

@Service
public class MeetingService {

    @Autowired
    private MeetingRepository meetingRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Value("${app.ai-service.url}")
    private String aiServiceUrl;

    @Value("${app.n8n-webhook-url:}")
    private String n8nWebhookUrl;

    private final RestTemplate restTemplate = new RestTemplate();

    @Transactional
    public Meeting uploadAndProcessAudio(MultipartFile file, String customTitle, User hostUser) throws IOException {
        System.out.println("[DEBUG MeetingService] Starting uploadAndProcessAudio (Async). File: " + file.getOriginalFilename() + ", Size: " + file.getSize() + " bytes");
        
        // 1. Create a temporary file to store the upload bytes
        String originalFilename = file.getOriginalFilename();
        String extension = originalFilename.contains(".") ? originalFilename.substring(originalFilename.lastIndexOf(".")) : ".tmp";
        java.io.File tempFile = java.io.File.createTempFile("meeting-upload-", extension);
        file.transferTo(tempFile);
        
        // 2. Create and save a placeholder Meeting object with "PROCESSING" status
        String title = (customTitle != null && !customTitle.trim().isEmpty()) 
                ? customTitle.trim() 
                : originalFilename.replace(".mp3", "").replace(".wav", "");
        Meeting meeting = Meeting.builder()
                .title(title)
                .description("Processing meeting audio note...")
                .createdAt(LocalDateTime.now())
                .hostUser(hostUser)
                .status("PROCESSING")
                .transcript("")
                .summary("")
                .build();
        
        Meeting savedMeeting = meetingRepository.save(meeting);
        Long meetingId = savedMeeting.getId();
        Long userId = hostUser.getId();
        
        // 3. Spawn background execution
        CompletableFuture.runAsync(() -> {
            try {
                processAudioAsync(tempFile, meetingId, userId);
            } catch (Exception e) {
                System.err.println("Error in async audio processing trigger for meeting ID: " + meetingId);
                e.printStackTrace();
            }
        });
        
        return savedMeeting;
    }

    private void processAudioAsync(java.io.File tempFile, Long meetingId, Long userId) {
        System.out.println("[DEBUG MeetingService] Starting async processing for meeting ID: " + meetingId + " with temp file: " + tempFile.getAbsolutePath());
        TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
        
        try {
            // Prepare multipart request for FastAPI from the temp file
            org.springframework.util.LinkedMultiValueMap<String, Object> body = new org.springframework.util.LinkedMultiValueMap<>();
            org.springframework.core.io.FileSystemResource fileResource = new org.springframework.core.io.FileSystemResource(tempFile);
            body.add("file", fileResource);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);
            HttpEntity<MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);

            // Call FastAPI process endpoint
            String uploadUrl = aiServiceUrl + "/process/";
            System.out.println("[DEBUG MeetingService] Sending POST request to FastAPI: " + uploadUrl);
            ResponseEntity<FastApiProcessResponse> response = restTemplate.postForEntity(
                    uploadUrl, requestEntity, FastApiProcessResponse.class
            );
            System.out.println("[DEBUG MeetingService] FastAPI response status: " + response.getStatusCode());

            if (response.getStatusCode() != HttpStatus.OK || response.getBody() == null) {
                throw new RuntimeException("AI Service processing failed");
            }

            FastApiProcessResponse apiResponse = response.getBody();
            Map<String, Object> extracted = apiResponse.getExtracted_data();

            // Run DB operations inside transaction
            transactionTemplate.execute(status -> {
                User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
                Meeting meeting = meetingRepository.findById(meetingId).orElseThrow(() -> new RuntimeException("Meeting not found"));
                
                meeting.setTranscript(apiResponse.getTranscript());
                meeting.setSummary(apiResponse.getSummary());
                meeting.setMeetingDate((String) extracted.getOrDefault("meeting_date", ""));
                meeting.setStartTime((String) extracted.getOrDefault("start_time", ""));
                meeting.setEndTime((String) extracted.getOrDefault("end_time", ""));
                meeting.setTotalHours(String.valueOf(extracted.getOrDefault("total_hours", "")));
                meeting.setStatus("COMPLETED");
                meeting.setDescription("Processed audio meeting note");

                // Map chunks
                List<TranscriptChunk> chunks = new ArrayList<>();
                if (apiResponse.getChunks() != null) {
                    for (FastApiProcessResponse.ChunkDTO chunkDTO : apiResponse.getChunks()) {
                        chunks.add(TranscriptChunk.builder()
                                .meeting(meeting)
                                .text(chunkDTO.getText())
                                .chunkIndex(chunkDTO.getChunk_index())
                                .startTimestamp(chunkDTO.getStart_time())
                                .endTimestamp(chunkDTO.getEnd_time())
                                .build());
                    }
                }
                meeting.getChunks().clear();
                meeting.getChunks().addAll(chunks);

                // Map suggested tasks
                List<Task> tasks = new ArrayList<>();
                if (apiResponse.getTasks() != null) {
                    for (FastApiProcessResponse.SuggestedTaskDTO taskDTO : apiResponse.getTasks()) {
                        User assigned = null;
                        if (taskDTO.getAssigned_to() != null && !taskDTO.getAssigned_to().isEmpty()) {
                            List<User> users = userRepository.findAll();
                            for (User u : users) {
                                if (u.getName().equalsIgnoreCase(taskDTO.getAssigned_to())) {
                                    assigned = u;
                                    break;
                                }
                            }
                        }

                        tasks.add(Task.builder()
                                .meeting(meeting)
                                .title(taskDTO.getTitle())
                                .description(taskDTO.getDescription())
                                .status(Task.TaskStatus.TODO)
                                .assignedUser(assigned)
                                .isSuggested(true)
                                .suggestedUpdate(taskDTO.getSuggested_update())
                                .build());
                    }
                }
                meeting.getTasks().clear();
                meeting.getTasks().addAll(tasks);

                meetingRepository.save(meeting);
                return null;
            });

            // Call FastAPI /index/ endpoint to generate and save FAISS index
            try {
                Map<String, Object> indexPayload = new HashMap<>();
                indexPayload.put("meeting_id", meetingId);
                
                List<Map<String, Object>> chunkPayloads = new ArrayList<>();
                if (apiResponse.getChunks() != null) {
                    for (FastApiProcessResponse.ChunkDTO chunkDTO : apiResponse.getChunks()) {
                        Map<String, Object> cp = new HashMap<>();
                        cp.put("text", chunkDTO.getText());
                        cp.put("chunk_index", chunkDTO.getChunk_index());
                        cp.put("start_time", chunkDTO.getStart_time());
                        cp.put("end_time", chunkDTO.getEnd_time());
                        chunkPayloads.add(cp);
                    }
                }
                indexPayload.put("chunks", chunkPayloads);

                HttpHeaders jsonHeaders = new HttpHeaders();
                jsonHeaders.setContentType(MediaType.APPLICATION_JSON);
                HttpEntity<Map<String, Object>> jsonRequest = new HttpEntity<>(indexPayload, jsonHeaders);
                
                restTemplate.postForEntity(aiServiceUrl + "/index/", jsonRequest, Map.class);
            } catch (Exception e) {
                System.err.println("Failed to build vector index: " + e.getMessage());
            }

            // Create notification and push websocket
            transactionTemplate.execute(status -> {
                User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
                Meeting meeting = meetingRepository.findById(meetingId).orElseThrow(() -> new RuntimeException("Meeting not found"));
                notificationService.createNotification(user, meetingId, "Meeting '" + meeting.getTitle() + "' has been processed successfully!");
                return null;
            });

            // Send email notifications via FastAPI background worker
            try {
                Map<String, Object> emailPayload = new HashMap<>();
                emailPayload.put("name", extracted.getOrDefault("name", "Customer"));
                emailPayload.put("start_time", extracted.getOrDefault("start_time", ""));
                emailPayload.put("end_time", extracted.getOrDefault("end_time", ""));
                emailPayload.put("total_hours", String.valueOf(extracted.getOrDefault("total_hours", "")));
                emailPayload.put("meeting_date", extracted.getOrDefault("meeting_date", ""));
                emailPayload.put("note", apiResponse.getSummary()); // Use summary for meeting notes in email
                
                HttpHeaders jsonHeaders = new HttpHeaders();
                jsonHeaders.setContentType(MediaType.APPLICATION_JSON);
                HttpEntity<Map<String, Object>> jsonRequest = new HttpEntity<>(emailPayload, jsonHeaders);
                restTemplate.postForEntity(aiServiceUrl + "/notify/", jsonRequest, Map.class);
            } catch (Exception e) {
                System.err.println("Failed to trigger email notification: " + e.getMessage());
            }

            // Send summary to registered email via n8n webhook
            try {
                final String[] userEmail = {null};
                final String[] meetingTitle = {null};
                final String[] meetingDate = {null};
                final String[] summary = {null};
                
                transactionTemplate.execute(status -> {
                    User u = userRepository.findById(userId).orElse(null);
                    Meeting m = meetingRepository.findById(meetingId).orElse(null);
                    if (u != null && m != null) {
                        userEmail[0] = u.getEmail();
                        meetingTitle[0] = m.getTitle();
                        meetingDate[0] = m.getMeetingDate();
                        summary[0] = m.getSummary();
                    }
                    return null;
                });

                if (userEmail[0] != null && n8nWebhookUrl != null && !n8nWebhookUrl.isEmpty()) {
                    System.out.println("[DEBUG MeetingService] Sending transcription summary to n8n webhook: " + n8nWebhookUrl);
                    Map<String, Object> n8nPayload = new HashMap<>();
                    n8nPayload.put("email", userEmail[0]);
                    n8nPayload.put("meetingTitle", meetingTitle[0]);
                    n8nPayload.put("meetingDate", meetingDate[0]);
                    n8nPayload.put("summary", summary[0]);

                    HttpHeaders jsonHeaders = new HttpHeaders();
                    jsonHeaders.setContentType(MediaType.APPLICATION_JSON);
                    HttpEntity<Map<String, Object>> jsonRequest = new HttpEntity<>(n8nPayload, jsonHeaders);
                    
                    restTemplate.postForEntity(n8nWebhookUrl, jsonRequest, Map.class);
                    System.out.println("[DEBUG MeetingService] n8n summary notification sent successfully for user " + userEmail[0]);
                } else {
                    System.out.println("[DEBUG MeetingService] n8n Webhook URL is not configured or User email is null");
                }
            } catch (Exception e) {
                System.err.println("Failed to trigger n8n notification: " + e.getMessage());
            }

        } catch (Exception e) {
            System.err.println("Async processing failed for meeting ID: " + meetingId);
            e.printStackTrace();
            
            // Mark meeting as FAILED in DB and notify user
            transactionTemplate.execute(status -> {
                Meeting meeting = meetingRepository.findById(meetingId).orElse(null);
                if (meeting != null) {
                    meeting.setStatus("FAILED");
                    meeting.setDescription("Failed processing audio note: " + e.getMessage());
                    meetingRepository.save(meeting);
                }
                User user = userRepository.findById(userId).orElse(null);
                if (user != null && meeting != null) {
                    notificationService.createNotification(user, meetingId, "Failed to process meeting '" + meeting.getTitle() + "': " + e.getMessage());
                }
                return null;
            });
        } finally {
            // Delete the temporary file
            if (tempFile.exists()) {
                boolean deleted = tempFile.delete();
                System.out.println("[DEBUG MeetingService] Temp file deleted: " + deleted);
            }
        }
    }

    public List<Meeting> getAllMeetings() {
        return meetingRepository.findAllByOrderByCreatedAtDesc();
    }

    public List<Meeting> getAllMeetingsByUser(User user) {
        return meetingRepository.findByHostUserOrderByCreatedAtDesc(user);
    }

    public Meeting getMeetingById(Long id) {
        return meetingRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Meeting not found"));
    }

    public Meeting getMeetingByIdAndUser(Long id, User user) {
        Meeting meeting = meetingRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Meeting not found"));
        if (!meeting.getHostUser().getId().equals(user.getId())) {
            throw new SecurityException("Unauthorized access to meeting details");
        }
        return meeting;
    }

    public ChatAnswerResponse queryRagChatbot(Long id, String question) {
        // Query RAG pipeline on Python Service
        String ragUrl = aiServiceUrl + "/rag/";
        Map<String, Object> payload = new HashMap<>();
        payload.put("meeting_id", id);
        payload.put("question", question);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);

        try {
            ResponseEntity<ChatAnswerResponse> response = restTemplate.postForEntity(
                    ragUrl, entity, ChatAnswerResponse.class
            );
            return response.getBody();
        } catch (Exception e) {
            List<String> mockRef = new ArrayList<>();
            mockRef.add("Error querying AI service: " + e.getMessage());
            return new ChatAnswerResponse("I'm sorry, I couldn't reach the AI chatbot service right now. Please try again later.", mockRef);
        }
    }

    @Value("${app.bot-service.url:http://bot-service:8082}")
    private String botServiceUrl;

    @Transactional
    public Meeting createBotMeetingAndJoin(String url, String customTitle, String authHeader, User hostUser) {
        // 1. Create a placeholder meeting with RECORDING status
        String title = (customTitle != null && !customTitle.trim().isEmpty())
                ? customTitle.trim()
                : "Recorded Meeting (" + java.time.format.DateTimeFormatter.ofPattern("MMM dd").format(LocalDateTime.now()) + ")";
        
        Meeting meeting = Meeting.builder()
                .title(title)
                .description("Recording meeting audio...")
                .createdAt(LocalDateTime.now())
                .hostUser(hostUser)
                .status("RECORDING")
                .transcript("")
                .summary("")
                .build();
        
        Meeting saved = meetingRepository.save(meeting);
        
        // 2. Call the bot service to join the meeting in a separate thread/asynchronously
        CompletableFuture.runAsync(() -> {
            try {
                String joinUrl = botServiceUrl + "/bot/join";
                Map<String, Object> payload = new HashMap<>();
                payload.put("url", url);
                payload.put("meetingId", saved.getId());
                // Pass token from authorization header (extracting Bearer token)
                String token = authHeader.replace("Bearer ", "").trim();
                payload.put("token", token);

                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);

                restTemplate.postForEntity(joinUrl, entity, String.class);
            } catch (Exception e) {
                System.err.println("Error calling bot service to join: " + e.getMessage());
                e.printStackTrace();
                // Update meeting description with the error
                saved.setStatus("FAILED");
                saved.setDescription("Bot failed to join: " + e.getMessage());
                meetingRepository.save(saved);
                
                // Notify user of failure
                notificationService.createNotification(hostUser, saved.getId(), "Bot failed to join meeting: " + e.getMessage());
            }
        });

        return saved;
    }

    public void stopBotMeeting(Long meetingId) {
        // Call the bot service to stop recording
        CompletableFuture.runAsync(() -> {
            try {
                String stopUrl = botServiceUrl + "/bot/stop";
                Map<String, Object> payload = new HashMap<>();
                payload.put("meetingId", meetingId);

                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);

                restTemplate.postForEntity(stopUrl, entity, String.class);
            } catch (Exception e) {
                System.err.println("Error calling bot service to stop: " + e.getMessage());
                e.printStackTrace();
            }
        });
    }

    @Transactional
    public Meeting processUploadedAudioForMeeting(Long meetingId, MultipartFile file) throws IOException {
        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new IllegalArgumentException("Meeting not found"));
        
        // Save the file as a temp file
        String originalFilename = file.getOriginalFilename();
        String extension = originalFilename.contains(".") ? originalFilename.substring(originalFilename.lastIndexOf(".")) : ".tmp";
        java.io.File tempFile = java.io.File.createTempFile("meeting-bot-", extension);
        file.transferTo(tempFile);
        
        // Update meeting status
        meeting.setStatus("PROCESSING");
        meeting.setDescription("Processing recorded meeting audio...");
        Meeting saved = meetingRepository.save(meeting);
        
        // Trigger async processing
        CompletableFuture.runAsync(() -> {
            try {
                processAudioAsync(tempFile, meetingId, meeting.getHostUser().getId());
            } catch (Exception e) {
                System.err.println("Error in async audio processing trigger for meeting ID: " + meetingId);
                e.printStackTrace();
                saved.setStatus("FAILED");
                saved.setDescription("Failed to process meeting: " + e.getMessage());
                meetingRepository.save(saved);
            }
        });
        
        return saved;
    }
}
