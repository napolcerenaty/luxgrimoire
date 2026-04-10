package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.BookBoxCompany;
import com.luxgrimoire.backend.service.BookBoxCompanyStore;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/companies")
@CrossOrigin(origins = "http://localhost:5173", allowCredentials = "true")
public class BookBoxCompanyController {

    private final BookBoxCompanyStore store;

    public BookBoxCompanyController(BookBoxCompanyStore store) {
        this.store = store;
    }

    @GetMapping
    public List<BookBoxCompany> getAll() {
        return store.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<BookBoxCompany> getById(@PathVariable String id) {
        return store.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody BookBoxCompany company, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (username == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (company.getManagerUsernames() == null) {
            company.setManagerUsernames(new java.util.ArrayList<>());
        }
        if (!company.getManagerUsernames().contains(username)) {
            company.getManagerUsernames().add(username);
        }
        BookBoxCompany saved = store.save(company);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody BookBoxCompany company, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (username == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        Optional<BookBoxCompany> existing = store.findById(id);
        if (existing.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        if (!isAdminOrManager(username, existing.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return store.update(id, company)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (username == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (!"admin".equals(username)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        Optional<BookBoxCompany> existing = store.findById(id);
        if (existing.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        store.delete(id);
        return ResponseEntity.noContent().build();
    }

    private boolean isAdminOrManager(String username, BookBoxCompany c) {
        return "admin".equals(username) || c.getManagerUsernames().contains(username);
    }
}
