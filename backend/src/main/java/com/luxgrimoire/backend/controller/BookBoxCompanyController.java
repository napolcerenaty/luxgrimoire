package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.BookBoxCompany;
import com.luxgrimoire.backend.service.BookBoxCompanyStore;
import com.luxgrimoire.backend.service.DeletionLogService;
import com.luxgrimoire.backend.util.AppConstants;
import com.luxgrimoire.backend.util.AuthHelper;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/companies")
public class BookBoxCompanyController {

    private final BookBoxCompanyStore store;
    private final DeletionLogService  deletionLogService;

    public BookBoxCompanyController(BookBoxCompanyStore store, DeletionLogService deletionLogService) {
        this.store             = store;
        this.deletionLogService = deletionLogService;
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
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
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
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        Optional<BookBoxCompany> existing = store.findById(id);
        if (existing.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        if (!isAdminOrManager(session, username, existing.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return store.update(id, company)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (!AuthHelper.isAdmin(session)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        Optional<BookBoxCompany> existing = store.findById(id);
        if (existing.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        deletionLogService.log(username, "BookBoxCompany", id,
                "Deleted company: \"" + existing.get().getName() + "\"");
        store.delete(id);
        return ResponseEntity.noContent().build();
    }

    private boolean isAdminOrManager(HttpSession session, String username, BookBoxCompany c) {
        return AuthHelper.isAdmin(session) || c.getManagerUsernames().contains(username);
    }
}
