package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.BookEdition;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BookEditionRepository extends JpaRepository<BookEdition, String> {
    List<BookEdition> findByBookId(String bookId);

    @Query("SELECT DISTINCT a.contribution FROM BookEdition e JOIN e.artists a WHERE a.contribution IS NOT NULL AND a.contribution <> '' ORDER BY a.contribution")
    List<String> findDistinctContributions();

    @Query("SELECT e FROM BookEdition e WHERE e.book.authorId = :authorId AND e.book.status = 'approved'")
    List<BookEdition> findByAuthorId(@Param("authorId") String authorId);

    @Query("SELECT e FROM BookEdition e JOIN e.artists a WHERE a.artistId = :artistId")
    List<BookEdition> findByArtistId(@Param("artistId") String artistId);

    @Query("SELECT COUNT(e) FROM BookEdition e JOIN e.artists a WHERE a.artistId = :artistId")
    long countByArtistId(@Param("artistId") String artistId);
}
