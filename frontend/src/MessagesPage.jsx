import { useState, useEffect, useRef, useCallback } from "react";
import "./MessagesPage.css";
import { API } from "./api";
import { useI18n } from "./i18n";

const POLL_INTERVAL = 5000;

function AvatarOrPlaceholder({ url, name, size = 40 }) {
  if (url) {
    return <img className="conv-avatar" src={url} alt={name} style={{ width: size, height: size }} />;
  }
  const initial = name ? name.charAt(0).toUpperCase() : "?";
  return (
    <div className="conv-avatar-placeholder" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initial}
    </div>
  );
}

function formatTime(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const now = new Date();
  const today = now.toDateString() === d.toDateString();
  if (today) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessagesPage({ onBack, initialUsername, currentUsername }) {
  const { t } = useI18n();
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);

  const loadConversations = useCallback(() => {
    return fetch(API.CONVERSATIONS, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setConversations(data); setLoadingConvs(false); return data; });
  }, []);

  const loadMessages = useCallback((convId) => {
    if (!convId) return;
    fetch(API.CONVERSATION_MESSAGES(convId), { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setMessages(data);
        // Mark as read
        fetch(API.CONVERSATION_READ(convId), { method: "PUT", credentials: "include" });
      });
  }, []);

  // Start conversation with a specific user (when coming from FriendsPage)
  useEffect(() => {
    if (!initialUsername) return;
    fetch(API.CONVERSATION_START(initialUsername), { method: "POST", credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.conversationId) {
          loadConversations().then(() => setActiveConvId(data.conversationId));
        }
      });
  }, [initialUsername, loadConversations]);

  // Initial load
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load messages when active conv changes
  useEffect(() => {
    if (!activeConvId) return;
    loadMessages(activeConvId);
    clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      loadMessages(activeConvId);
      loadConversations();
    }, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [activeConvId, loadMessages, loadConversations]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!draft.trim() || !activeConvId || sending) return;
    setSending(true);
    fetch(API.CONVERSATION_SEND(activeConvId), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft.trim() }),
    }).then(r => r.ok ? r.json() : null).then(msg => {
      if (msg) {
        setMessages(prev => [...prev, msg]);
        setDraft("");
        loadConversations();
      }
      setSending(false);
    }).catch(() => setSending(false));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const activeConv = conversations.find(c => c.id === activeConvId);

  return (
    <div>
      <div className="messages-page-back">
        <button className="detail-back-btn" onClick={onBack}>{t("back")}</button>
      </div>
      <div className="messages-page">
        {/* Sidebar */}
        <div className="messages-sidebar">
          <div className="messages-sidebar-header">
            <h3>{t("messages.title")}</h3>
          </div>
          <div className="messages-sidebar-list">
            {loadingConvs && <div style={{ padding: "1rem", color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>Ładowanie...</div>}
            {!loadingConvs && conversations.length === 0 && (
              <div style={{ padding: "1rem", color: "var(--color-text-secondary)", fontSize: "0.85rem", textAlign: "center" }}>
                {t("messages.noConversations")}
              </div>
            )}
            {conversations.map(conv => (
              <div
                key={conv.id}
                className={`conv-item${activeConvId === conv.id ? " conv-item--active" : ""}`}
                onClick={() => setActiveConvId(conv.id)}
              >
                <AvatarOrPlaceholder url={conv.otherAvatarUrl} name={conv.otherFirstName || conv.otherUsername} />
                <div className="conv-info">
                  <div className="conv-name">
                    {conv.otherFirstName || conv.otherUsername}
                    {conv.otherLastName ? " " + conv.otherLastName : ""}
                  </div>
                  {conv.lastMessage && (
                    <div className="conv-last-msg">
                      {conv.lastMessageSender === currentUsername ? "Ty: " : ""}{conv.lastMessage}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Thread */}
        <div className="messages-thread">
          {!activeConvId ? (
            <div className="thread-empty">{t("messages.selectConversation")}</div>
          ) : (
            <>
              <div className="thread-header">
                <AvatarOrPlaceholder
                  url={activeConv?.otherAvatarUrl}
                  name={activeConv?.otherFirstName || activeConv?.otherUsername}
                  size={36}
                />
                <div className="thread-header-name">
                  {activeConv?.otherFirstName || activeConv?.otherUsername}
                  {activeConv?.otherLastName ? " " + activeConv.otherLastName : ""}
                  <span style={{ fontWeight: 400, color: "var(--color-text-secondary)", fontSize: "0.8rem", marginLeft: "0.4rem" }}>
                    @{activeConv?.otherUsername}
                  </span>
                </div>
              </div>
              <div className="thread-messages">
                {messages.length === 0 && (
                  <div style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: "0.85rem", padding: "2rem 0" }}>
                    {t("messages.noMessages")}
                  </div>
                )}
                {messages.map(msg => {
                  const mine = msg.senderUsername === currentUsername;
                  return (
                    <div key={msg.id} className={`msg-bubble-wrap${mine ? " msg-bubble-wrap--mine" : " msg-bubble-wrap--theirs"}`}>
                      <div className={`msg-bubble${mine ? " msg-bubble--mine" : " msg-bubble--theirs"}`}>
                        {msg.content}
                      </div>
                      <div className="msg-time">{formatTime(msg.createdAt)}</div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              <div className="thread-input-area">
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t("messages.inputPlaceholder")}
                  rows={1}
                />
                <button className="btn-send" onClick={sendMessage} disabled={!draft.trim() || sending}>
                  {t("messages.send")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
