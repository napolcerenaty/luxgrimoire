package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.Book;
import com.luxgrimoire.backend.model.BookEdition;
import com.luxgrimoire.backend.service.BookBoxCompanyStore;
import com.luxgrimoire.backend.service.BookStore;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/book-details")
@CrossOrigin(origins = "http://localhost:5173", allowCredentials = "true")
public class BookDetailController {

    private final BookStore bookStore;
    private final BookBoxCompanyStore companyStore;

    public BookDetailController(BookStore bookStore, BookBoxCompanyStore companyStore) {
        this.bookStore = bookStore;
        this.companyStore = companyStore;
    }

    @GetMapping
    public List<Book> getAll() {
        return bookStore.findAll();
    }

    @GetMapping("/by-title")
    public ResponseEntity<Book> getByTitle(@RequestParam String title) {
        return bookStore.findByTitle(title)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/edition/{editionId}")
    public ResponseEntity<Book> getByEditionId(@PathVariable String editionId) {
        return bookStore.findBookByEditionId(editionId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{bookId}")
    public ResponseEntity<Book> getById(@PathVariable String bookId) {
        return bookStore.findById(bookId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> createBook(@RequestBody Map<String, String> body, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (username == null || username.isBlank()) {
            return ResponseEntity.status(401).build();
        }
        Book book = new Book();
        book.setTitle(body.get("title"));
        book.setAuthor(body.get("author"));
        book.setSeriesName(body.get("seriesName"));
        book.setVolumeNumber(body.get("volumeNumber"));
        Book saved = bookStore.save(book);
        return ResponseEntity.ok(saved);
    }

    @PutMapping("/{bookId}")
    public ResponseEntity<?> updateBook(@PathVariable String bookId, @RequestBody Book body, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (username == null || username.isBlank()) {
            return ResponseEntity.status(401).build();
        }
        return bookStore.updateBook(bookId, body)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{bookId}")
    public ResponseEntity<?> deleteBook(@PathVariable String bookId, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (!"admin".equals(username)) {
            return ResponseEntity.status(403).build();
        }
        bookStore.findById(bookId).ifPresent(book ->
            book.getEditions().forEach(edition -> {
                if (edition.getSubscriptionMonthId() != null) {
                    unlinkBookFromMonth(edition.getSubscriptionMonthId());
                }
            })
        );
        boolean removed = bookStore.deleteBook(bookId);
        if (!removed) return ResponseEntity.notFound().build();
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{bookId}/editions")
    public ResponseEntity<?> addEdition(@PathVariable String bookId, @RequestBody BookEdition edition, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (username == null || username.isBlank()) {
            return ResponseEntity.status(401).build();
        }
        return bookStore.addEdition(bookId, edition)
                .map(saved -> {
                    linkEditionToMonth(bookId, saved);
                    return bookStore.findById(bookId)
                            .<ResponseEntity<?>>map(ResponseEntity::ok)
                            .orElse(ResponseEntity.notFound().build());
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{bookId}/editions/{editionId}")
    public ResponseEntity<?> updateEdition(@PathVariable String bookId, @PathVariable String editionId,
                                            @RequestBody BookEdition edition, HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (username == null || username.isBlank()) {
            return ResponseEntity.status(401).build();
        }
        // Unlink old month if changed
        bookStore.findById(bookId).flatMap(b ->
            b.getEditions().stream().filter(e -> editionId.equals(e.getId())).findFirst()
        ).ifPresent(old -> {
            if (old.getSubscriptionMonthId() != null
                    && !old.getSubscriptionMonthId().equals(edition.getSubscriptionMonthId())) {
                unlinkBookFromMonth(old.getSubscriptionMonthId());
            }
        });
        return bookStore.updateEdition(bookId, editionId, edition)
                .map(updated -> {
                    linkEditionToMonth(bookId, updated);
                    return bookStore.findById(bookId)
                            .<ResponseEntity<?>>map(ResponseEntity::ok)
                            .orElse(ResponseEntity.notFound().build());
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{bookId}/editions/{editionId}")
    public ResponseEntity<?> deleteEdition(@PathVariable String bookId, @PathVariable String editionId,
                                            HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (!"admin".equals(username)) {
            return ResponseEntity.status(403).build();
        }
        bookStore.findById(bookId).flatMap(b ->
            b.getEditions().stream().filter(e -> editionId.equals(e.getId())).findFirst()
        ).ifPresent(edition -> {
            if (edition.getSubscriptionMonthId() != null) {
                unlinkBookFromMonth(edition.getSubscriptionMonthId());
            }
        });
        boolean removed = bookStore.deleteEdition(bookId, editionId);
        if (!removed) return ResponseEntity.notFound().build();
        return ResponseEntity.ok().build();
    }

    private void linkEditionToMonth(String bookId, BookEdition edition) {
        if (edition.getSubscriptionMonthId() == null || edition.getBookBoxCompanyId() == null) return;
        companyStore.findById(edition.getBookBoxCompanyId()).ifPresent(company ->
            company.getSubscriptions().stream()
                .filter(s -> edition.getSubscriptionId() != null && edition.getSubscriptionId().equals(s.getId()))
                .findFirst()
                .ifPresent(sub -> sub.getMonths().stream()
                    .filter(m -> edition.getSubscriptionMonthId().equals(m.getId()))
                    .findFirst()
                    .ifPresent(m -> m.setBookId(edition.getId())))
        );
    }

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

