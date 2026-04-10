package com.luxgrimoire.backend.controller;
import com.luxgrimoire.backend.dto.EditionSummary;
import com.luxgrimoire.backend.model.Artist;
import com.luxgrimoire.backend.model.BookEdition;
import com.luxgrimoire.backend.repository.ArtistRepository;
import com.luxgrimoire.backend.repository.BookEditionRepository;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/artists")
@CrossOrigin(origins = "http://localhost:5173", allowCredentials = "true")
public class ArtistController {
    private final ArtistRepository repo;
    private final BookEditionRepository editionRepo;

    public ArtistController(ArtistRepository repo, BookEditionRepository editionRepo) {
        this.repo = repo;
        this.editionRepo = editionRepo;
    }

    @GetMapping public List<Artist> getAll() { return repo.findAll(); }

    @GetMapping("/{id}") public ResponseEntity<Artist> getById(@PathVariable String id) {
        return repo.findById(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/editions")
    public ResponseEntity<List<EditionSummary>> getEditions(@PathVariable String id) {
        if (!repo.existsById(id)) return ResponseEntity.notFound().build();
        List<BookEdition> editions = editionRepo.findByArtistId(id);
        List<EditionSummary> result = editions.stream().map(e -> {
            String coverUrl = e.getImageUrls().isEmpty() ? null : e.getImageUrls().get(0);
            String boxName = e.getSubscriptionName() != null && !e.getSubscriptionName().isBlank()
                ? e.getSubscriptionName() : e.getEditionName();
            String companyName = e.getBookBoxCompanyCustomName();
            String bookTitle = e.getBook() != null ? e.getBook().getTitle() : null;
            String seriesName = e.getBook() != null ? e.getBook().getSeriesName() : null;
            String volumeNumber = e.getBook() != null ? e.getBook().getVolumeNumber() : null;
            String bookId = e.getBook() != null ? e.getBook().getId() : null;
            return new EditionSummary(e.getId(), bookId, bookTitle, seriesName, volumeNumber, coverUrl, boxName, companyName);
        }).toList();
        return ResponseEntity.ok(result);
    }

    @PostMapping public ResponseEntity<?> create(@RequestBody Artist body, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (username == null || username.isBlank()) return ResponseEntity.status(401).build();
        if (body.getId() == null || body.getId().isBlank()) body.setId(UUID.randomUUID().toString());
        return ResponseEntity.ok(repo.save(body));
    }

    @PutMapping("/{id}") public ResponseEntity<?> update(@PathVariable String id, @RequestBody Artist body, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (!"admin".equals(username)) return ResponseEntity.status(403).build();
        if (!repo.existsById(id)) return ResponseEntity.notFound().build();
        body.setId(id);
        return ResponseEntity.ok(repo.save(body));
    }

    @DeleteMapping("/{id}") public ResponseEntity<?> delete(@PathVariable String id, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (!"admin".equals(username)) return ResponseEntity.status(403).build();
        if (!repo.existsById(id)) return ResponseEntity.notFound().build();
        long editionCount = editionRepo.countByArtistId(id);
        if (editionCount > 0) {
            return ResponseEntity.status(409)
                .body(Map.of("error", "Cannot delete artist linked to " + editionCount + " edition(s). Remove artist from editions first."));
        }
        repo.deleteById(id);
        return ResponseEntity.ok().build();
    }
}
