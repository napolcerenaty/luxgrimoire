package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.dto.EditionSummary;
import com.luxgrimoire.backend.model.Author;
import com.luxgrimoire.backend.service.AuthorService;
import com.luxgrimoire.backend.service.DeletionLogService;
import com.luxgrimoire.backend.util.AppConstants;
import com.luxgrimoire.backend.util.AuthHelper;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/authors")
public class AuthorController {

    private final AuthorService      authorService;
    private final DeletionLogService deletionLogService;

    public AuthorController(AuthorService authorService, DeletionLogService deletionLogService) {
        this.authorService      = authorService;
        this.deletionLogService = deletionLogService;
    }

    @GetMapping
    public List<Author> getAll() {
        return authorService.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Author> getById(@PathVariable String id) {
        return authorService.findById(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/editions")
    public ResponseEntity<List<EditionSummary>> getEditions(@PathVariable String id) {
        if (!authorService.existsById(id)) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(authorService.getEditionSummaries(id));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Author body, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null || username.isBlank()) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(authorService.create(body));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody Author body, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (!AuthHelper.isAdmin(session)) return ResponseEntity.status(403).build();
        return authorService.update(id, body)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (!AuthHelper.isAdmin(session)) return ResponseEntity.status(403).build();
        if (!authorService.existsById(id)) return ResponseEntity.notFound().build();
        long bookCount = authorService.countBooks(id);
        if (bookCount > 0) {
            return ResponseEntity.status(409)
                    .body(Map.of("error", "Cannot delete author with " + bookCount + " book(s) linked. Reassign books first."));
        }
        authorService.delete(id);
        deletionLogService.log(username, "Author", id, "Deleted author id=" + id);
        return ResponseEntity.ok().build();
    }
}
