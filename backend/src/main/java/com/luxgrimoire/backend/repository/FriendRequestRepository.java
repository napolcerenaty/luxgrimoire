package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.FriendRequest;
import com.luxgrimoire.backend.model.FriendRequest.FriendRequestStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FriendRequestRepository extends JpaRepository<FriendRequest, String> {

    Optional<FriendRequest> findBySenderUsernameAndReceiverUsernameAndStatus(
        String sender, String receiver, FriendRequestStatus status);

    List<FriendRequest> findByReceiverUsernameAndStatus(String receiver, FriendRequestStatus status);
    List<FriendRequest> findBySenderUsernameAndStatus(String sender, FriendRequestStatus status);

    @Query("SELECT r FROM FriendRequest r WHERE r.status = 'ACCEPTED' AND (r.senderUsername = :u OR r.receiverUsername = :u)")
    List<FriendRequest> findFriendships(@Param("u") String username);

    @Query("SELECT COUNT(r) > 0 FROM FriendRequest r WHERE r.status = 'ACCEPTED' AND ((r.senderUsername = :a AND r.receiverUsername = :b) OR (r.senderUsername = :b AND r.receiverUsername = :a))")
    boolean areFriends(@Param("a") String a, @Param("b") String b);

    @Query("SELECT r FROM FriendRequest r WHERE (r.senderUsername = :a AND r.receiverUsername = :b) OR (r.senderUsername = :b AND r.receiverUsername = :a) ORDER BY r.createdAt DESC")
    List<FriendRequest> findBetween(@Param("a") String a, @Param("b") String b);

    @Query("SELECT r FROM FriendRequest r WHERE r.status = 'ACCEPTED' AND (r.senderUsername = :u OR r.receiverUsername = :u) ORDER BY r.updatedAt DESC")
    List<FriendRequest> findAcceptedFriendships(@Param("u") String username);
}
