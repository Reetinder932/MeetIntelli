package com.aimeeting.backend.controller;

import com.aimeeting.backend.model.Task;
import com.aimeeting.backend.model.User;
import com.aimeeting.backend.repository.UserRepository;
import com.aimeeting.backend.security.UserPrincipal;
import com.aimeeting.backend.service.TaskService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    @Autowired
    private TaskService taskService;

    @Autowired
    private UserRepository userRepository;

    @PostMapping
    public ResponseEntity<Task> createTask(@RequestBody Task task) {
        return ResponseEntity.ok(taskService.createTask(task));
    }

    @GetMapping
    public ResponseEntity<List<Task>> getTasks(
            @RequestParam(value = "my", required = false, defaultValue = "false") boolean myTasks,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        if (myTasks) {
            User user = userRepository.findById(userPrincipal.getId()).orElseThrow();
            return ResponseEntity.ok(taskService.getTasksForUser(user));
        }
        return ResponseEntity.ok(taskService.getAllTasks());
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<Task> updateStatus(
            @PathVariable Long id,
            @RequestParam("status") Task.TaskStatus status) {
        return ResponseEntity.ok(taskService.updateTaskStatus(id, status));
    }

    @PutMapping("/{id}/assign")
    public ResponseEntity<Task> assignTask(
            @PathVariable Long id,
            @RequestParam("userId") Long userId) {
        return ResponseEntity.ok(taskService.assignTask(id, userId));
    }

    @PostMapping("/{id}/accept")
    public ResponseEntity<Task> acceptSuggestion(@PathVariable Long id) {
        return ResponseEntity.ok(taskService.acceptTaskSuggestion(id));
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<Task> rejectSuggestion(@PathVariable Long id) {
        return ResponseEntity.ok(taskService.rejectTaskSuggestion(id));
    }

    @PostMapping("/{id}/accept-new")
    public ResponseEntity<Task> acceptNewTask(@PathVariable Long id) {
        return ResponseEntity.ok(taskService.acceptNewTask(id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTask(@PathVariable Long id) {
        taskService.deleteTask(id);
        return ResponseEntity.noContent().build();
    }
}
