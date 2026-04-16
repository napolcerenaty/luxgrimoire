package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.UserFavoriteBook;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserFavoriteBookRepository extends JpaRepository<UserFavoriteBook, String> {
    List<UserFavoriteBook> findByUsernameOrderByAddedAtDesc(String username);
    Optional<UserFavoriteBook> findByUsernameAndBookId(String username, String bookId);
    boolean existsByUsernameAndBookId(String username, String bookId);
    void deleteByUsernameAndBookId(String username, String bookId);
    long countByBookId(String bookId);
    List<UserFavoriteBook> findByBookIdAndNotifyTrue(String bookId);
}
