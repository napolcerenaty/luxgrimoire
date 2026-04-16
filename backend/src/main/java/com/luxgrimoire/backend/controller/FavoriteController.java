package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.*;
import com.luxgrimoire.backend.repository.*;
import com.luxgrimoire.backend.util.AppConstants;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/favorites")
public class FavoriteController {

    private final UserFavoriteEditionRepository  favEditionRepo;
    private final UserFavoriteAuthorRepository   favAuthorRepo;
    private final UserFavoriteBookRepository     favBookRepo;
    private final UserFavoriteArtistRepository   favArtistRepo;
    private final UserFavoriteCompanyRepository  favCompanyRepo;

    public FavoriteController(UserFavoriteEditionRepository favEditionRepo,
                              UserFavoriteAuthorRepository favAuthorRepo,
                              UserFavoriteBookRepository favBookRepo,
                              UserFavoriteArtistRepository favArtistRepo,
                              UserFavoriteCompanyRepository favCompanyRepo) {
        this.favEditionRepo  = favEditionRepo;
        this.favAuthorRepo   = favAuthorRepo;
        this.favBookRepo     = favBookRepo;
        this.favArtistRepo   = favArtistRepo;
        this.favCompanyRepo  = favCompanyRepo;
    }

    // ── Editions ───────────────────────────────────────────────────────────

    @GetMapping("/editions")
    public ResponseEntity<?> getFavoriteEditions(HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        return ResponseEntity.ok(favEditionRepo.findByUsernameOrderByAddedAtDesc(u));
    }

    @PostMapping("/editions/{id}")
    public ResponseEntity<?> addFavoriteEdition(@PathVariable String id, HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        if (favEditionRepo.existsByUsernameAndEditionId(u, id))
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Already favorited"));
        UserFavoriteEdition fav = new UserFavoriteEdition();
        fav.setUsername(u);
        fav.setEditionId(id);
        return ResponseEntity.status(HttpStatus.CREATED).body(favEditionRepo.save(fav));
    }

    @DeleteMapping("/editions/{id}")
    @Transactional
    public ResponseEntity<?> removeFavoriteEdition(@PathVariable String id, HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        if (!favEditionRepo.existsByUsernameAndEditionId(u, id)) return ResponseEntity.notFound().build();
        favEditionRepo.deleteByUsernameAndEditionId(u, id);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/editions/{id}/notify")
    public ResponseEntity<?> toggleEditionNotify(@PathVariable String id, @RequestBody Map<String, Boolean> body,
                                                 HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        return favEditionRepo.findByUsernameAndEditionId(u, id).map(fav -> {
            fav.setNotify(Boolean.TRUE.equals(body.get("notify")));
            return ResponseEntity.ok(favEditionRepo.save(fav));
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/editions/{id}/status")
    public Map<String, Object> getEditionStatus(@PathVariable String id, HttpSession session) {
        String u = resolveUsername(session);
        boolean favorited = u != null && favEditionRepo.existsByUsernameAndEditionId(u, id);
        boolean notify = favorited && favEditionRepo.findByUsernameAndEditionId(u, id)
                .map(UserFavoriteEdition::isNotify).orElse(false);
        return Map.of("favorited", favorited, "notify", notify, "count", favEditionRepo.countByEditionId(id));
    }

    // ── Authors ────────────────────────────────────────────────────────────

    @GetMapping("/authors")
    public ResponseEntity<?> getFavoriteAuthors(HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        return ResponseEntity.ok(favAuthorRepo.findByUsernameOrderByAddedAtDesc(u));
    }

    @PostMapping("/authors/{id}")
    public ResponseEntity<?> addFavoriteAuthor(@PathVariable String id, HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        if (favAuthorRepo.existsByUsernameAndAuthorId(u, id))
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Already favorited"));
        UserFavoriteAuthor fav = new UserFavoriteAuthor();
        fav.setUsername(u);
        fav.setAuthorId(id);
        return ResponseEntity.status(HttpStatus.CREATED).body(favAuthorRepo.save(fav));
    }

    @DeleteMapping("/authors/{id}")
    @Transactional
    public ResponseEntity<?> removeFavoriteAuthor(@PathVariable String id, HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        if (!favAuthorRepo.existsByUsernameAndAuthorId(u, id)) return ResponseEntity.notFound().build();
        favAuthorRepo.deleteByUsernameAndAuthorId(u, id);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/authors/{id}/notify")
    public ResponseEntity<?> toggleAuthorNotify(@PathVariable String id, @RequestBody Map<String, Boolean> body,
                                                HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        return favAuthorRepo.findByUsernameAndAuthorId(u, id).map(fav -> {
            fav.setNotify(Boolean.TRUE.equals(body.get("notify")));
            return ResponseEntity.ok(favAuthorRepo.save(fav));
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/authors/{id}/status")
    public Map<String, Object> getAuthorStatus(@PathVariable String id, HttpSession session) {
        String u = resolveUsername(session);
        boolean favorited = u != null && favAuthorRepo.existsByUsernameAndAuthorId(u, id);
        boolean notify = favorited && favAuthorRepo.findByUsernameAndAuthorId(u, id)
                .map(UserFavoriteAuthor::isNotify).orElse(false);
        return Map.of("favorited", favorited, "notify", notify, "count", favAuthorRepo.countByAuthorId(id));
    }

    // ── Books ──────────────────────────────────────────────────────────────

    @GetMapping("/books")
    public ResponseEntity<?> getFavoriteBooks(HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        return ResponseEntity.ok(favBookRepo.findByUsernameOrderByAddedAtDesc(u));
    }

    @PostMapping("/books/{id}")
    public ResponseEntity<?> addFavoriteBook(@PathVariable String id, HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        if (favBookRepo.existsByUsernameAndBookId(u, id))
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Already favorited"));
        UserFavoriteBook fav = new UserFavoriteBook();
        fav.setUsername(u);
        fav.setBookId(id);
        return ResponseEntity.status(HttpStatus.CREATED).body(favBookRepo.save(fav));
    }

    @DeleteMapping("/books/{id}")
    @Transactional
    public ResponseEntity<?> removeFavoriteBook(@PathVariable String id, HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        if (!favBookRepo.existsByUsernameAndBookId(u, id)) return ResponseEntity.notFound().build();
        favBookRepo.deleteByUsernameAndBookId(u, id);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/books/{id}/notify")
    public ResponseEntity<?> toggleBookNotify(@PathVariable String id, @RequestBody Map<String, Boolean> body,
                                              HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        return favBookRepo.findByUsernameAndBookId(u, id).map(fav -> {
            fav.setNotify(Boolean.TRUE.equals(body.get("notify")));
            return ResponseEntity.ok(favBookRepo.save(fav));
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/books/{id}/status")
    public Map<String, Object> getBookStatus(@PathVariable String id, HttpSession session) {
        String u = resolveUsername(session);
        boolean favorited = u != null && favBookRepo.existsByUsernameAndBookId(u, id);
        boolean notify = favorited && favBookRepo.findByUsernameAndBookId(u, id)
                .map(UserFavoriteBook::isNotify).orElse(false);
        return Map.of("favorited", favorited, "notify", notify, "count", favBookRepo.countByBookId(id));
    }

    // ── Artists ────────────────────────────────────────────────────────────

    @GetMapping("/artists")
    public ResponseEntity<?> getFavoriteArtists(HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        return ResponseEntity.ok(favArtistRepo.findByUsernameOrderByAddedAtDesc(u));
    }

    @PostMapping("/artists/{id}")
    public ResponseEntity<?> addFavoriteArtist(@PathVariable String id, HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        if (favArtistRepo.existsByUsernameAndArtistId(u, id))
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Already favorited"));
        UserFavoriteArtist fav = new UserFavoriteArtist();
        fav.setUsername(u);
        fav.setArtistId(id);
        return ResponseEntity.status(HttpStatus.CREATED).body(favArtistRepo.save(fav));
    }

    @DeleteMapping("/artists/{id}")
    @Transactional
    public ResponseEntity<?> removeFavoriteArtist(@PathVariable String id, HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        if (!favArtistRepo.existsByUsernameAndArtistId(u, id)) return ResponseEntity.notFound().build();
        favArtistRepo.deleteByUsernameAndArtistId(u, id);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/artists/{id}/notify")
    public ResponseEntity<?> toggleArtistNotify(@PathVariable String id, @RequestBody Map<String, Boolean> body,
                                                HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        return favArtistRepo.findByUsernameAndArtistId(u, id).map(fav -> {
            fav.setNotify(Boolean.TRUE.equals(body.get("notify")));
            return ResponseEntity.ok(favArtistRepo.save(fav));
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/artists/{id}/status")
    public Map<String, Object> getArtistStatus(@PathVariable String id, HttpSession session) {
        String u = resolveUsername(session);
        boolean favorited = u != null && favArtistRepo.existsByUsernameAndArtistId(u, id);
        boolean notify = favorited && favArtistRepo.findByUsernameAndArtistId(u, id)
                .map(UserFavoriteArtist::isNotify).orElse(false);
        return Map.of("favorited", favorited, "notify", notify, "count", favArtistRepo.countByArtistId(id));
    }

    // ── Companies ──────────────────────────────────────────────────────────

    @GetMapping("/companies")
    public ResponseEntity<?> getFavoriteCompanies(HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        return ResponseEntity.ok(favCompanyRepo.findByUsernameOrderByAddedAtDesc(u));
    }

    @PostMapping("/companies/{id}")
    public ResponseEntity<?> addFavoriteCompany(@PathVariable String id, HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        if (favCompanyRepo.existsByUsernameAndCompanyId(u, id))
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Already favorited"));
        UserFavoriteCompany fav = new UserFavoriteCompany();
        fav.setUsername(u);
        fav.setCompanyId(id);
        return ResponseEntity.status(HttpStatus.CREATED).body(favCompanyRepo.save(fav));
    }

    @DeleteMapping("/companies/{id}")
    @Transactional
    public ResponseEntity<?> removeFavoriteCompany(@PathVariable String id, HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        if (!favCompanyRepo.existsByUsernameAndCompanyId(u, id)) return ResponseEntity.notFound().build();
        favCompanyRepo.deleteByUsernameAndCompanyId(u, id);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/companies/{id}/notify")
    public ResponseEntity<?> toggleCompanyNotify(@PathVariable String id, @RequestBody Map<String, Boolean> body,
                                                 HttpSession session) {
        String u = resolveUsername(session);
        if (u == null) return unauthorized();
        return favCompanyRepo.findByUsernameAndCompanyId(u, id).map(fav -> {
            fav.setNotify(Boolean.TRUE.equals(body.get("notify")));
            return ResponseEntity.ok(favCompanyRepo.save(fav));
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/companies/{id}/status")
    public Map<String, Object> getCompanyStatus(@PathVariable String id, HttpSession session) {
        String u = resolveUsername(session);
        boolean favorited = u != null && favCompanyRepo.existsByUsernameAndCompanyId(u, id);
        boolean notify = favorited && favCompanyRepo.findByUsernameAndCompanyId(u, id)
                .map(UserFavoriteCompany::isNotify).orElse(false);
        return Map.of("favorited", favorited, "notify", notify, "count", favCompanyRepo.countByCompanyId(id));
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private String resolveUsername(HttpSession session) {
        return (String) session.getAttribute(AppConstants.SESSION_USERNAME);
    }

    private ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not authenticated"));
    }
}
