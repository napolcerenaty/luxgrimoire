package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.OlAuthor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface OlAuthorRepository extends JpaRepository<OlAuthor, String> {

    Page<OlAuthor> findByNameContainingIgnoreCase(String name, Pageable pageable);
}
