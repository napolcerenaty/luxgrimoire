package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.dto.CompanySummaryDto;
import com.luxgrimoire.backend.model.BookBoxCollection;
import com.luxgrimoire.backend.model.BookBoxCompany;
import com.luxgrimoire.backend.repository.BookBoxCollectionRepository;
import com.luxgrimoire.backend.service.BookBoxCompanyStore;
import com.luxgrimoire.backend.service.DeletionLogService;
import com.luxgrimoire.backend.util.AppConstants;
import com.luxgrimoire.backend.util.AuthHelper;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/companies")
public class BookBoxCompanyController {

    private final BookBoxCompanyStore        store;
    private final DeletionLogService         deletionLogService;
    private final BookBoxCollectionRepository collectionRepo;

    public BookBoxCompanyController(BookBoxCompanyStore store, DeletionLogService deletionLogService,
                                    BookBoxCollectionRepository collectionRepo) {
        this.store             = store;
        this.deletionLogService = deletionLogService;
        this.collectionRepo    = collectionRepo;
    }

    @GetMapping("/summary")
    public List<CompanySummaryDto> getAllSummary() {
        return store.findAllSummaries();
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

    // ── Collections ────────────────────────────────────────────────────────

    @GetMapping("/{companyId}/collections")
    public ResponseEntity<?> getCollections(@PathVariable String companyId) {
        return ResponseEntity.ok(collectionRepo.findByCompanyIdOrderByNameAsc(companyId));
    }

    @PostMapping("/{companyId}/collections")
    public ResponseEntity<?> createCollection(@PathVariable String companyId,
                                              @RequestBody Map<String, String> body,
                                              HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        String name = body.getOrDefault("name", "").trim();
        if (name.isBlank()) return ResponseEntity.badRequest().body("name required");
        Optional<BookBoxCompany> company = store.findById(companyId);
        if (company.isEmpty()) return ResponseEntity.notFound().build();
        if (!isAdminOrManager(session, username, company.get()))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        BookBoxCollection c = new BookBoxCollection(UUID.randomUUID().toString(), companyId, name);
        return ResponseEntity.status(HttpStatus.CREATED).body(collectionRepo.save(c));
    }

    @DeleteMapping("/{companyId}/collections/{collectionId}")
    public ResponseEntity<?> deleteCollection(@PathVariable String companyId,
                                              @PathVariable String collectionId,
                                              HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        Optional<BookBoxCompany> company = store.findById(companyId);
        if (company.isEmpty()) return ResponseEntity.notFound().build();
        if (!isAdminOrManager(session, username, company.get()))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        collectionRepo.deleteById(collectionId);
        return ResponseEntity.noContent().build();
    }

    private boolean isAdminOrManager(HttpSession session, String username, BookBoxCompany c) {
        return AuthHelper.isAdmin(session) || c.getManagerUsernames().contains(username);
    }
}
