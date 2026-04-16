package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.Author;
import com.luxgrimoire.backend.model.Book;
import com.luxgrimoire.backend.model.OlAuthor;
import com.luxgrimoire.backend.model.OlBook;
import com.luxgrimoire.backend.service.OlCatalogService;
import com.luxgrimoire.backend.util.AppConstants;
import jakarta.servlet.http.HttpSession;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Admin endpoints for browsing the OL staging catalog and promoting records
 * into the production author / book tables.
 *
 * All endpoints require an active admin session.
 *
 * Search:
 *   GET /api/admin/ol-catalog/authors?q=&page=0&size=20
 *   GET /api/admin/ol-catalog/books?q=&page=0&size=20
 *
 * Promote:
 *   POST /api/admin/ol-catalog/authors/promote?olKey=/authors/OL123A
 *   POST /api/admin/ol-catalog/books/promote?olKey=/works/OL123W
 *        body (optional): { "authorId": "...", "authorName": "..." }
 */
@RestController
@RequestMapping("/api/admin/ol-catalog")
public class OlCatalogController {

    private final OlCatalogService catalogService;

    public OlCatalogController(OlCatalogService catalogService) {
        this.catalogService = catalogService;
    }

    // ── Authors search ──────────────────────────────────────────────────────────

    @GetMapping("/authors")
    public ResponseEntity<?> searchAuthors(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            HttpSession session) {

        if (!isAdmin(session)) return forbidden();

        Page<OlAuthor> result = catalogService.searchAuthors(q, page, size);
        List<Map<String, Object>> content = result.getContent().stream()
                .map(a -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("olKey",    a.getOlKey());
                    item.put("name",     a.getName());
                    item.put("authorId", a.getAuthorId());
                    item.put("linked",   a.getAuthorId() != null);
                    return item;
                })
                .toList();

        return ResponseEntity.ok(pageResponse(content, result));
    }

    // ── Books search ────────────────────────────────────────────────────────────

    @GetMapping("/books")
    public ResponseEntity<?> searchBooks(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            HttpSession session) {

        if (!isAdmin(session)) return forbidden();

        Page<OlBook> result = catalogService.searchBooks(q, page, size);
        List<Map<String, Object>> content = result.getContent().stream()
                .map(b -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("olKey",          b.getOlKey());
                    item.put("title",          b.getTitle());
                    item.put("seriesName",     b.getSeriesName());
                    item.put("seriesPosition", b.getSeriesPosition());
                    item.put("firstPubYear",   b.getFirstPubYear());
                    item.put("bookId",         b.getBookId());
                    item.put("linked",         b.getBookId() != null);
                    item.put("authorNames",    catalogService.getAuthorNamesForBook(b.getOlKey()));
                    return item;
                })
                .toList();

        return ResponseEntity.ok(pageResponse(content, result));
    }

    // ── Promote author ──────────────────────────────────────────────────────────

    /**
     * Promotes an OL author to a real Author record.
     * Usage: POST /api/admin/ol-catalog/authors/promote?olKey=/authors/OL123A
     */
    @PostMapping("/authors/promote")
    public ResponseEntity<?> promoteAuthor(
            @RequestParam String olKey,
            HttpSession session) {

        if (!isAdmin(session)) return forbidden();

        try {
            OlCatalogService.PromoteResult<Author> result = catalogService.promoteAuthor(olKey);

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("id",            result.entity().getId());
            body.put("name",          result.entity().getName());
            body.put("olKey",         olKey);
            body.put("alreadyLinked", result.alreadyExisted());
            return ResponseEntity.ok(body);

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Promote book ────────────────────────────────────────────────────────────

    /**
     * Promotes an OL book to a real Book record.
     * Usage: POST /api/admin/ol-catalog/books/promote?olKey=/works/OL123W
     * Body (optional): { "authorId": "...", "authorName": "..." }
     */
    @PostMapping("/books/promote")
    public ResponseEntity<?> promoteBook(
            @RequestParam String olKey,
            @RequestBody(required = false) Map<String, String> body,
            HttpSession session) {

        if (!isAdmin(session)) return forbidden();

        String authorId   = body != null ? body.get("authorId")   : null;
        String authorName = body != null ? body.get("authorName")  : null;

        try {
            OlCatalogService.PromoteResult<Book> result =
                    catalogService.promoteBook(olKey, authorId, authorName);

            Book book = result.entity();
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("id",            book.getId());
            resp.put("title",         book.getTitle());
            resp.put("author",        book.getAuthor());
            resp.put("authorId",      book.getAuthorId());
            resp.put("seriesName",    book.getSeriesName());
            resp.put("volumeNumber",  book.getVolumeNumber());
            resp.put("status",        book.getStatus());
            resp.put("olKey",         olKey);
            resp.put("alreadyLinked", result.alreadyExisted());
            return ResponseEntity.ok(resp);

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    private boolean isAdmin(HttpSession session) {
        Object role = session.getAttribute(AppConstants.SESSION_ROLE);
        return AppConstants.ROLE_ADMIN.equals(role);
    }

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(403).body(Map.of("error", "Forbidden"));
    }

    private static <T> Map<String, Object> pageResponse(List<T> content, Page<?> page) {
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("content",       content);
        resp.put("page",          page.getNumber());
        resp.put("size",          page.getSize());
        resp.put("totalElements", page.getTotalElements());
        resp.put("totalPages",    page.getTotalPages());
        resp.put("last",          page.isLast());
        return resp;
    }
}
