package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.Conversation;
import com.luxgrimoire.backend.model.Message;
import com.luxgrimoire.backend.repository.AppUserRepository;
import com.luxgrimoire.backend.repository.ConversationRepository;
import com.luxgrimoire.backend.repository.MessageRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class MessageService {

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final AppUserRepository userRepository;

    public MessageService(ConversationRepository conversationRepository,
                          MessageRepository messageRepository,
                          AppUserRepository userRepository) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public Conversation startOrGetConversation(String me, String other) {
        if (!userRepository.existsById(other)) {
            throw new IllegalArgumentException("User not found: " + other);
        }
        return conversationRepository.findBetween(me, other).orElseGet(() -> {
            Conversation c = new Conversation();
            c.setId(UUID.randomUUID().toString());
            c.setUser1Username(me);
            c.setUser2Username(other);
            c.setCreatedAt(LocalDateTime.now());
            return conversationRepository.save(c);
        });
    }

    @Transactional(readOnly = true)
    public List<Conversation> getConversations(String username) {
        return conversationRepository.findByUser(username);
    }

    @Transactional(readOnly = true)
    public List<Message> getMessages(String conversationId, String username) {
        Conversation c = conversationRepository.findById(conversationId)
            .orElseThrow(() -> new IllegalArgumentException("Conversation not found"));
        if (!c.getUser1Username().equals(username) && !c.getUser2Username().equals(username)) {
            throw new IllegalArgumentException("Not authorized");
        }
        return messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId);
    }

    @Transactional
    public Message sendMessage(String conversationId, String senderUsername, String content) {
        Conversation c = conversationRepository.findById(conversationId)
            .orElseThrow(() -> new IllegalArgumentException("Conversation not found"));
        if (!c.getUser1Username().equals(senderUsername) && !c.getUser2Username().equals(senderUsername)) {
            throw new IllegalArgumentException("Not authorized");
        }
        if (content == null || content.isBlank()) {
            throw new IllegalArgumentException("Message content cannot be empty");
        }
        Message m = new Message();
        m.setId(UUID.randomUUID().toString());
        m.setConversationId(conversationId);
        m.setSenderUsername(senderUsername);
        m.setContent(content.trim());
        m.setCreatedAt(LocalDateTime.now());
        m = messageRepository.save(m);

        c.setLastMessageAt(m.getCreatedAt());
        conversationRepository.save(c);
        return m;
    }

    @Transactional
    public void markRead(String conversationId, String username) {
        messageRepository.markConversationRead(conversationId, username, LocalDateTime.now());
    }

    @Transactional(readOnly = true)
    public long countUnread(String username) {
        return messageRepository.countUnreadForUser(username);
    }

    @Transactional(readOnly = true)
    public Optional<Message> getLastMessage(String conversationId) {
        return messageRepository.findFirstByConversationIdOrderByCreatedAtDesc(conversationId);
    }
}
