package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.AppUser;
import com.luxgrimoire.backend.model.FriendRequest;
import com.luxgrimoire.backend.model.FriendRequest.FriendRequestStatus;
import com.luxgrimoire.backend.repository.AppUserRepository;
import com.luxgrimoire.backend.repository.FriendRequestRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class FriendService {

    private final FriendRequestRepository friendRequestRepository;
    private final AppUserRepository userRepository;
    private final NotificationService notificationService;

    public FriendService(FriendRequestRepository friendRequestRepository,
                         AppUserRepository userRepository,
                         NotificationService notificationService) {
        this.friendRequestRepository = friendRequestRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
    }

    @Transactional
    public FriendRequest sendRequest(String senderUsername, String receiverUsername) {
        if (senderUsername.equals(receiverUsername)) {
            throw new IllegalArgumentException("Cannot add yourself as a friend");
        }
        if (!userRepository.existsById(receiverUsername)) {
            throw new IllegalArgumentException("User not found: " + receiverUsername);
        }
        List<FriendRequest> existing = friendRequestRepository.findBetween(senderUsername, receiverUsername);
        for (FriendRequest r : existing) {
            if (r.getStatus() == FriendRequestStatus.PENDING) {
                throw new IllegalStateException("Friend request already pending");
            }
            if (r.getStatus() == FriendRequestStatus.ACCEPTED) {
                throw new IllegalStateException("Already friends");
            }
        }
        FriendRequest req = new FriendRequest();
        req.setId(UUID.randomUUID().toString());
        req.setSenderUsername(senderUsername);
        req.setReceiverUsername(receiverUsername);
        req.setStatus(FriendRequestStatus.PENDING);
        req.setCreatedAt(LocalDateTime.now());
        req.setUpdatedAt(LocalDateTime.now());
        req = friendRequestRepository.save(req);

        notificationService.sendToUser(
            receiverUsername,
            "Zaproszenie do znajomych",
            senderUsername + " wysłał(a) Ci zaproszenie do grona znajomych.",
            "FRIEND_REQUEST",
            senderUsername
        );
        return req;
    }

    @Transactional
    public FriendRequest acceptRequest(String requestId, String receiverUsername) {
        FriendRequest req = friendRequestRepository.findById(requestId)
            .orElseThrow(() -> new IllegalArgumentException("Request not found"));
        if (!req.getReceiverUsername().equals(receiverUsername)) {
            throw new IllegalArgumentException("Not authorized");
        }
        if (req.getStatus() != FriendRequestStatus.PENDING) {
            throw new IllegalStateException("Request is not pending");
        }
        req.setStatus(FriendRequestStatus.ACCEPTED);
        req.setUpdatedAt(LocalDateTime.now());
        req = friendRequestRepository.save(req);

        notificationService.sendToUser(
            req.getSenderUsername(),
            "Zaproszenie zaakceptowane",
            receiverUsername + " zaakceptował(a) Twoje zaproszenie do grona znajomych.",
            "FRIEND_ACCEPTED",
            receiverUsername
        );
        return req;
    }

    @Transactional
    public FriendRequest rejectRequest(String requestId, String receiverUsername) {
        FriendRequest req = friendRequestRepository.findById(requestId)
            .orElseThrow(() -> new IllegalArgumentException("Request not found"));
        if (!req.getReceiverUsername().equals(receiverUsername)) {
            throw new IllegalArgumentException("Not authorized");
        }
        if (req.getStatus() != FriendRequestStatus.PENDING) {
            throw new IllegalStateException("Request is not pending");
        }
        req.setStatus(FriendRequestStatus.REJECTED);
        req.setUpdatedAt(LocalDateTime.now());
        req = friendRequestRepository.save(req);

        notificationService.sendToUser(
            req.getSenderUsername(),
            "Zaproszenie odrzucone",
            receiverUsername + " odrzucił(a) Twoje zaproszenie do grona znajomych.",
            "FRIEND_REJECTED",
            receiverUsername
        );
        return req;
    }

    @Transactional
    public void removeFriend(String username, String friendUsername) {
        List<FriendRequest> requests = friendRequestRepository.findBetween(username, friendUsername);
        requests.stream()
            .filter(r -> r.getStatus() == FriendRequestStatus.ACCEPTED)
            .forEach(friendRequestRepository::delete);
    }

    @Transactional(readOnly = true)
    public List<AppUser> getFriends(String username) {
        List<FriendRequest> accepted = friendRequestRepository.findAcceptedFriendships(username);
        return accepted.stream()
            .map(r -> r.getSenderUsername().equals(username) ? r.getReceiverUsername() : r.getSenderUsername())
            .map(userRepository::findById)
            .filter(Optional::isPresent)
            .map(Optional::get)
            .toList();
    }

    @Transactional(readOnly = true)
    public List<FriendRequest> getPendingIncoming(String username) {
        return friendRequestRepository.findByReceiverUsernameAndStatus(username, FriendRequestStatus.PENDING);
    }

    @Transactional(readOnly = true)
    public List<FriendRequest> getPendingOutgoing(String username) {
        return friendRequestRepository.findBySenderUsernameAndStatus(username, FriendRequestStatus.PENDING);
    }

    /** Returns: NONE, PENDING_SENT, PENDING_RECEIVED, FRIENDS */
    @Transactional(readOnly = true)
    public String getStatus(String me, String other) {
        List<FriendRequest> between = friendRequestRepository.findBetween(me, other);
        for (FriendRequest r : between) {
            if (r.getStatus() == FriendRequestStatus.ACCEPTED) return "FRIENDS";
            if (r.getStatus() == FriendRequestStatus.PENDING) {
                return r.getSenderUsername().equals(me) ? "PENDING_SENT" : "PENDING_RECEIVED";
            }
        }
        return "NONE";
    }
}
