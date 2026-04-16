package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.OlBook;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface OlBookRepository extends JpaRepository<OlBook, String> {

    Page<OlBook> findByTitleContainingIgnoreCase(String title, Pageable pageable);
}
