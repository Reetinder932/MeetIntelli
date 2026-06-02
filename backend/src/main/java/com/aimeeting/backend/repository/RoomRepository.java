package com.aimeeting.backend.repository;

import com.aimeeting.backend.model.Room;
import com.aimeeting.backend.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface RoomRepository extends JpaRepository<Room, Long> {
    Optional<Room> findByName(String name);
    List<Room> findByMembersContaining(User user);
}
