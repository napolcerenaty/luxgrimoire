package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.EditionComment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EditionCommentRepository extends JpaRepository<EditionComment, String> {
    Page<EditionComment> findByEditionIdOrderByCreatedAtDesc(String editionId, Pageable pageable);
    long countByEditionId(String editionId);
}
