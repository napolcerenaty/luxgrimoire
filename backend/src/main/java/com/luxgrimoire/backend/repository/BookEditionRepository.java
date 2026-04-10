package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.BookEdition;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface BookEditionRepository extends JpaRepository<BookEdition, String> {
    List<BookEdition> findByBookId(String bookId);

    @Query("SELECT DISTINCT a.contribution FROM BookEdition e JOIN e.artists a WHERE a.contribution IS NOT NULL AND a.contribution <> '' ORDER BY a.contribution")
    List<String> findDistinctContributions();
}
