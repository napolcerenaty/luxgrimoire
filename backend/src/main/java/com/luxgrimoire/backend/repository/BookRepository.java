package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.Book;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface BookRepository extends JpaRepository<Book, String> {

    @Query("""
        SELECT DISTINCT b FROM Book b LEFT JOIN FETCH b.editions e
        WHERE LOWER(b.title) LIKE :q
           OR LOWER(b.author) LIKE :q
           OR LOWER(b.seriesName) LIKE :q
           OR LOWER(e.editionName) LIKE :q
           OR LOWER(e.subscriptionName) LIKE :q
        """)
    List<Book> searchByQuery(@Param("q") String pattern);

    long countByAuthorId(String authorId);

    @Query("SELECT COUNT(b) FROM Book b WHERE b.authorId = :authorId AND b.status = 'approved'")
    long countApprovedByAuthorId(@Param("authorId") String authorId);

    List<Book> findByStatus(String status);

    Page<Book> findByStatus(String status, Pageable pageable);

    List<Book> findByAuthorIdAndStatus(String authorId, String status);

    Optional<Book> findByTitleIgnoreCase(String title);

    List<Book> findBySeriesNameIgnoreCase(String seriesName);

    @Query("SELECT DISTINCT b.seriesName FROM Book b WHERE b.seriesName IS NOT NULL AND b.seriesName <> '' ORDER BY b.seriesName")
    List<String> findDistinctSeriesNames();

    @Query("SELECT b FROM Book b LEFT JOIN FETCH b.editions WHERE b.id = :id")
    Optional<Book> findWithEditionsById(@Param("id") String id);

    @Query(value = """
        SELECT i.image_url FROM book_edition e
        JOIN book_edition_image i ON i.edition_id = e.id
        WHERE e.book_id = :bookId
        ORDER BY i.sort_order
        LIMIT 1
        """, nativeQuery = true)
    Optional<String> findFirstImageUrlByBookId(@Param("bookId") String bookId);
}

