package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.ConversationMember;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ConversationMemberRepository extends JpaRepository<ConversationMember, Long> {
    List<ConversationMember> findByConversationId(String conversationId);
    List<ConversationMember> findByUsername(String username);
    boolean existsByConversationIdAndUsername(String conversationId, String username);
    void deleteByConversationIdAndUsername(String conversationId, String username);
}
