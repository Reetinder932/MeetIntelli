package com.aimeeting.backend.repository;

import com.aimeeting.backend.model.Message;
import com.aimeeting.backend.model.Room;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface MessageRepository extends JpaRepository<Message, Long> {
    List<Message> findByRoomOrderByTimestampAsc(Room room);
}
