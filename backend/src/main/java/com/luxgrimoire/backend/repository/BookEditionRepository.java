package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.Book;
import com.luxgrimoire.backend.model.BookEdition;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

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

    @Query("SELECT e FROM BookEdition e LEFT JOIN e.book b WHERE e.bookBoxCompanyId = :companyId AND (" +
           "LOWER(e.editionName) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(e.subscriptionName) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(b.title) LIKE LOWER(CONCAT('%', :q, '%')))")
    List<BookEdition> searchByCompanyAndText(@Param("companyId") String companyId, @Param("q") String q,
                                             org.springframework.data.domain.Pageable pageable);

    @Query("SELECT e.book FROM BookEdition e WHERE e.id = :id")
    Optional<Book> findBookByEditionId(@Param("id") String id);

    @Query("SELECT e FROM BookEdition e LEFT JOIN e.book b WHERE (" +
           "LOWER(e.editionName) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(b.title) LIKE LOWER(CONCAT('%', :q, '%')))")
    List<BookEdition> searchByText(@Param("q") String q, org.springframework.data.domain.Pageable pageable);

    @Query("SELECT e FROM BookEdition e JOIN FETCH e.book WHERE e.id = :id")
    Optional<BookEdition> findByIdWithBook(@Param("id") String id);

    @Query("SELECT e FROM BookEdition e JOIN FETCH e.book b WHERE SIZE(e.imageUrls) > 0 AND b.status = 'approved' ORDER BY e.createdAt DESC")
    List<BookEdition> findRecentWithImages(org.springframework.data.domain.Pageable pageable);
}
