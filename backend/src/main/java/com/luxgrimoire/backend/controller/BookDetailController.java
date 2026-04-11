package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.dto.BookDetailResponse;
import com.luxgrimoire.backend.dto.BookSummaryDto;
import com.luxgrimoire.backend.dto.CreateBookRequest;
import com.luxgrimoire.backend.dto.PageResponse;
import com.luxgrimoire.backend.model.Book;
import com.luxgrimoire.backend.model.BookEdition;
import com.luxgrimoire.backend.service.BookBoxCompanyStore;
import com.luxgrimoire.backend.service.BookStore;
import com.luxgrimoire.backend.service.DeletionLogService;
import com.luxgrimoire.backend.service.FileStorageService;
import com.luxgrimoire.backend.util.AppConstants;
import com.luxgrimoire.backend.util.AuthHelper;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/book-details")
public class BookDetailController {

    private final BookStore           bookStore;
    private final FileStorageService  fileStorageService;
    private final DeletionLogService  deletionLogService;

    public BookDetailController(BookStore bookStore, BookBoxCompanyStore companyStore,
                                FileStorageService fileStorageService,
                                DeletionLogService deletionLogService) {
        this.bookStore          = bookStore;
        this.fileStorageService = fileStorageService;
        this.deletionLogService = deletionLogService;
    }

    @PostMapping("/images")
    public ResponseEntity<?> uploadBookImage(@RequestParam("file") MultipartFile file, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null || username.isBlank()) {
            return ResponseEntity.status(401).build();
        }
        try {
            String url = fileStorageService.storeBookImage(file);
            return ResponseEntity.ok(Map.of("url", url));
        } catch (IOException e) {
            return ResponseEntity.status(500).body(Map.of("error", "Failed to upload image"));
        }
    }

    @GetMapping
    public PageResponse<BookSummaryDto> getAll(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "24") int size,
            HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (AuthHelper.isAdmin(session)) return bookStore.findAllPaged(page, size);
        return bookStore.findAllApprovedPaged(page, size);
    }

    @GetMapping("/series-names")
    public List<String> getSeriesNames() {
        return bookStore.findDistinctSeriesNames();
    }

    @GetMapping("/contributions")
    public List<String> getContributions() {
        return bookStore.findDistinctContributions();
    }

    @GetMapping("/pending")
    public ResponseEntity<?> getPendingBooks(HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (!AuthHelper.isAdmin(session)) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(bookStore.findAllPending());
    }

    @PutMapping("/{bookId}/approve")
    public ResponseEntity<?> approveBook(@PathVariable String bookId, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (!AuthHelper.isAdmin(session)) return ResponseEntity.status(403).build();
        return bookStore.findById(bookId).map(book -> {
            book.setStatus(AppConstants.STATUS_APPROVED);
            bookStore.save(book);
            return ResponseEntity.ok(book);
        }).orElse(ResponseEntity.notFound().build());
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
    public ResponseEntity<BookDetailResponse> getById(@PathVariable String bookId, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        boolean includePending = AuthHelper.isAdmin(session);
        return bookStore.findDetailById(bookId, includePending)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{bookId}/series-books")
    public ResponseEntity<?> getSeriesBooks(@PathVariable String bookId, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        boolean includePending = AuthHelper.isAdmin(session);
        return bookStore.findSeriesBooksByBookId(bookId, includePending)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> createBook(@RequestBody CreateBookRequest body, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null || username.isBlank()) {
            return ResponseEntity.status(401).build();
        }
        Book book = new Book();
        book.setTitle(body.getTitle());
        book.setAuthor(body.getAuthor());
        book.setAuthorId(body.getAuthorId());
        book.setSeriesName(body.getSeriesName());
        book.setVolumeNumber(body.getVolumeNumber());
        book.setAddedBy(username);
        book.setStatus(AuthHelper.isAdmin(session)
                ? AppConstants.STATUS_APPROVED : AppConstants.STATUS_PENDING);
        Book saved = bookStore.save(book);
        return ResponseEntity.ok(saved);
    }

    @PutMapping("/{bookId}")
    public ResponseEntity<?> updateBook(@PathVariable String bookId, @RequestBody Book body, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null || username.isBlank()) {
            return ResponseEntity.status(401).build();
        }
        return bookStore.updateBook(bookId, body)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{bookId}")
    public ResponseEntity<?> deleteBook(@PathVariable String bookId, HttpSession session) {
        if (!AuthHelper.isAdmin(session)) {
            return ResponseEntity.status(403).build();
        }
        var bookOpt = bookStore.findByIdWithEditions(bookId);
        if (bookOpt.isEmpty()) return ResponseEntity.notFound().build();
        var book = bookOpt.get();
        book.getEditions().forEach(edition -> {
            if (edition.getSubscriptionMonthId() != null) {
                bookStore.unlinkBookFromMonth(edition.getSubscriptionMonthId());
            }
        });
        deletionLogService.log(AuthHelper.getUsername(session), "Book", bookId,
                "Deleted book: \"" + book.getTitle() + "\" by " + book.getAuthor());
        boolean removed = bookStore.deleteBook(bookId);
        if (!removed) return ResponseEntity.notFound().build();
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{bookId}/editions")
    public ResponseEntity<?> addEdition(@PathVariable String bookId, @RequestBody BookEdition edition, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null || username.isBlank()) {
            return ResponseEntity.status(401).build();
        }
        return bookStore.addEdition(bookId, edition)
                .map(saved -> {
                    bookStore.linkEditionToMonth(saved);
                    return bookStore.findById(bookId)
                            .<ResponseEntity<?>>map(ResponseEntity::ok)
                            .orElse(ResponseEntity.notFound().build());
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{bookId}/editions/{editionId}")
    public ResponseEntity<?> updateEdition(@PathVariable String bookId, @PathVariable String editionId,
                                            @RequestBody BookEdition edition, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null || username.isBlank()) {
            return ResponseEntity.status(401).build();
        }
        bookStore.findByIdWithEditions(bookId).flatMap(b ->
            b.getEditions().stream().filter(e -> editionId.equals(e.getId())).findFirst()
        ).ifPresent(old -> {
            if (old.getSubscriptionMonthId() != null
                    && !old.getSubscriptionMonthId().equals(edition.getSubscriptionMonthId())) {
                bookStore.unlinkBookFromMonth(old.getSubscriptionMonthId());
            }
        });
        return bookStore.updateEdition(bookId, editionId, edition)
                .map(updated -> {
                    bookStore.linkEditionToMonth(updated);
                    return bookStore.findById(bookId)
                            .<ResponseEntity<?>>map(ResponseEntity::ok)
                            .orElse(ResponseEntity.notFound().build());
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{bookId}/editions/{editionId}")
    public ResponseEntity<?> deleteEdition(@PathVariable String bookId, @PathVariable String editionId,
                                            HttpSession session) {
        String username = AuthHelper.getUsername(session);
        if (!AuthHelper.isAdmin(session)) {
            return ResponseEntity.status(403).build();
        }
        bookStore.findByIdWithEditions(bookId).flatMap(b ->
            b.getEditions().stream().filter(e -> editionId.equals(e.getId())).findFirst()
        ).ifPresent(edition -> {
            if (edition.getSubscriptionMonthId() != null) {
                bookStore.unlinkBookFromMonth(edition.getSubscriptionMonthId());
            }
        });
        deletionLogService.log(username, "BookEdition", editionId,
                "Deleted edition: " + editionId + " from book: " + bookId);
        boolean removed = bookStore.deleteEdition(bookId, editionId);
        if (!removed) return ResponseEntity.notFound().build();
        return ResponseEntity.ok().build();
    }
}


