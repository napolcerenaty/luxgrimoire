package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.dto.UserDto;
import com.luxgrimoire.backend.model.AppUser;
import com.luxgrimoire.backend.service.FileStorageService;
import com.luxgrimoire.backend.service.UserStore;
import com.luxgrimoire.backend.util.AppConstants;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserStore userStore;
    private final FileStorageService fileStorageService;

    public AuthController(UserStore userStore, FileStorageService fileStorageService) {
        this.userStore = userStore;
        this.fileStorageService = fileStorageService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body, HttpSession session) {
        String loginId = body.getOrDefault("email", body.get(AppConstants.SESSION_USERNAME));
        String password = body.get("password");
        if (loginId == null || password == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Missing credentials"));
        }
        if (!userStore.authenticate(loginId, password)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid email or password"));
        }
        AppUser user = userStore.findByLoginId(loginId).get();
        session.setAttribute(AppConstants.SESSION_USERNAME, user.getUsername());
        session.setAttribute(AppConstants.SESSION_ROLE, user.getRole());
        return ResponseEntity.ok(toDto(user));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpSession session) {
        session.invalidate();
        return ResponseEntity.ok(Map.of("message", "Logged out"));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Not authenticated"));
        }
        return userStore.findByUsername(username)
                .<ResponseEntity<?>>map(u -> ResponseEntity.ok(toDto(u)))
                .orElse(ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "User not found")));
    }

    @PutMapping("/profile")
    public ResponseEntity<?> updateProfile(@RequestBody Map<String, String> body, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Not authenticated"));
        }
        Optional<AppUser> opt = userStore.findByUsername(username);
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found"));
        }
        AppUser user = opt.get();
        if (body.containsKey("firstName")) user.setFirstName(body.get("firstName"));
        if (body.containsKey("lastName"))  user.setLastName(body.get("lastName"));
        if (body.containsKey("timezone"))  user.setTimezone(body.get("timezone"));
        userStore.save(user);
        return ResponseEntity.ok(toDto(user));
    }

    @PutMapping("/settings")
    public ResponseEntity<?> updateSettings(@RequestBody Map<String, String> body, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Not authenticated"));
        }
        Optional<AppUser> opt = userStore.findByUsername(username);
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found"));
        }
        AppUser user = opt.get();
        if (body.containsKey("timezone")) user.setTimezone(body.get("timezone"));
        userStore.save(user);
        return ResponseEntity.ok(toDto(user));
    }

    @PostMapping("/avatar")
    public ResponseEntity<?> uploadAvatar(@RequestParam("file") MultipartFile file, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Not authenticated"));
        }
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No file provided"));
        }
        Optional<AppUser> opt = userStore.findByUsername(username);
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found"));
        }
        AppUser user = opt.get();
        try {
            fileStorageService.deleteIfExists(user.getAvatarUrl());
            String avatarUrl = fileStorageService.storeAvatar(username, file);
            user.setAvatarUrl(avatarUrl);
            userStore.save(user);
            return ResponseEntity.ok(toDto(user));
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to save file: " + e.getMessage()));
        }
    }

    private UserDto toDto(AppUser u) {
        return new UserDto(
                u.getUsername(),
                u.getFirstName(),
                u.getLastName(),
                u.getTimezone(),
                u.getAvatarUrl() != null ? u.getAvatarUrl() : "",
                u.getEmail() != null ? u.getEmail() : "",
                u.getRole() != null ? u.getRole() : "user"
        );
    }
}
