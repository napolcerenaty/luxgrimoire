package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.UserFavoriteAuthor;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserFavoriteAuthorRepository extends JpaRepository<UserFavoriteAuthor, String> {
    List<UserFavoriteAuthor> findByUsernameOrderByAddedAtDesc(String username);
    Optional<UserFavoriteAuthor> findByUsernameAndAuthorId(String username, String authorId);
    boolean existsByUsernameAndAuthorId(String username, String authorId);
    void deleteByUsernameAndAuthorId(String username, String authorId);
}
