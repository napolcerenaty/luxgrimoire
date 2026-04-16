package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.AppUser;
import com.luxgrimoire.backend.model.UserFollow;
import com.luxgrimoire.backend.repository.AppUserRepository;
import com.luxgrimoire.backend.repository.UserFollowRepository;
import com.luxgrimoire.backend.util.AppConstants;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/follow")
public class FollowController {

    private final UserFollowRepository followRepo;
    private final AppUserRepository    userRepo;

    public FollowController(UserFollowRepository followRepo, AppUserRepository userRepo) {
        this.followRepo = followRepo;
        this.userRepo   = userRepo;
    }

    /** Follow a user */
    @PostMapping("/{username}")
    @Transactional
    public ResponseEntity<?> follow(@PathVariable String username, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        if (me.equals(username)) return ResponseEntity.badRequest().body("Cannot follow yourself");
        if (!userRepo.existsById(username)) return ResponseEntity.notFound().build();
        if (followRepo.existsByFollowerUsernameAndFollowingUsername(me, username)) {
            return ResponseEntity.ok(Map.of("following", true));
        }
        followRepo.save(new UserFollow(me, username));
        return ResponseEntity.ok(Map.of("following", true));
    }

    /** Unfollow a user */
    @DeleteMapping("/{username}")
    @Transactional
    public ResponseEntity<?> unfollow(@PathVariable String username, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        followRepo.deleteByFollowerUsernameAndFollowingUsername(me, username);
        return ResponseEntity.ok(Map.of("following", false));
    }

    /** Get follow status and counts for a user */
    @GetMapping("/status/{username}")
    public ResponseEntity<?> status(@PathVariable String username, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        boolean following = me != null && followRepo.existsByFollowerUsernameAndFollowingUsername(me, username);
        long followerCount  = followRepo.countByFollowingUsername(username);
        long followingCount = followRepo.countByFollowerUsername(username);
        return ResponseEntity.ok(Map.of(
            "following",      following,
            "followerCount",  followerCount,
            "followingCount", followingCount
        ));
    }

    /** Who follows ME */
    @GetMapping("/followers")
    public ResponseEntity<?> myFollowers(HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(mapFollowList(
            followRepo.findByFollowingUsernameOrderByCreatedAtDesc(me),
            u -> u.getFollowerUsername()
        ));
    }

    /** Who I FOLLOW */
    @GetMapping("/following")
    public ResponseEntity<?> myFollowing(HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(mapFollowList(
            followRepo.findByFollowerUsernameOrderByCreatedAtDesc(me),
            u -> u.getFollowingUsername()
        ));
    }

    /** Public: who follows a given user */
    @GetMapping("/{username}/followers")
    public ResponseEntity<?> userFollowers(@PathVariable String username) {
        return ResponseEntity.ok(mapFollowList(
            followRepo.findByFollowingUsernameOrderByCreatedAtDesc(username),
            u -> u.getFollowerUsername()
        ));
    }

    /** Public: who a given user follows */
    @GetMapping("/{username}/following")
    public ResponseEntity<?> userFollowing(@PathVariable String username) {
        return ResponseEntity.ok(mapFollowList(
            followRepo.findByFollowerUsernameOrderByCreatedAtDesc(username),
            u -> u.getFollowingUsername()
        ));
    }

    private List<Map<String, Object>> mapFollowList(List<UserFollow> follows,
                                                    java.util.function.Function<UserFollow, String> usernameExtractor) {
        return follows.stream().map(f -> {
            String targetUsername = usernameExtractor.apply(f);
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("username",  targetUsername);
            entry.put("followedAt", f.getCreatedAt());
            userRepo.findById(targetUsername).ifPresent(u -> {
                entry.put("firstName", u.getFirstName() != null ? u.getFirstName() : "");
                entry.put("avatarUrl", u.getAvatarUrl() != null ? u.getAvatarUrl() : "");
            });
            return entry;
        }).toList();
    }
}
