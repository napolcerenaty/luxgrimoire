package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.Conversation;
import com.luxgrimoire.backend.model.Message;
import com.luxgrimoire.backend.repository.AppUserRepository;
import com.luxgrimoire.backend.repository.ConversationMemberRepository;
import com.luxgrimoire.backend.repository.MessageRepository;
import com.luxgrimoire.backend.service.MessageService;
import com.luxgrimoire.backend.util.AppConstants;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/messages")
public class MessageController {

    private final MessageService messageService;
    private final AppUserRepository userRepository;
    private final MessageRepository messageRepository;
    private final ConversationMemberRepository memberRepository;

    public MessageController(MessageService messageService, AppUserRepository userRepository,
                             MessageRepository messageRepository, ConversationMemberRepository memberRepository) {
        this.messageService = messageService;
        this.userRepository = userRepository;
        this.messageRepository = messageRepository;
        this.memberRepository = memberRepository;
    }

    @GetMapping("/conversations")
    public ResponseEntity<?> getConversations(HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        List<Conversation> convs = messageService.getConversations(me);
        List<Map<String, Object>> result = convs.stream().map(c -> {
            boolean isGroup = c.isGroup();
            String otherUsername = null;
            String otherFirstName = "";
            String otherLastName = "";
            String otherAvatarUrl = "";
            if (!isGroup) {
                otherUsername = c.getUser1Username().equals(me) ? c.getUser2Username() : c.getUser1Username();
                var otherUser = userRepository.findById(otherUsername);
                otherFirstName = otherUser.map(u -> u.getFirstName() != null ? u.getFirstName() : "").orElse("");
                otherLastName = otherUser.map(u -> u.getLastName() != null ? u.getLastName() : "").orElse("");
                otherAvatarUrl = otherUser.map(u -> u.getAvatarUrl() != null ? u.getAvatarUrl() : "").orElse("");
            }
            int memberCount = isGroup ? memberRepository.findByConversationId(c.getId()).size() : 2;
            Message lastMsg = messageService.getLastMessage(c.getId()).orElse(null);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", c.getId());
            item.put("isGroup", isGroup);
            item.put("groupName", isGroup ? c.getGroupName() : null);
            item.put("memberCount", memberCount);
            item.put("otherUsername", otherUsername);
            item.put("otherFirstName", otherFirstName);
            item.put("otherLastName", otherLastName);
            item.put("otherAvatarUrl", otherAvatarUrl);
            item.put("lastMessage", lastMsg != null ? stripHtml(lastMsg.getContent()) : null);
            item.put("lastMessageAt", lastMsg != null ? lastMsg.getCreatedAt() : c.getLastMessageAt());
            item.put("lastMessageSender", lastMsg != null ? lastMsg.getSenderUsername() : null);
            item.put("unreadCount", messageRepository.countUnreadForConversation(c.getId(), me));
            return item;
        }).toList();
        return ResponseEntity.ok(result);
    }

    @PostMapping("/conversations/start/{username}")
    public ResponseEntity<?> startConversation(@PathVariable String username, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        try {
            Conversation c = messageService.startOrGetConversation(me, username);
            return ResponseEntity.ok(Map.of("conversationId", c.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(403).body(Map.of("error", e.getMessage(), "code", "MESSAGING_PRIVATE"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/conversations/group")
    public ResponseEntity<?> createGroup(@RequestBody Map<String, Object> body, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        String groupName = (String) body.get("groupName");
        @SuppressWarnings("unchecked")
        List<String> members = (List<String>) body.getOrDefault("members", List.of());
        Conversation c = messageService.createGroupConversation(me, groupName, members);
        return ResponseEntity.ok(Map.of("conversationId", c.getId()));
    }

    @GetMapping("/conversations/{conversationId}/messages")
    public ResponseEntity<?> getMessages(@PathVariable String conversationId, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        try {
            List<Message> messages = messageService.getMessages(conversationId, me);
            return ResponseEntity.ok(messages);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(403).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/conversations/{conversationId}/messages")
    public ResponseEntity<?> sendMessage(@PathVariable String conversationId,
                                          @RequestBody Map<String, String> body,
                                          HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        String content = body.getOrDefault("content", "");
        String imageUrl = body.get("imageUrl");
        try {
            Message m = messageService.sendMessage(conversationId, me, content, imageUrl);
            return ResponseEntity.ok(m);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/conversations/{conversationId}/read")
    public ResponseEntity<?> markRead(@PathVariable String conversationId, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        messageService.markRead(conversationId, me);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/conversations/{conversationId}/members")
    public ResponseEntity<?> getMembers(@PathVariable String conversationId, HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        List<String> usernames = messageService.getGroupMemberUsernames(conversationId);
        List<Map<String, Object>> members = usernames.stream().map(u -> {
            var user = userRepository.findById(u);
            return Map.<String, Object>of(
                "username", u,
                "firstName", user.map(x -> x.getFirstName() != null ? x.getFirstName() : "").orElse(""),
                "lastName", user.map(x -> x.getLastName() != null ? x.getLastName() : "").orElse(""),
                "avatarUrl", user.map(x -> x.getAvatarUrl() != null ? x.getAvatarUrl() : "").orElse("")
            );
        }).toList();
        return ResponseEntity.ok(members);
    }

    @PostMapping("/conversations/{conversationId}/members")
    public ResponseEntity<?> addMember(@PathVariable String conversationId,
                                        @RequestBody Map<String, String> body,
                                        HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        String newMember = body.get("username");
        try {
            messageService.addGroupMember(conversationId, me, newMember);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/unread-count")
    public ResponseEntity<?> unreadCount(HttpSession session) {
        String me = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (me == null) return ResponseEntity.status(401).build();
        long count = messageService.countUnread(me);
        return ResponseEntity.ok(Map.of("count", count));
    }

    private String stripHtml(String html) {
        if (html == null) return null;
        return html.replaceAll("<[^>]+>", "").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&nbsp;", " ").trim();
    }
}

