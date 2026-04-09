package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.AppUser;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class UserStore {

    private final Map<String, AppUser> users = new ConcurrentHashMap<>();

    public UserStore() {
        users.put("admin", new AppUser("admin", "admin", "Admin", "User",     "Europe/Warsaw"));
        users.put("user1", new AppUser("user1", "user1", "Jan",   "Kowalski", "Europe/Warsaw"));
    }

    public Optional<AppUser> findByUsername(String username) {
        return Optional.ofNullable(users.get(username));
    }

    public boolean authenticate(String username, String password) {
        return findByUsername(username)
                .map(u -> u.getPassword().equals(password))
                .orElse(false);
    }
}
