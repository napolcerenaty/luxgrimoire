package com.luxgrimoire.backend.controller;
import com.luxgrimoire.backend.model.Artist;
import com.luxgrimoire.backend.repository.ArtistRepository;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/artists")
@CrossOrigin(origins = "http://localhost:5173", allowCredentials = "true")
public class ArtistController {
    private final ArtistRepository repo;
    public ArtistController(ArtistRepository repo) { this.repo = repo; }

    @GetMapping public List<Artist> getAll() { return repo.findAll(); }
    @GetMapping("/{id}") public ResponseEntity<Artist> getById(@PathVariable String id) {
        return repo.findById(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }
    @PostMapping public ResponseEntity<?> create(@RequestBody Artist body, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (username == null || username.isBlank()) return ResponseEntity.status(401).build();
        if (body.getId() == null || body.getId().isBlank()) body.setId(UUID.randomUUID().toString());
        return ResponseEntity.ok(repo.save(body));
    }
    @PutMapping("/{id}") public ResponseEntity<?> update(@PathVariable String id, @RequestBody Artist body, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (username == null || username.isBlank()) return ResponseEntity.status(401).build();
        if (!repo.existsById(id)) return ResponseEntity.notFound().build();
        body.setId(id);
        return ResponseEntity.ok(repo.save(body));
    }
    @DeleteMapping("/{id}") public ResponseEntity<?> delete(@PathVariable String id, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (!"admin".equals(username)) return ResponseEntity.status(403).build();
        if (!repo.existsById(id)) return ResponseEntity.notFound().build();
        repo.deleteById(id);
        return ResponseEntity.ok().build();
    }
}
