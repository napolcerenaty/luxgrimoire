package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.AppUser;
import com.luxgrimoire.backend.repository.*;
import com.luxgrimoire.backend.util.AppConstants;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final AppUserRepository              userRepository;
    private final AuthController                 authController;
    private final UserFavoriteBookRepository     favBookRepo;
    private final UserFavoriteEditionRepository  favEditionRepo;
    private final UserFavoriteAuthorRepository   favAuthorRepo;
    private final UserFavoriteArtistRepository   favArtistRepo;
    private final UserFavoriteCompanyRepository  favCompanyRepo;
    private final FriendRequestRepository        friendRepo;
    private final UserFollowRepository           followRepo;

    public UserController(AppUserRepository userRepository,
                          AuthController authController,
                          UserFavoriteBookRepository favBookRepo,
                          UserFavoriteEditionRepository favEditionRepo,
                          UserFavoriteAuthorRepository favAuthorRepo,
                          UserFavoriteArtistRepository favArtistRepo,
                          UserFavoriteCompanyRepository favCompanyRepo,
                          FriendRequestRepository friendRepo,
                          UserFollowRepository followRepo) {
        this.userRepository  = userRepository;
        this.authController  = authController;
        this.favBookRepo     = favBookRepo;
        this.favEditionRepo  = favEditionRepo;
        this.favAuthorRepo   = favAuthorRepo;
        this.favArtistRepo   = favArtistRepo;
        this.favCompanyRepo  = favCompanyRepo;
        this.friendRepo      = friendRepo;
        this.followRepo      = followRepo;
    }

    // ── Relationship levels ───────────────────────────────────────────────────

    /** Returns viewer's relationship level to target: SELF, FRIEND, FOLLOWER, PUBLIC */
    private String resolveRelationship(String viewer, String target) {
        if (viewer == null) return "PUBLIC";
        if (viewer.equals(target)) return "SELF";
        if (friendRepo.areFriends(viewer, target)) return "FRIEND";
        if (followRepo.existsByFollowerUsernameAndFollowingUsername(viewer, target)) return "FOLLOWER";
        return "PUBLIC";
    }

    private boolean isVisible(String privacyLevel, String relationship) {
        if ("SELF".equals(relationship)) return true;
        return switch (privacyLevel != null ? privacyLevel : "PUBLIC") {
            case "PUBLIC"    -> true;
            case "FOLLOWERS" -> "FRIEND".equals(relationship) || "FOLLOWER".equals(relationship);
            case "FRIENDS"   -> "FRIEND".equals(relationship);
            case "PRIVATE"   -> false;
            default          -> false;
        };
    }

    @GetMapping("/search")
    public ResponseEntity<?> searchUsers(@RequestParam String q, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        if (q == null || q.trim().length() < 2) return ResponseEntity.ok(List.of());
        List<AppUser> found = userRepository.searchByUsername(q.trim().toLowerCase(), me);
        return ResponseEntity.ok(found.stream().map(u -> Map.of(
            "username",    u.getUsername(),
            "firstName",   u.getFirstName() != null ? u.getFirstName() : "",
            "lastName",    u.getLastName() != null ? u.getLastName() : "",
            "avatarUrl",   u.getAvatarUrl() != null ? u.getAvatarUrl() : "",
            "libraryPublic", u.isLibraryPublic()
        )).toList());
    }

    /** Public profile — no login required. Returns data according to privacy levels. */
    @GetMapping("/{username}/profile")
    public ResponseEntity<?> getUserProfile(@PathVariable String username, HttpSession session) {
        String viewer = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        return userRepository.findById(username).map(u -> {
            String rel = resolveRelationship(viewer, username);

            Map<String, Object> profile = new LinkedHashMap<>();
            profile.put("username",       u.getUsername());
            profile.put("firstName",      u.getFirstName()  != null ? u.getFirstName()  : "");
            profile.put("avatarUrl",      u.getAvatarUrl()  != null ? u.getAvatarUrl()  : "");
            profile.put("relationship",   rel);
            profile.put("followerCount",  followRepo.countByFollowingUsername(username));
            profile.put("followingCount", followRepo.countByFollowerUsername(username));

            // Privacy levels visible to viewer for UI hints
            profile.put("profilePrivacy",       orDefault(u.getProfilePrivacy(),       "PUBLIC"));
            profile.put("collectionPrivacy",     orDefault(u.getCollectionPrivacy(),    "FRIENDS"));
            profile.put("isoPrivacy",            orDefault(u.getIsoPrivacy(),           "FRIENDS"));
            profile.put("interestedPrivacy",     orDefault(u.getInterestedPrivacy(),    "FOLLOWERS"));
            profile.put("subscriptionsPrivacy",  orDefault(u.getSubscriptionsPrivacy(), "PRIVATE"));
            profile.put("favoritesPrivacy",      orDefault(u.getFavoritesPrivacy(),     "PUBLIC"));

            // Bio & social — gated by profilePrivacy
            if (isVisible(u.getProfilePrivacy(), rel)) {
                profile.put("bioPublic",     u.getBioPublic()     != null ? u.getBioPublic()     : "");
                profile.put("goodreadsUrl",  u.getGoodreadsUrl()  != null ? u.getGoodreadsUrl()  : "");
                profile.put("storygraphUrl", u.getStorygraphUrl() != null ? u.getStorygraphUrl() : "");
                profile.put("instagramUrl",  u.getInstagramUrl()  != null ? u.getInstagramUrl()  : "");
                profile.put("twitterUrl",    u.getTwitterUrl()    != null ? u.getTwitterUrl()    : "");
            }

            // Favorites — gated by favoritesPrivacy
            if (isVisible(u.getFavoritesPrivacy(), rel)) {
                Map<String, Object> favs = new LinkedHashMap<>();
                favs.put("books",     favBookRepo.findByUsernameOrderByAddedAtDesc(username));
                favs.put("editions",  favEditionRepo.findByUsernameOrderByAddedAtDesc(username));
                favs.put("authors",   favAuthorRepo.findByUsernameOrderByAddedAtDesc(username));
                favs.put("artists",   favArtistRepo.findByUsernameOrderByAddedAtDesc(username));
                favs.put("companies", favCompanyRepo.findByUsernameOrderByAddedAtDesc(username));
                profile.put("favorites", favs);
                profile.put("favoritesVisible", true);
            } else {
                profile.put("favoritesVisible", false);
            }

            return ResponseEntity.ok((Object) profile);
        }).orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/me/privacy")
    public ResponseEntity<?> updatePrivacy(@RequestBody Map<String, Object> body, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        return userRepository.findById(me).map(u -> {
            // Legacy boolean fields
            if (body.containsKey("libraryPublic"))    u.setLibraryPublic(Boolean.TRUE.equals(body.get("libraryPublic")));
            if (body.containsKey("messagingPrivate")) u.setMessagingPrivate(Boolean.TRUE.equals(body.get("messagingPrivate")));
            if (body.containsKey("favoritesPublic"))  u.setFavoritesPublic(Boolean.TRUE.equals(body.get("favoritesPublic")));
            // New granular privacy levels
            if (body.containsKey("profilePrivacy"))       u.setProfilePrivacy(sanitizePrivacy((String) body.get("profilePrivacy")));
            if (body.containsKey("collectionPrivacy"))    u.setCollectionPrivacy(sanitizePrivacy((String) body.get("collectionPrivacy")));
            if (body.containsKey("isoPrivacy"))           u.setIsoPrivacy(sanitizePrivacy((String) body.get("isoPrivacy")));
            if (body.containsKey("interestedPrivacy"))    u.setInterestedPrivacy(sanitizePrivacy((String) body.get("interestedPrivacy")));
            if (body.containsKey("subscriptionsPrivacy")) u.setSubscriptionsPrivacy(sanitizePrivacy((String) body.get("subscriptionsPrivacy")));
            if (body.containsKey("favoritesPrivacy"))     u.setFavoritesPrivacy(sanitizePrivacy((String) body.get("favoritesPrivacy")));
            userRepository.save(u);
            return ResponseEntity.ok(authController.toDto(u));
        }).orElse(ResponseEntity.status(404).build());
    }

    @PutMapping("/me/social")
    public ResponseEntity<?> updateSocial(@RequestBody Map<String, String> body, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        return userRepository.findById(me).map(u -> {
            if (body.containsKey("bioPublic"))     u.setBioPublic(body.get("bioPublic"));
            if (body.containsKey("goodreadsUrl"))  u.setGoodreadsUrl(body.get("goodreadsUrl"));
            if (body.containsKey("storygraphUrl")) u.setStorygraphUrl(body.get("storygraphUrl"));
            if (body.containsKey("instagramUrl"))  u.setInstagramUrl(body.get("instagramUrl"));
            if (body.containsKey("twitterUrl"))    u.setTwitterUrl(body.get("twitterUrl"));
            userRepository.save(u);
            return ResponseEntity.ok(authController.toDto(u));
        }).orElse(ResponseEntity.status(404).build());
    }

    private String sanitizePrivacy(String value) {
        return Set.of("PUBLIC", "FOLLOWERS", "FRIENDS", "PRIVATE").contains(value) ? value : "PUBLIC";
    }

    private String orDefault(String value, String def) {
        return value != null ? value : def;
    }
}

