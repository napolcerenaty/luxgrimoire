package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.UserFollow;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserFollowRepository extends JpaRepository<UserFollow, Long> {

    Optional<UserFollow> findByFollowerUsernameAndFollowingUsername(String follower, String following);

    boolean existsByFollowerUsernameAndFollowingUsername(String follower, String following);

    List<UserFollow> findByFollowerUsernameOrderByCreatedAtDesc(String follower);

    List<UserFollow> findByFollowingUsernameOrderByCreatedAtDesc(String following);

    long countByFollowingUsername(String following);

    long countByFollowerUsername(String follower);

    void deleteByFollowerUsernameAndFollowingUsername(String follower, String following);

    @Query("SELECT f.followingUsername FROM UserFollow f WHERE f.followerUsername = :me")
    List<String> findFollowingUsernames(@Param("me") String me);
}
