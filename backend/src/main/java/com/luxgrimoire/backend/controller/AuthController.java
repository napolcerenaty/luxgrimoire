package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.AppUser;
import com.luxgrimoire.backend.service.UserStore;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.*;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "http://localhost:5173", allowCredentials = "true")
public class AuthController {

    private final UserStore userStore;

    @Value("${app.upload.dir:uploads}")
    private String uploadDir;

    public AuthController(UserStore userStore) {
        this.userStore = userStore;
    }

    // ── Login ──────────────────────────────────────────────────────────────
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body, HttpSession session) {
        String username = body.get("username");
        String password = body.get("password");
        if (username == null || password == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Missing credentials"));
        }
        if (!userStore.authenticate(username, password)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid username or password"));
        }
        session.setAttribute("username", username);
        return ResponseEntity.ok(toDto(userStore.findByUsername(username).get()));
    }

    // ── Logout ─────────────────────────────────────────────────────────────
    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpSession session) {
        session.invalidate();
        return ResponseEntity.ok(Map.of("message", "Logged out"));
    }

    // ── Current user ───────────────────────────────────────────────────────
    @GetMapping("/me")
    public ResponseEntity<?> me(HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (username == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Not authenticated"));
        }
        return userStore.findByUsername(username)
                .map(u -> ResponseEntity.ok(toDto(u)))
                .orElse(ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "User not found")));
    }

    // ── Update profile ─────────────────────────────────────────────────────
    @PutMapping("/profile")
    public ResponseEntity<?> updateProfile(@RequestBody Map<String, String> body, HttpSession session) {
        String username = (String) session.getAttribute("username");
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

    // ── Update settings (kept for backward compat) ─────────────────────────
    @PutMapping("/settings")
    public ResponseEntity<?> updateSettings(@RequestBody Map<String, String> body, HttpSession session) {
        String username = (String) session.getAttribute("username");
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

    // ── Upload avatar ──────────────────────────────────────────────────────
    @PostMapping("/avatar")
    public ResponseEntity<?> uploadAvatar(@RequestParam("file") MultipartFile file, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (username == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Not authenticated"));
        }
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No file provided"));
        }

        String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "avatar";
        String ext = originalName.contains(".") ? originalName.substring(originalName.lastIndexOf('.')) : ".jpg";
        String filename = username + "_" + UUID.randomUUID().toString().substring(0, 8) + ext;

        try {
            Path dir = Paths.get(uploadDir, "avatars");
            Files.createDirectories(dir);
            Path dest = dir.resolve(filename);
            Files.copy(file.getInputStream(), dest, StandardCopyOption.REPLACE_EXISTING);

            String avatarUrl = "/uploads/avatars/" + filename;
            Optional<AppUser> opt = userStore.findByUsername(username);
            if (opt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found"));
            }
            AppUser user = opt.get();

            // Delete old avatar file if present
            if (user.getAvatarUrl() != null && !user.getAvatarUrl().isBlank()) {
                try {
                    Path oldFile = Paths.get(uploadDir + user.getAvatarUrl().replace("/uploads", ""));
                    Files.deleteIfExists(oldFile);
                } catch (Exception ignored) {}
            }

            user.setAvatarUrl(avatarUrl);
            userStore.save(user);
            return ResponseEntity.ok(toDto(user));
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to save file: " + e.getMessage()));
        }
    }

    // ── Helper ─────────────────────────────────────────────────────────────
    private Map<String, Object> toDto(AppUser u) {
        Map<String, Object> dto = new HashMap<>();
        dto.put("username",  u.getUsername());
        dto.put("firstName", u.getFirstName());
        dto.put("lastName",  u.getLastName());
        dto.put("timezone",  u.getTimezone());
        dto.put("avatarUrl", u.getAvatarUrl() != null ? u.getAvatarUrl() : "");
        return dto;
    }
}
