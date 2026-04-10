package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.Book;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BookRepository extends JpaRepository<Book, String> {

    @Query("""
        SELECT DISTINCT b FROM Book b LEFT JOIN b.editions e
        WHERE LOWER(b.title) LIKE :q
           OR LOWER(b.author) LIKE :q
           OR LOWER(b.seriesName) LIKE :q
           OR LOWER(e.editionName) LIKE :q
           OR LOWER(e.subscriptionName) LIKE :q
        """)
    List<Book> searchByQuery(@Param("q") String pattern);

    long countByAuthorId(String authorId);

    List<Book> findByStatus(String status);

    List<Book> findByAuthorIdAndStatus(String authorId, String status);

    @Query("SELECT DISTINCT b.seriesName FROM Book b WHERE b.seriesName IS NOT NULL AND b.seriesName <> '' ORDER BY b.seriesName")
    List<String> findDistinctSeriesNames();
}
