package com.aimeeting.backend.service;

import com.aimeeting.backend.model.Task;
import com.aimeeting.backend.model.User;
import com.aimeeting.backend.repository.TaskRepository;
import com.aimeeting.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class TaskService {

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private NotificationService notificationService;

    public Task createTask(Task task) {
        if (task.getStatus() == null) {
            task.setStatus(Task.TaskStatus.TODO);
        }
        if (task.getAssignedUser() != null && task.getAssignedUser().getId() != null) {
            User user = userRepository.findById(task.getAssignedUser().getId())
                    .orElseThrow(() -> new IllegalArgumentException("User not found"));
            task.setAssignedUser(user);
        }
        Task saved = taskRepository.save(task);
        if (saved.getAssignedUser() != null) {
            notificationService.createNotification(saved.getAssignedUser(), "You have been assigned a new task: " + saved.getTitle());
        }
        return saved;
    }

    public List<Task> getTasksForUser(User user) {
        return taskRepository.findByAssignedUser(user);
    }

    public List<Task> getAllTasks() {
        return taskRepository.findAll();
    }

    public Task getTaskById(Long id) {
        return taskRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Task not found"));
    }

    public Task assignTask(Long taskId, Long userId) {
        Task task = getTaskById(taskId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        task.setAssignedUser(user);
        Task saved = taskRepository.save(task);
        notificationService.createNotification(user, "You have been assigned a task: " + task.getTitle());
        return saved;
    }

    public Task updateTaskStatus(Long taskId, Task.TaskStatus status) {
        Task task = getTaskById(taskId);
        task.setStatus(status);
        Task saved = taskRepository.save(task);
        if (saved.getAssignedUser() != null) {
            notificationService.createNotification(saved.getAssignedUser(), "Task status updated: " + task.getTitle() + " is now " + status);
        }
        return saved;
    }

    public Task acceptTaskSuggestion(Long taskId) {
        Task task = getTaskById(taskId);
        String suggestion = task.getSuggestedUpdate();
        if (suggestion != null && suggestion.contains("->")) {
            String[] parts = suggestion.split("->");
            if (parts.length == 2) {
                String statusStr = parts[1].trim().toUpperCase().replace(" ", "_");
                try {
                    Task.TaskStatus newStatus = Task.TaskStatus.valueOf(statusStr);
                    task.setStatus(newStatus);
                } catch (IllegalArgumentException e) {
                    // fall back to mapping
                    if (statusStr.contains("COMPLET")) {
                        task.setStatus(Task.TaskStatus.COMPLETED);
                    } else if (statusStr.contains("PROGRESS")) {
                        task.setStatus(Task.TaskStatus.IN_PROGRESS);
                    } else {
                        task.setStatus(Task.TaskStatus.TODO);
                    }
                }
            }
        }
        task.setSuggestedUpdate(null);
        Task saved = taskRepository.save(task);
        if (saved.getAssignedUser() != null) {
            notificationService.createNotification(saved.getAssignedUser(), "AI task suggestion accepted for: " + task.getTitle());
        }
        return saved;
    }

    public Task rejectTaskSuggestion(Long taskId) {
        Task task = getTaskById(taskId);
        task.setSuggestedUpdate(null);
        return taskRepository.save(task);
    }

    public Task acceptNewTask(Long id) {
        Task task = getTaskById(id);
        task.setIsSuggested(false);
        return taskRepository.save(task);
    }

    public void deleteTask(Long id) {
        Task task = getTaskById(id);
        taskRepository.delete(task);
    }
}
