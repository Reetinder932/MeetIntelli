package com.aimeeting.backend.repository;

import com.aimeeting.backend.model.Meeting;
import com.aimeeting.backend.model.Task;
import com.aimeeting.backend.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface TaskRepository extends JpaRepository<Task, Long> {
    List<Task> findByMeeting(Meeting meeting);
    List<Task> findByAssignedUser(User user);
}
