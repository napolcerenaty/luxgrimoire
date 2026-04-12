package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.Message;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface MessageRepository extends JpaRepository<Message, String> {

    List<Message> findByConversationIdOrderByCreatedAtAsc(String conversationId);

    Optional<Message> findFirstByConversationIdOrderByCreatedAtDesc(String conversationId);

    @Query("SELECT COUNT(m) FROM Message m JOIN Conversation c ON m.conversationId = c.id WHERE (c.user1Username = :u OR c.user2Username = :u) AND m.senderUsername != :u AND m.readAt IS NULL")
    long countUnreadForUser(@Param("u") String username);

    @Query("SELECT COUNT(m) FROM Message m WHERE m.conversationId = :convId AND m.senderUsername != :u AND m.readAt IS NULL")
    long countUnreadForConversation(@Param("convId") String convId, @Param("u") String u);

    @Modifying
    @Query("UPDATE Message m SET m.readAt = :now WHERE m.conversationId = :convId AND m.senderUsername != :username AND m.readAt IS NULL")
    void markConversationRead(@Param("convId") String convId, @Param("username") String username, @Param("now") LocalDateTime now);
}
