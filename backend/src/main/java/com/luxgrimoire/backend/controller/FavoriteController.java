package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.UserFavoriteAuthor;
import com.luxgrimoire.backend.model.UserFavoriteEdition;
import com.luxgrimoire.backend.repository.UserFavoriteAuthorRepository;
import com.luxgrimoire.backend.repository.UserFavoriteEditionRepository;
import com.luxgrimoire.backend.util.AppConstants;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/favorites")
public class FavoriteController {

    private final UserFavoriteEditionRepository favEditionRepo;
    private final UserFavoriteAuthorRepository favAuthorRepo;

    public FavoriteController(UserFavoriteEditionRepository favEditionRepo,
                              UserFavoriteAuthorRepository favAuthorRepo) {
        this.favEditionRepo = favEditionRepo;
        this.favAuthorRepo = favAuthorRepo;
    }

    // ── Favorite editions ──────────────────────────────────────────────────

    @GetMapping("/editions")
    public ResponseEntity<?> getFavoriteEditions(HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        return ResponseEntity.ok(favEditionRepo.findByUsernameOrderByAddedAtDesc(username));
    }

    @PostMapping("/editions/{editionId}")
    public ResponseEntity<?> addFavoriteEdition(@PathVariable String editionId, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        if (favEditionRepo.existsByUsernameAndEditionId(username, editionId))
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Already favorited"));
        UserFavoriteEdition fav = new UserFavoriteEdition();
        fav.setUsername(username);
        fav.setEditionId(editionId);
        return ResponseEntity.status(HttpStatus.CREATED).body(favEditionRepo.save(fav));
    }

    @DeleteMapping("/editions/{editionId}")
    @Transactional
    public ResponseEntity<?> removeFavoriteEdition(@PathVariable String editionId, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        if (!favEditionRepo.existsByUsernameAndEditionId(username, editionId))
            return ResponseEntity.notFound().build();
        favEditionRepo.deleteByUsernameAndEditionId(username, editionId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/editions/{editionId}/status")
    public Map<String, Boolean> getEditionFavoriteStatus(@PathVariable String editionId, HttpSession session) {
        String username = resolveUsername(session);
        boolean favorited = username != null && favEditionRepo.existsByUsernameAndEditionId(username, editionId);
        return Map.of("favorited", favorited);
    }

    // ── Favorite authors ───────────────────────────────────────────────────

    @GetMapping("/authors")
    public ResponseEntity<?> getFavoriteAuthors(HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        return ResponseEntity.ok(favAuthorRepo.findByUsernameOrderByAddedAtDesc(username));
    }

    @PostMapping("/authors/{authorId}")
    public ResponseEntity<?> addFavoriteAuthor(@PathVariable String authorId, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        if (favAuthorRepo.existsByUsernameAndAuthorId(username, authorId))
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Already favorited"));
        UserFavoriteAuthor fav = new UserFavoriteAuthor();
        fav.setUsername(username);
        fav.setAuthorId(authorId);
        return ResponseEntity.status(HttpStatus.CREATED).body(favAuthorRepo.save(fav));
    }

    @DeleteMapping("/authors/{authorId}")
    @Transactional
    public ResponseEntity<?> removeFavoriteAuthor(@PathVariable String authorId, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        if (!favAuthorRepo.existsByUsernameAndAuthorId(username, authorId))
            return ResponseEntity.notFound().build();
        favAuthorRepo.deleteByUsernameAndAuthorId(username, authorId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/authors/{authorId}/status")
    public Map<String, Boolean> getAuthorFavoriteStatus(@PathVariable String authorId, HttpSession session) {
        String username = resolveUsername(session);
        boolean favorited = username != null && favAuthorRepo.existsByUsernameAndAuthorId(username, authorId);
        return Map.of("favorited", favorited);
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private String resolveUsername(HttpSession session) {
        return (String) session.getAttribute(AppConstants.SESSION_USERNAME);
    }

    private ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not authenticated"));
    }
}
