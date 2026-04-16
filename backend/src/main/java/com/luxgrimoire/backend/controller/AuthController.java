package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.dto.UserDto;
import com.luxgrimoire.backend.model.AppUser;
import com.luxgrimoire.backend.model.PasswordResetToken;
import com.luxgrimoire.backend.repository.PasswordResetTokenRepository;
import com.luxgrimoire.backend.service.EmailService;
import com.luxgrimoire.backend.service.FileStorageService;
import com.luxgrimoire.backend.service.UserStore;
import com.luxgrimoire.backend.util.AppConstants;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserStore userStore;
    private final FileStorageService fileStorageService;
    private final EmailService emailService;
    private final PasswordResetTokenRepository resetTokenRepo;

    public AuthController(UserStore userStore,
                          FileStorageService fileStorageService,
                          EmailService emailService,
                          PasswordResetTokenRepository resetTokenRepo) {
        this.userStore         = userStore;
        this.fileStorageService = fileStorageService;
        this.emailService      = emailService;
        this.resetTokenRepo    = resetTokenRepo;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> body, HttpSession session) {
        String username  = body.get("username");
        String email     = body.get("email");
        String password  = body.get("password");
        String firstName = body.getOrDefault("firstName", "");
        String lastName  = body.getOrDefault("lastName", "");

        if (username == null || username.isBlank())  return ResponseEntity.badRequest().body(Map.of("error", "Username is required"));
        if (email == null || !email.contains("@"))   return ResponseEntity.badRequest().body(Map.of("error", "Valid email is required"));
        if (password == null || password.length() < 6) return ResponseEntity.badRequest().body(Map.of("error", "Password must be at least 6 characters"));

        // Sanitise username: lowercase, only letters/digits/underscores/hyphens
        String sanitised = username.trim().toLowerCase().replaceAll("[^a-z0-9_\\-]", "");
        if (sanitised.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Username contains no valid characters"));

        try {
            AppUser user = userStore.register(sanitised, email.trim().toLowerCase(), password, firstName, lastName);
            session.setAttribute(AppConstants.SESSION_USERNAME, user.getUsername());
            session.setAttribute(AppConstants.SESSION_ROLE, user.getRole());
            session.setAttribute(AppConstants.SESSION_PERMISSIONS, user.getAdminPermissions() != null ? user.getAdminPermissions() : "");
            session.setAttribute(AppConstants.SESSION_MANAGED_COMPANY, user.getManagedCompanyId() != null ? user.getManagedCompanyId() : "");
            emailService.sendWelcome(user.getEmail(), user.getUsername(), user.getFirstName());
            return ResponseEntity.ok(toDto(user));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
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
        session.setAttribute(AppConstants.SESSION_PERMISSIONS, user.getAdminPermissions() != null ? user.getAdminPermissions() : "");
        session.setAttribute(AppConstants.SESSION_MANAGED_COMPANY, user.getManagedCompanyId() != null ? user.getManagedCompanyId() : "");
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

    // ── Password reset ────────────────────────────────────────────────────────

    @PostMapping("/forgot-password")
    @Transactional
    public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email == null || email.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));

        // Always return OK to not reveal if email exists
        userStore.findByEmail(email.trim().toLowerCase()).ifPresent(user -> {
            // Invalidate old tokens by marking used
            resetTokenRepo.deleteExpiredAndUsed(Instant.now());

            String rawToken = generateToken();
            PasswordResetToken token = new PasswordResetToken(
                rawToken, user.getUsername(), Instant.now().plus(24, ChronoUnit.HOURS)
            );
            resetTokenRepo.save(token);
            emailService.sendPasswordReset(user.getEmail(), user.getUsername(), rawToken);
        });

        return ResponseEntity.ok(Map.of("message", "If the account exists, we have sent a password reset link."));
    }

    @PostMapping("/reset-password")
    @Transactional
    public ResponseEntity<?> resetPassword(@RequestBody Map<String, String> body) {
        String token       = body.get("token");
        String newPassword = body.get("password");

        if (token == null || token.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "Token is required"));
        if (newPassword == null || newPassword.length() < 6)
            return ResponseEntity.badRequest().body(Map.of("error", "Password must be at least 6 characters"));

        PasswordResetToken prt = resetTokenRepo.findById(token).orElse(null);
        if (prt == null || !prt.isValid())
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "Token has expired or is invalid."));

        Optional<AppUser> userOpt = userStore.findByUsername(prt.getUsername());
        if (userOpt.isEmpty())
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found"));

        AppUser user = userOpt.get();
        user.setPassword(newPassword);
        userStore.save(user);

        prt.setUsed(true);
        resetTokenRepo.save(prt);

        return ResponseEntity.ok(Map.of("message", "Password has been changed. You can now log in."));
    }

    private String generateToken() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    UserDto toDto(AppUser u) {
        return new UserDto(
                u.getUsername(),
                u.getFirstName(),
                u.getLastName(),
                u.getTimezone(),
                u.getAvatarUrl() != null ? u.getAvatarUrl() : "",
                u.getEmail() != null ? u.getEmail() : "",
                u.getRole() != null ? u.getRole() : "user",
                u.getAdminPermissions() != null ? u.getAdminPermissions() : "",
                u.getManagedCompanyId() != null ? u.getManagedCompanyId() : "",
                u.isLibraryPublic(),
                u.isMessagingPrivate(),
                u.isFavoritesPublic(),
                u.getBioPublic() != null ? u.getBioPublic() : "",
                u.getGoodreadsUrl() != null ? u.getGoodreadsUrl() : "",
                u.getStorygraphUrl() != null ? u.getStorygraphUrl() : "",
                u.getInstagramUrl() != null ? u.getInstagramUrl() : "",
                u.getTwitterUrl() != null ? u.getTwitterUrl() : "",
                u.getProfilePrivacy() != null ? u.getProfilePrivacy() : "PUBLIC",
                u.getCollectionPrivacy() != null ? u.getCollectionPrivacy() : "FRIENDS",
                u.getIsoPrivacy() != null ? u.getIsoPrivacy() : "FRIENDS",
                u.getInterestedPrivacy() != null ? u.getInterestedPrivacy() : "FOLLOWERS",
                u.getSubscriptionsPrivacy() != null ? u.getSubscriptionsPrivacy() : "PRIVATE",
                u.getFavoritesPrivacy() != null ? u.getFavoritesPrivacy() : "PUBLIC"
        );
    }
}
