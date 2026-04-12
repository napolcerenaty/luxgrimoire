package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.Conversation;
import com.luxgrimoire.backend.model.ConversationMember;
import com.luxgrimoire.backend.model.Message;
import com.luxgrimoire.backend.repository.AppUserRepository;
import com.luxgrimoire.backend.repository.ConversationMemberRepository;
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
    private final ConversationMemberRepository memberRepository;

    public MessageService(ConversationRepository conversationRepository,
                          MessageRepository messageRepository,
                          AppUserRepository userRepository,
                          ConversationMemberRepository memberRepository) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
        this.memberRepository = memberRepository;
    }

    @Transactional
    public Conversation startOrGetConversation(String me, String other) {
        if (!userRepository.existsById(other)) {
            throw new IllegalArgumentException("User not found: " + other);
        }
        if (me.equals(other)) {
            throw new IllegalArgumentException("Cannot start conversation with yourself");
        }
        return conversationRepository.findBetween(me, other).orElseGet(() -> {
            // Always store usernames in consistent lexicographic order to avoid duplicates
            String user1 = me.compareTo(other) <= 0 ? me : other;
            String user2 = me.compareTo(other) <= 0 ? other : me;
            Conversation c = new Conversation();
            c.setId(UUID.randomUUID().toString());
            c.setUser1Username(user1);
            c.setUser2Username(user2);
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
        boolean allowed = c.isGroup()
            ? memberRepository.existsByConversationIdAndUsername(conversationId, username)
            : (username.equals(c.getUser1Username()) || username.equals(c.getUser2Username()));
        if (!allowed) throw new IllegalArgumentException("Not authorized");
        return messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId);
    }

    @Transactional
    public Message sendMessage(String conversationId, String senderUsername, String content, String imageUrl) {
        Conversation c = conversationRepository.findById(conversationId)
            .orElseThrow(() -> new IllegalArgumentException("Conversation not found"));
        boolean allowed = c.isGroup()
            ? memberRepository.existsByConversationIdAndUsername(conversationId, senderUsername)
            : (senderUsername.equals(c.getUser1Username()) || senderUsername.equals(c.getUser2Username()));
        if (!allowed) throw new IllegalArgumentException("Not authorized");
        boolean hasContent = content != null && !content.isBlank();
        boolean hasImage = imageUrl != null && !imageUrl.isBlank();
        if (!hasContent && !hasImage) {
            throw new IllegalArgumentException("Message content cannot be empty");
        }
        Message m = new Message();
        m.setId(UUID.randomUUID().toString());
        m.setConversationId(conversationId);
        m.setSenderUsername(senderUsername);
        m.setContent(hasContent ? content.trim() : "");
        m.setImageUrl(imageUrl);
        m.setCreatedAt(LocalDateTime.now());
        m = messageRepository.save(m);

        c.setLastMessageAt(m.getCreatedAt());
        conversationRepository.save(c);
        return m;
    }

    @Transactional
    public Conversation createGroupConversation(String creatorUsername, String groupName, List<String> memberUsernames) {
        Conversation c = new Conversation();
        c.setId(UUID.randomUUID().toString());
        c.setGroup(true);
        c.setGroupName(groupName != null && !groupName.isBlank() ? groupName.trim() : "Grupa");
        c.setCreatedAt(LocalDateTime.now());
        c = conversationRepository.save(c);

        addMember(c.getId(), creatorUsername);
        for (String m : memberUsernames) {
            if (!m.equals(creatorUsername) && userRepository.existsById(m)) {
                addMember(c.getId(), m);
            }
        }
        return c;
    }

    @Transactional
    public void addGroupMember(String conversationId, String requesterUsername, String newMemberUsername) {
        Conversation c = conversationRepository.findById(conversationId)
            .orElseThrow(() -> new IllegalArgumentException("Conversation not found"));
        if (!c.isGroup()) throw new IllegalArgumentException("Not a group conversation");
        if (!memberRepository.existsByConversationIdAndUsername(conversationId, requesterUsername)) {
            throw new IllegalArgumentException("Not a member of this group");
        }
        if (!userRepository.existsById(newMemberUsername)) {
            throw new IllegalArgumentException("User not found");
        }
        addMember(conversationId, newMemberUsername);
    }

    @Transactional(readOnly = true)
    public List<String> getGroupMemberUsernames(String conversationId) {
        return memberRepository.findByConversationId(conversationId)
            .stream().map(ConversationMember::getUsername).toList();
    }

    private void addMember(String convId, String username) {
        if (!memberRepository.existsByConversationIdAndUsername(convId, username)) {
            ConversationMember m = new ConversationMember();
            m.setConversationId(convId);
            m.setUsername(username);
            m.setJoinedAt(LocalDateTime.now());
            memberRepository.save(m);
        }
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

