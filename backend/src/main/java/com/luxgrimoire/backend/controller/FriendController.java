package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.AppUser;
import com.luxgrimoire.backend.model.FriendRequest;
import com.luxgrimoire.backend.service.FriendService;
import com.luxgrimoire.backend.util.AppConstants;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/friends")
public class FriendController {

    private final FriendService friendService;

    public FriendController(FriendService friendService) {
        this.friendService = friendService;
    }

    @GetMapping
    public ResponseEntity<?> getFriends(HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        List<AppUser> friends = friendService.getFriends(me);
        return ResponseEntity.ok(friends.stream().map(u -> Map.of(
            "username", u.getUsername(),
            "firstName", u.getFirstName() != null ? u.getFirstName() : "",
            "lastName", u.getLastName() != null ? u.getLastName() : "",
            "avatarUrl", u.getAvatarUrl() != null ? u.getAvatarUrl() : ""
        )).toList());
    }

    @GetMapping("/requests/pending")
    public ResponseEntity<?> getPendingRequests(HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        List<FriendRequest> incoming = friendService.getPendingIncoming(me);
        List<FriendRequest> outgoing = friendService.getPendingOutgoing(me);
        return ResponseEntity.ok(Map.of("incoming", incoming, "outgoing", outgoing));
    }

    @GetMapping("/status/{username}")
    public ResponseEntity<?> getStatus(@PathVariable String username, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        String status = friendService.getStatus(me, username);
        return ResponseEntity.ok(Map.of("status", status));
    }

    @PostMapping("/request/{username}")
    public ResponseEntity<?> sendRequest(@PathVariable String username, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        try {
            FriendRequest req = friendService.sendRequest(me, username);
            return ResponseEntity.ok(req);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(409).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/accept/{requestId}")
    public ResponseEntity<?> acceptRequest(@PathVariable String requestId, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        try {
            FriendRequest req = friendService.acceptRequest(requestId, me);
            return ResponseEntity.ok(req);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/reject/{requestId}")
    public ResponseEntity<?> rejectRequest(@PathVariable String requestId, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        try {
            FriendRequest req = friendService.rejectRequest(requestId, me);
            return ResponseEntity.ok(req);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{username}")
    public ResponseEntity<?> removeFriend(@PathVariable String username, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        friendService.removeFriend(me, username);
        return ResponseEntity.ok().build();
    }
}
