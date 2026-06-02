package com.aimeeting.backend.service;

import com.aimeeting.backend.model.Notification;
import com.aimeeting.backend.model.User;
import com.aimeeting.backend.repository.NotificationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class NotificationService {

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    public Notification createNotification(User user, String message) {
        return createNotification(user, null, message);
    }

    public Notification createNotification(User user, Long meetingId, String message) {
        Notification notification = Notification.builder()
                .user(user)
                .meetingId(meetingId)
                .message(message)
                .isRead(false)
                .createdAt(LocalDateTime.now())
                .build();
        Notification saved = notificationRepository.save(notification);

        // Send real-time notification to user over WebSockets
        messagingTemplate.convertAndSendToUser(
                user.getEmail(),
                "/queue/notifications",
                saved
        );
        return saved;
    }

    public List<Notification> getNotificationsForUser(User user) {
        return notificationRepository.findByUserOrderByCreatedAtDesc(user);
    }

    public List<Notification> getUnreadNotificationsForUser(User user) {
        return notificationRepository.findByUserAndIsReadOrderByCreatedAtDesc(user, false);
    }

    public Notification markAsRead(Long notificationId) {
        Notification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new IllegalArgumentException("Notification not found"));
        notification.setRead(true);
        return notificationRepository.save(notification);
    }
}
