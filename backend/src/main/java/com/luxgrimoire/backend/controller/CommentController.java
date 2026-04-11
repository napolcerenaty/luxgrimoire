package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.EditionComment;
import com.luxgrimoire.backend.repository.EditionCommentRepository;
import com.luxgrimoire.backend.service.DeletionLogService;
import com.luxgrimoire.backend.util.AppConstants;
import com.luxgrimoire.backend.util.AuthHelper;
import jakarta.servlet.http.HttpSession;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/editions/{editionId}/comments")
public class CommentController {

    private final EditionCommentRepository commentRepo;
    private final DeletionLogService       deletionLogService;

    public CommentController(EditionCommentRepository commentRepo, DeletionLogService deletionLogService) {
        this.commentRepo        = commentRepo;
        this.deletionLogService = deletionLogService;
    }

    @GetMapping
    public Page<EditionComment> getComments(
            @PathVariable String editionId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return commentRepo.findByEditionIdOrderByCreatedAtDesc(editionId, PageRequest.of(page, size));
    }

    @PostMapping
    public ResponseEntity<?> addComment(@PathVariable String editionId,
                                        @RequestBody Map<String, String> body,
                                        HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        String content = body.get("content");
        if (content == null || content.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "Content is required"));

        EditionComment comment = new EditionComment();
        comment.setEditionId(editionId);
        comment.setAuthorUsername(username);
        comment.setContent(content.trim());
        return ResponseEntity.status(HttpStatus.CREATED).body(commentRepo.save(comment));
    }

    @DeleteMapping("/{commentId}")
    public ResponseEntity<?> deleteComment(@PathVariable String editionId,
                                           @PathVariable String commentId,
                                           HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        return commentRepo.findById(commentId)
                .filter(c -> c.getEditionId().equals(editionId)
                        && (c.getAuthorUsername().equals(username) || AuthHelper.isAdmin(session)))
                .map(c -> {
                    deletionLogService.log(username, "EditionComment", commentId,
                            "Deleted comment by @" + c.getAuthorUsername()
                                    + " on edition " + editionId);
                    commentRepo.delete(c);
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }
}
