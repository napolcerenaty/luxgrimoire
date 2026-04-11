package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.dto.EditionSummary;
import com.luxgrimoire.backend.model.Artist;
import com.luxgrimoire.backend.service.ArtistService;
import com.luxgrimoire.backend.service.DeletionLogService;
import com.luxgrimoire.backend.util.AppConstants;
import com.luxgrimoire.backend.util.AuthHelper;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/artists")
public class ArtistController {

    private final ArtistService      artistService;
    private final DeletionLogService deletionLogService;

    public ArtistController(ArtistService artistService, DeletionLogService deletionLogService) {
        this.artistService      = artistService;
        this.deletionLogService = deletionLogService;
    }

    @GetMapping
    public List<Artist> getAll() {
        return artistService.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Artist> getById(@PathVariable String id) {
        return artistService.findById(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/editions")
    public ResponseEntity<List<EditionSummary>> getEditions(@PathVariable String id) {
        if (!artistService.existsById(id)) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(artistService.getEditionSummaries(id));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Artist body, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null || username.isBlank()) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(artistService.create(body));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody Artist body, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (!AuthHelper.isAdmin(session)) return ResponseEntity.status(403).build();
        return artistService.update(id, body)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (!AuthHelper.isAdmin(session)) return ResponseEntity.status(403).build();
        if (!artistService.existsById(id)) return ResponseEntity.notFound().build();
        long editionCount = artistService.countEditions(id);
        if (editionCount > 0) {
            return ResponseEntity.status(409)
                    .body(Map.of("error", "Cannot delete artist linked to " + editionCount + " edition(s). Remove artist from editions first."));
        }
        artistService.delete(id);
        deletionLogService.log(username, "Artist", id, "Deleted artist id=" + id);
        return ResponseEntity.ok().build();
    }
}
