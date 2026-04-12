package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ConversationRepository extends JpaRepository<Conversation, String> {

    @Query("SELECT c FROM Conversation c WHERE (c.user1Username = :a AND c.user2Username = :b) OR (c.user1Username = :b AND c.user2Username = :a)")
    Optional<Conversation> findBetween(@Param("a") String a, @Param("b") String b);

    @Query("SELECT c FROM Conversation c WHERE c.user1Username = :u OR c.user2Username = :u ORDER BY c.lastMessageAt DESC NULLS LAST")
    List<Conversation> findByUser(@Param("u") String username);
}
