package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.BookEdition;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface BookEditionRepository extends JpaRepository<BookEdition, String> {
    List<BookEdition> findByBookId(String bookId);
}
