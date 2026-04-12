package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.AppUser;
import com.luxgrimoire.backend.repository.AppUserRepository;
import com.luxgrimoire.backend.util.AppConstants;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final AppUserRepository userRepository;

    public UserController(AppUserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/search")
    public ResponseEntity<?> searchUsers(@RequestParam String q, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        if (q == null || q.trim().length() < 2) return ResponseEntity.ok(List.of());
        List<AppUser> found = userRepository.searchByUsername(q.trim().toLowerCase(), me);
        return ResponseEntity.ok(found.stream().map(u -> Map.of(
            "username", u.getUsername(),
            "firstName", u.getFirstName() != null ? u.getFirstName() : "",
            "lastName", u.getLastName() != null ? u.getLastName() : "",
            "avatarUrl", u.getAvatarUrl() != null ? u.getAvatarUrl() : "",
            "libraryPublic", u.isLibraryPublic()
        )).toList());
    }

    @GetMapping("/{username}/profile")
    public ResponseEntity<?> getUserProfile(@PathVariable String username, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        return userRepository.findById(username)
            .map(u -> ResponseEntity.ok((Object) Map.of(
                "username", u.getUsername(),
                "firstName", u.getFirstName() != null ? u.getFirstName() : "",
                "lastName", u.getLastName() != null ? u.getLastName() : "",
                "avatarUrl", u.getAvatarUrl() != null ? u.getAvatarUrl() : "",
                "libraryPublic", u.isLibraryPublic()
            )))
            .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/me/privacy")
    public ResponseEntity<?> updatePrivacy(@RequestBody Map<String, Boolean> body, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        userRepository.findById(me).ifPresent(u -> {
            if (body.containsKey("libraryPublic")) {
                u.setLibraryPublic(body.get("libraryPublic"));
                userRepository.save(u);
            }
        });
        return ResponseEntity.ok().build();
    }
}
