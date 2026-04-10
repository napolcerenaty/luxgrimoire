package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.BookDetail;
import com.luxgrimoire.backend.service.BookDetailStore;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/book-details")
@CrossOrigin(origins = "http://localhost:5173", allowCredentials = "true")
public class BookDetailController {

    private final BookDetailStore store;

    public BookDetailController(BookDetailStore store) {
        this.store = store;
    }

    @GetMapping
    public List<BookDetail> getAll() {
        return store.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<BookDetail> getById(@PathVariable String id) {
        return store.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/by-title")
    public ResponseEntity<BookDetail> getByTitle(@RequestParam String title) {
        return store.findByTitle(title)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody BookDetail detail, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (username == null || username.isBlank()) {
            return ResponseEntity.status(401).build();
        }
        BookDetail saved = store.save(detail);
        return ResponseEntity.ok(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody BookDetail detail, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (username == null || username.isBlank()) {
            return ResponseEntity.status(401).build();
        }
        return store.update(id, detail)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (!"admin".equals(username)) {
            return ResponseEntity.status(403).build();
        }
        boolean removed = store.delete(id);
        if (!removed) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok().build();
    }
}
