package com.aimeeting.backend.service;

import com.aimeeting.backend.model.Team;
import com.aimeeting.backend.model.User;
import com.aimeeting.backend.repository.TeamRepository;
import com.aimeeting.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class TeamService {

    @Autowired
    private TeamRepository teamRepository;

    @Autowired
    private UserRepository userRepository;

    public List<Team> getAllTeams() {
        return teamRepository.findAll();
    }

    public Team getTeamById(Long id) {
        return teamRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Team not found"));
    }

    public Team createTeam(String name, String description, User creator) {
        Team team = Team.builder()
                .name(name)
                .description(description)
                .members(new java.util.HashSet<>())
                .build();
        team.getMembers().add(creator);
        return teamRepository.save(team);
    }

    public Team joinTeam(Long teamId, User user) {
        Team team = getTeamById(teamId);
        team.getMembers().add(user);
        return teamRepository.save(team);
    }

    public Team leaveTeam(Long teamId, User user) {
        Team team = getTeamById(teamId);
        team.getMembers().removeIf(u -> u.getId().equals(user.getId()));
        return teamRepository.save(team);
    }
}
