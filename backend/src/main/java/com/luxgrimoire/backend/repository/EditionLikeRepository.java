package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.EditionLike;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface EditionLikeRepository extends JpaRepository<EditionLike, String> {
    Optional<EditionLike> findByEditionIdAndUsername(String editionId, String username);
    boolean existsByEditionIdAndUsername(String editionId, String username);
    long countByEditionId(String editionId);
}
