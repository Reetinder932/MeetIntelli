package com.aimeeting.backend.service;

import com.aimeeting.backend.dto.MessageDTO;
import com.aimeeting.backend.model.Message;
import com.aimeeting.backend.model.Room;
import com.aimeeting.backend.model.User;
import com.aimeeting.backend.repository.MessageRepository;
import com.aimeeting.backend.repository.RoomRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class ChatService {

    @Autowired
    private RoomRepository roomRepository;

    @Autowired
    private MessageRepository messageRepository;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    public Room createRoom(String name, String description, User creator) {
        Optional<Room> existing = roomRepository.findByName(name);
        if (existing.isPresent()) {
            Room room = existing.get();
            room.getMembers().add(creator);
            return roomRepository.save(room);
        }
        Room room = Room.builder()
                .name(name)
                .description(description)
                .createdAt(LocalDateTime.now())
                .build();
        room.getMembers().add(creator);
        return roomRepository.save(room);
    }

    @Transactional
    public Room joinRoom(Long roomId, User user) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new IllegalArgumentException("Room not found"));
        room.getMembers().add(user);
        Room saved = roomRepository.save(savedMessage(room, user, "joined the room", MessageDTO.MessageType.JOIN));
        return saved;
    }

    @Transactional
    public Room leaveRoom(Long roomId, User user) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new IllegalArgumentException("Room not found"));
        room.getMembers().remove(user);
        Room saved = roomRepository.save(savedMessage(room, user, "left the room", MessageDTO.MessageType.LEAVE));
        return saved;
    }

    private Room savedMessage(Room room, User user, String text, MessageDTO.MessageType type) {
        Message message = Message.builder()
                .room(room)
                .sender(user)
                .messageText(text)
                .timestamp(LocalDateTime.now())
                .build();
        messageRepository.save(message);

        MessageDTO dto = new MessageDTO(
                message.getId(),
                room.getId(),
                user.getId(),
                user.getName(),
                text,
                null,
                null,
                LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                type
        );
        messagingTemplate.convertAndSend("/topic/rooms/" + room.getId(), dto);
        return room;
    }

    public Message sendMessage(Long roomId, User sender, String messageText) {
        return sendMessage(roomId, sender, messageText, null, null);
    }

    public Message sendMessage(Long roomId, User sender, String messageText, String mediaUrl, String mediaType) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new IllegalArgumentException("Room not found"));
        
        Message message = Message.builder()
                .room(room)
                .sender(sender)
                .messageText(messageText)
                .mediaUrl(mediaUrl)
                .mediaType(mediaType)
                .timestamp(LocalDateTime.now())
                .build();
        Message saved = messageRepository.save(message);

        MessageDTO dto = new MessageDTO(
                saved.getId(),
                room.getId(),
                sender.getId(),
                sender.getName(),
                messageText,
                mediaUrl,
                mediaType,
                saved.getTimestamp().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                MessageDTO.MessageType.CHAT
        );
        messagingTemplate.convertAndSend("/topic/rooms/" + roomId, dto);
        return saved;
    }

    public void sendTypingIndicator(Long roomId, User sender, boolean isTyping) {
        MessageDTO dto = new MessageDTO(
                null,
                roomId,
                sender.getId(),
                sender.getName(),
                isTyping ? "typing" : "stopped",
                null,
                null,
                LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                MessageDTO.MessageType.TYPING
        );
        messagingTemplate.convertAndSend("/topic/rooms/" + roomId, dto);
    }

    public List<MessageDTO> getHistory(Long roomId) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new IllegalArgumentException("Room not found"));
        return messageRepository.findByRoomOrderByTimestampAsc(room).stream()
                .map(m -> new MessageDTO(
                        m.getId(),
                        room.getId(),
                        m.getSender().getId(),
                        m.getSender().getName(),
                        m.getMessageText(),
                        m.getMediaUrl(),
                        m.getMediaType(),
                        m.getTimestamp().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                        MessageDTO.MessageType.CHAT
                )).collect(Collectors.toList());
    }

    public List<Room> getAllRooms() {
        return roomRepository.findAll();
    }

    public List<Room> getRoomsForUser(User user) {
        return roomRepository.findByMembersContaining(user);
    }
}
