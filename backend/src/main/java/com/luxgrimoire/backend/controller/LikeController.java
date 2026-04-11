package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.CommentLike;
import com.luxgrimoire.backend.model.EditionLike;
import com.luxgrimoire.backend.repository.CommentLikeRepository;
import com.luxgrimoire.backend.repository.EditionCommentRepository;
import com.luxgrimoire.backend.repository.EditionLikeRepository;
import com.luxgrimoire.backend.util.AppConstants;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class LikeController {

    private final EditionLikeRepository editionLikeRepo;
    private final CommentLikeRepository commentLikeRepo;
    private final EditionCommentRepository commentRepo;

    public LikeController(EditionLikeRepository editionLikeRepo,
                          CommentLikeRepository commentLikeRepo,
                          EditionCommentRepository commentRepo) {
        this.editionLikeRepo = editionLikeRepo;
        this.commentLikeRepo = commentLikeRepo;
        this.commentRepo = commentRepo;
    }

    // ── Edition likes ──────────────────────────────────────────────────────

    @PostMapping("/editions/{editionId}/likes")
    public ResponseEntity<?> likeEdition(@PathVariable String editionId, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        if (editionLikeRepo.existsByEditionIdAndUsername(editionId, username))
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Already liked"));
        EditionLike like = new EditionLike();
        like.setEditionId(editionId);
        like.setUsername(username);
        editionLikeRepo.save(like);
        return ResponseEntity.ok(Map.of("likes", editionLikeRepo.countByEditionId(editionId)));
    }

    @DeleteMapping("/editions/{editionId}/likes")
    public ResponseEntity<?> unlikeEdition(@PathVariable String editionId, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        return editionLikeRepo.findByEditionIdAndUsername(editionId, username)
                .map(like -> {
                    editionLikeRepo.delete(like);
                    return ResponseEntity.ok(Map.of("likes", editionLikeRepo.countByEditionId(editionId)));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/editions/{editionId}/likes")
    public Map<String, Object> getEditionLikes(@PathVariable String editionId, HttpSession session) {
        String username = resolveUsername(session);
        long count = editionLikeRepo.countByEditionId(editionId);
        boolean liked = username != null && editionLikeRepo.existsByEditionIdAndUsername(editionId, username);
        return Map.of("likes", count, "liked", liked);
    }

    // ── Comment likes ──────────────────────────────────────────────────────

    @PostMapping("/comments/{commentId}/likes")
    @Transactional
    public ResponseEntity<?> likeComment(@PathVariable String commentId, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        if (commentLikeRepo.existsByCommentIdAndUsername(commentId, username))
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Already liked"));
        CommentLike like = new CommentLike();
        like.setCommentId(commentId);
        like.setUsername(username);
        commentLikeRepo.save(like);
        commentRepo.findById(commentId).ifPresent(c -> {
            c.setLikeCount((int) commentLikeRepo.countByCommentId(commentId));
            commentRepo.save(c);
        });
        return ResponseEntity.ok(Map.of("likes", commentLikeRepo.countByCommentId(commentId)));
    }

    @DeleteMapping("/comments/{commentId}/likes")
    @Transactional
    public ResponseEntity<?> unlikeComment(@PathVariable String commentId, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        return commentLikeRepo.findByCommentIdAndUsername(commentId, username)
                .map(like -> {
                    commentLikeRepo.delete(like);
                    long count = commentLikeRepo.countByCommentId(commentId);
                    commentRepo.findById(commentId).ifPresent(c -> {
                        c.setLikeCount((int) count);
                        commentRepo.save(c);
                    });
                    return ResponseEntity.ok(Map.of("likes", count));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private String resolveUsername(HttpSession session) {
        return (String) session.getAttribute(AppConstants.SESSION_USERNAME);
    }

    private ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not authenticated"));
    }
}
