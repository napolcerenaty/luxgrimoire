package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.Author;
import com.luxgrimoire.backend.model.Book;
import com.luxgrimoire.backend.model.OlAuthor;
import com.luxgrimoire.backend.model.OlBook;
import com.luxgrimoire.backend.repository.AuthorRepository;
import com.luxgrimoire.backend.repository.BookRepository;
import com.luxgrimoire.backend.repository.OlAuthorRepository;
import com.luxgrimoire.backend.repository.OlBookRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class OlCatalogService {

    private final OlAuthorRepository olAuthorRepo;
    private final OlBookRepository   olBookRepo;
    private final AuthorRepository   authorRepo;
    private final BookRepository     bookRepo;
    private final JdbcTemplate       jdbc;

    public OlCatalogService(OlAuthorRepository olAuthorRepo,
                            OlBookRepository olBookRepo,
                            AuthorRepository authorRepo,
                            BookRepository bookRepo,
                            JdbcTemplate jdbc) {
        this.olAuthorRepo = olAuthorRepo;
        this.olBookRepo   = olBookRepo;
        this.authorRepo   = authorRepo;
        this.bookRepo     = bookRepo;
        this.jdbc         = jdbc;
    }

    // ── Search ──────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public Page<OlAuthor> searchAuthors(String q, int page, int size) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by("name"));
        if (q == null || q.isBlank()) {
            return olAuthorRepo.findAll(pageable);
        }
        return olAuthorRepo.findByNameContainingIgnoreCase(q.trim(), pageable);
    }

    @Transactional(readOnly = true)
    public Page<OlBook> searchBooks(String q, int page, int size) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by("title"));
        if (q == null || q.isBlank()) {
            return olBookRepo.findAll(pageable);
        }
        return olBookRepo.findByTitleContainingIgnoreCase(q.trim(), pageable);
    }

    /**
     * Returns author names for a given ol_book_key, looked up via the junction table.
     * Used by the book-search response to display who wrote the book.
     */
    @Transactional(readOnly = true)
    public List<String> getAuthorNamesForBook(String olBookKey) {
        return jdbc.queryForList(
            "SELECT a.name FROM ol_book_author ba JOIN ol_author a ON a.ol_key = ba.ol_author_key WHERE ba.ol_book_key = ?",
            String.class,
            olBookKey
        );
    }

    // ── Promote author ──────────────────────────────────────────────────────────

    /**
     * Promotes an ol_author record to a real Author entity.
     * If already promoted, returns the existing Author.
     */
    @Transactional
    public PromoteResult<Author> promoteAuthor(String olKey) {
        OlAuthor olAuthor = olAuthorRepo.findById(olKey)
                .orElseThrow(() -> new IllegalArgumentException("OL author not found: " + olKey));

        if (olAuthor.getAuthorId() != null) {
            return authorRepo.findById(olAuthor.getAuthorId())
                    .map(a -> new PromoteResult<>(a, true))
                    .orElseGet(() -> {
                        // Stale link — re-create
                        olAuthor.setAuthorId(null);
                        return doCreateAuthor(olAuthor);
                    });
        }
        return doCreateAuthor(olAuthor);
    }

    private PromoteResult<Author> doCreateAuthor(OlAuthor olAuthor) {
        Author author = new Author();
        author.setName(olAuthor.getName());
        Author saved = authorRepo.save(author);
        olAuthor.setAuthorId(saved.getId());
        olAuthorRepo.save(olAuthor);
        return new PromoteResult<>(saved, false);
    }

    // ── Promote book ────────────────────────────────────────────────────────────

    /**
     * Promotes an ol_book record to a real Book entity.
     * If already promoted, returns the existing Book.
     *
     * @param olKey      the OL work key, e.g. /works/OL123W
     * @param authorId   (optional) existing Author.id to link; auto-resolved if absent
     * @param authorName (optional) fallback display name when no Author record is linked
     */
    @Transactional
    public PromoteResult<Book> promoteBook(String olKey, String authorId, String authorName) {
        OlBook olBook = olBookRepo.findById(olKey)
                .orElseThrow(() -> new IllegalArgumentException("OL book not found: " + olKey));

        if (olBook.getBookId() != null) {
            return bookRepo.findById(olBook.getBookId())
                    .map(b -> new PromoteResult<>(b, true))
                    .orElseGet(() -> {
                        olBook.setBookId(null);
                        return doCreateBook(olBook, authorId, authorName);
                    });
        }
        return doCreateBook(olBook, authorId, authorName);
    }

    private PromoteResult<Book> doCreateBook(OlBook olBook, String authorId, String authorName) {
        // Auto-resolve author if not supplied: find first linked ol_author for this work
        String resolvedAuthorId   = authorId;
        String resolvedAuthorName = authorName;

        if (resolvedAuthorId == null || resolvedAuthorId.isBlank()) {
            List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT a.author_id, a.name FROM ol_book_author ba " +
                "JOIN ol_author a ON a.ol_key = ba.ol_author_key " +
                "WHERE ba.ol_book_key = ? AND a.author_id IS NOT NULL LIMIT 1",
                olBook.getOlKey()
            );
            if (!rows.isEmpty()) {
                Object aid = rows.get(0).get("author_id");
                resolvedAuthorId = aid != null ? aid.toString() : null;
            }
        }

        if ((resolvedAuthorName == null || resolvedAuthorName.isBlank()) && resolvedAuthorId == null) {
            // Fall back: use any ol_author name
            List<String> names = jdbc.queryForList(
                "SELECT a.name FROM ol_book_author ba JOIN ol_author a ON a.ol_key = ba.ol_author_key WHERE ba.ol_book_key = ? LIMIT 1",
                String.class, olBook.getOlKey()
            );
            if (!names.isEmpty()) resolvedAuthorName = names.get(0);
        }

        if (resolvedAuthorName == null && resolvedAuthorId != null) {
            resolvedAuthorName = authorRepo.findById(resolvedAuthorId)
                    .map(Author::getName).orElse(null);
        }

        Book book = new Book();
        book.setTitle(olBook.getTitle());
        book.setSeriesName(olBook.getSeriesName());
        book.setVolumeNumber(olBook.getSeriesPosition());
        book.setAuthorId(resolvedAuthorId);
        book.setAuthor(resolvedAuthorName);
        book.setStatus("approved");
        Book saved = bookRepo.save(book);

        olBook.setBookId(saved.getId());
        olBookRepo.save(olBook);

        return new PromoteResult<>(saved, false);
    }

    // ── Result wrapper ──────────────────────────────────────────────────────────

    public record PromoteResult<T>(T entity, boolean alreadyExisted) {}
}
