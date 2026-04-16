package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.dto.BookDetailResponse;
import com.luxgrimoire.backend.dto.BookSummaryDto;
import com.luxgrimoire.backend.dto.CreateBookRequest;
import com.luxgrimoire.backend.dto.PageResponse;
import com.luxgrimoire.backend.dto.RecentEditionDto;
import com.luxgrimoire.backend.model.Book;
import com.luxgrimoire.backend.model.BookEdition;
import com.luxgrimoire.backend.model.SaleAnnouncement;
import com.luxgrimoire.backend.repository.SaleAnnouncementEditionRepository;
import com.luxgrimoire.backend.repository.SaleAnnouncementRepository;
import com.luxgrimoire.backend.repository.SubscriptionRepository;
import com.luxgrimoire.backend.repository.UserBookEntryRepository;
import com.luxgrimoire.backend.service.BookBoxCompanyStore;
import com.luxgrimoire.backend.service.BookStore;
import com.luxgrimoire.backend.service.DeletionLogService;
import com.luxgrimoire.backend.service.FileStorageService;
import com.luxgrimoire.backend.util.AppConstants;
import com.luxgrimoire.backend.util.AuthHelper;
import jakarta.servlet.http.HttpSession;
import com.luxgrimoire.backend.service.OpenAiService;
import com.luxgrimoire.backend.service.AiRateLimiterService;
import com.luxgrimoire.backend.service.FavoriteNotificationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/book-details")
public class BookDetailController {

    /** Base64 overhead ≈ 4/3 — this cap corresponds to ~5 MB original image. */
    private static final int MAX_BASE64_IMAGE_CHARS = 7_000_000;

    private final BookStore              bookStore;
    private final FileStorageService          fileStorageService;
    private final DeletionLogService          deletionLogService;
    private final SubscriptionRepository      subscriptionRepository;
    private final OpenAiService               openAiService;
    private final AiRateLimiterService        aiRateLimiter;
    private final FavoriteNotificationService favoriteNotificationService;
    private final SaleAnnouncementEditionRepository saleAnnouncementEditionRepo;
    private final SaleAnnouncementRepository        saleAnnouncementRepo;
    private final UserBookEntryRepository           userBookEntryRepo;

    public BookDetailController(BookStore bookStore, BookBoxCompanyStore companyStore,
                                FileStorageService fileStorageService,
                                DeletionLogService deletionLogService,
                                SubscriptionRepository subscriptionRepository,
                                OpenAiService openAiService,
                                AiRateLimiterService aiRateLimiter,
                                FavoriteNotificationService favoriteNotificationService,
                                SaleAnnouncementEditionRepository saleAnnouncementEditionRepo,
                                SaleAnnouncementRepository saleAnnouncementRepo,
                                UserBookEntryRepository userBookEntryRepo) {
        this.bookStore                   = bookStore;
        this.fileStorageService          = fileStorageService;
        this.deletionLogService          = deletionLogService;
        this.subscriptionRepository      = subscriptionRepository;
        this.openAiService               = openAiService;
        this.aiRateLimiter               = aiRateLimiter;
        this.favoriteNotificationService = favoriteNotificationService;
        this.saleAnnouncementEditionRepo = saleAnnouncementEditionRepo;
        this.saleAnnouncementRepo        = saleAnnouncementRepo;
        this.userBookEntryRepo           = userBookEntryRepo;
    }

    @PostMapping("/parse-edition-description")
    public ResponseEntity<?> parseEditionDescription(@RequestBody Map<String, String> body, HttpSession session) {
        String username = AuthHelper.getUsername(session);
        if (username == null) return ResponseEntity.status(401).build();

        // Rate limit non-admin users only
        if (!AuthHelper.isAdmin(session) && !aiRateLimiter.tryConsume(username)) {
            long retryAfter = aiRateLimiter.retryAfterSeconds(username);
            return ResponseEntity.status(429)
                    .header("Retry-After", String.valueOf(retryAfter))
                    .body(Map.of("error", "Too many AI requests. Try again in " + retryAfter + " seconds."));
        }

        String text       = body.get("text");
        String base64Image = body.get("base64Image");
        String mimeType   = body.getOrDefault("mimeType", "image/jpeg");

        if (base64Image != null && base64Image.length() > MAX_BASE64_IMAGE_CHARS) {
            return ResponseEntity.status(413).body(Map.of("error", "Image exceeds 5 MB limit"));
        }

        if (!openAiService.isConfigured()) {
            return ResponseEntity.status(503).body(Map.of("error", "AI parsing not configured"));
        }

        OpenAiService.EditionParseResult result;
        if (base64Image != null && !base64Image.isBlank()) {
            result = openAiService.parseEditionDescriptionFromImage(base64Image, mimeType);
        } else if (text != null && !text.isBlank()) {
            result = openAiService.parseEditionDescription(text);
        } else {
            return ResponseEntity.badRequest().body(Map.of("error", "No text or image provided"));
        }
        return ResponseEntity.ok(result);
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

    @GetMapping("/random-edition")
    public ResponseEntity<?> getRandomEdition() {
        return bookStore.findRandomApprovedEdition()
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/recent-editions")
    public List<RecentEditionDto> getRecentEditions(@RequestParam(defaultValue = "9") int size) {
        return bookStore.findRecentEditions(Math.min(size, 20));
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
        boolean isAdmin = AuthHelper.isAdmin(session);
        boolean includePending = isAdmin;
        return bookStore.findDetailById(bookId, includePending)
                .map(detail -> {
                    if (isAdmin) return detail;
                    List<BookEdition> visible = detail.getEditions().stream()
                            .filter(e -> !isEditionHidden(e.getId(), username))
                            .toList();
                    return new BookDetailResponse(
                            detail.getId(), detail.getTitle(), detail.getAuthor(),
                            detail.getAuthorId(), detail.getSeriesName(), detail.getVolumeNumber(),
                            visible);
                })
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
        // Auto-set language from subscription's defaultLanguage if not already set
        if ((edition.getLanguage() == null || edition.getLanguage().isBlank())
                && edition.getSubscriptionId() != null && !edition.getSubscriptionId().isBlank()) {
            subscriptionRepository.findById(edition.getSubscriptionId()).ifPresent(sub -> {
                if (sub.getDefaultLanguage() != null && !sub.getDefaultLanguage().isBlank()) {
                    edition.setLanguage(sub.getDefaultLanguage());
                }
            });
        }
        return bookStore.addEdition(bookId, edition)
                .map(saved -> {
                    bookStore.linkEditionToMonth(saved);
                    // Notify users who favorited this book, its author, or artists
                    bookStore.findById(bookId).ifPresent(book -> {
                        String edName = saved.getEditionName() != null ? saved.getEditionName() : "New edition";
                        favoriteNotificationService.notifyBookFavoriters(bookId, edName, book.getTitle());
                        if (book.getAuthorId() != null && !book.getAuthorId().isBlank()) {
                            favoriteNotificationService.notifyAuthorFavoriters(
                                    book.getAuthorId(), book.getAuthor() != null ? book.getAuthor() : "Author", edName);
                        }
                        if (saved.getArtists() != null) {
                            saved.getArtists().stream()
                                    .filter(ac -> ac.getArtistId() != null && !ac.getArtistId().isBlank())
                                    .forEach(ac -> favoriteNotificationService.notifyArtistFavoriters(
                                            ac.getArtistId(), ac.getArtistName(), edName));
                        }
                    });
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

    // ─── Edition visibility helper ────────────────────────────────────────────

    private boolean isEditionHidden(String editionId, String username) {
        var saleLinks = saleAnnouncementEditionRepo.findByEditionId(editionId);
        if (saleLinks.isEmpty()) return false;
        String today = LocalDate.now().toString();
        for (var link : saleLinks) {
            var saleOpt = saleAnnouncementRepo.findById(link.getSaleId());
            if (saleOpt.isEmpty()) continue;
            String saleDate = saleOpt.get().getGeneralSaleDate();
            if (saleDate != null && saleDate.compareTo(today) > 0) {
                // Sale is in the future — check if user owns this edition
                if (username == null) return true;
                if (userBookEntryRepo.findByUserUsernameAndEditionId(username, editionId).isEmpty()) {
                    return true;
                }
            }
        }
        return false;
    }
}