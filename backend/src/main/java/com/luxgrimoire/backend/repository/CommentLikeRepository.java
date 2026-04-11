package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.CommentLike;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CommentLikeRepository extends JpaRepository<CommentLike, String> {
    Optional<CommentLike> findByCommentIdAndUsername(String commentId, String username);
    boolean existsByCommentIdAndUsername(String commentId, String username);
    long countByCommentId(String commentId);
}
