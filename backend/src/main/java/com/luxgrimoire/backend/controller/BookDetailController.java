package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.BookDetail;
import com.luxgrimoire.backend.model.Subscription;
import com.luxgrimoire.backend.model.SubscriptionMonth;
import com.luxgrimoire.backend.service.BookBoxCompanyStore;
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
    private final BookBoxCompanyStore companyStore;

    public BookDetailController(BookDetailStore store, BookBoxCompanyStore companyStore) {
        this.store = store;
        this.companyStore = companyStore;
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
        linkBookToMonth(saved);
        return ResponseEntity.ok(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody BookDetail detail, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (username == null || username.isBlank()) {
            return ResponseEntity.status(401).build();
        }
        // Clear old month link if subscriptionMonthId changed
        store.findById(id).ifPresent(old -> {
            if (old.getSubscriptionMonthId() != null
                    && !old.getSubscriptionMonthId().equals(detail.getSubscriptionMonthId())) {
                unlinkBookFromMonth(old.getSubscriptionMonthId());
            }
        });
        return store.update(id, detail)
                .map(updated -> { linkBookToMonth(updated); return ResponseEntity.ok(updated); })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (!"admin".equals(username)) {
            return ResponseEntity.status(403).build();
        }
        store.findById(id).ifPresent(book -> {
            if (book.getSubscriptionMonthId() != null) {
                unlinkBookFromMonth(book.getSubscriptionMonthId());
            }
        });
        boolean removed = store.delete(id);
        if (!removed) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok().build();
    }

    /** Set month.bookId = book.id when book is linked to a subscription month. */
    private void linkBookToMonth(BookDetail book) {
        if (book.getSubscriptionMonthId() == null || book.getBookBoxCompanyId() == null) return;
        companyStore.findById(book.getBookBoxCompanyId()).ifPresent(company ->
            company.getSubscriptions().stream()
                .filter(s -> book.getSubscriptionId() != null && book.getSubscriptionId().equals(s.getId()))
                .findFirst()
                .ifPresent(sub -> sub.getMonths().stream()
                    .filter(m -> book.getSubscriptionMonthId().equals(m.getId()))
                    .findFirst()
                    .ifPresent(m -> m.setBookId(book.getId())))
        );
    }

    /** Clear month.bookId when a book is unlinked from a subscription month. */
    private void unlinkBookFromMonth(String monthId) {
        companyStore.findAll().forEach(company ->
            company.getSubscriptions().forEach(sub ->
                sub.getMonths().stream()
                    .filter(m -> monthId.equals(m.getId()))
                    .findFirst()
                    .ifPresent(m -> m.setBookId(null))
            )
        );
    }
}
