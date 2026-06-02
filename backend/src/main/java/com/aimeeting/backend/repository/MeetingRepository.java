package com.aimeeting.backend.repository;

import com.aimeeting.backend.model.Meeting;
import com.aimeeting.backend.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface MeetingRepository extends JpaRepository<Meeting, Long> {
    List<Meeting> findByHostUserOrderByCreatedAtDesc(User hostUser);
    List<Meeting> findAllByOrderByCreatedAtDesc();
}
