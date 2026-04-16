package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.UserFavoriteEdition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserFavoriteEditionRepository extends JpaRepository<UserFavoriteEdition, String> {
    List<UserFavoriteEdition> findByUsernameOrderByAddedAtDesc(String username);
    Optional<UserFavoriteEdition> findByUsernameAndEditionId(String username, String editionId);
    boolean existsByUsernameAndEditionId(String username, String editionId);
    void deleteByUsernameAndEditionId(String username, String editionId);
    long countByEditionId(String editionId);
    List<UserFavoriteEdition> findByEditionIdAndNotifyTrue(String editionId);
}
