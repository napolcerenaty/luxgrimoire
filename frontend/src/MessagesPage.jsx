import { useState, useEffect, useRef, useCallback } from "react";
import "./MessagesPage.css";
import { API } from "./api";
import { useI18n } from "./i18n";
import DOMPurify from "dompurify";
import MessageComposer from "./MessageComposer";

const POLL_INTERVAL = 5000;

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

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

export default function MessagesPage({ onBack, initialUsername, currentUsername, onRead }) {
  const { t } = useI18n();
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [newMsgSearch, setNewMsgSearch] = useState("");
  const [newMsgResults, setNewMsgResults] = useState([]);
  const [newMsgSearching, setNewMsgSearching] = useState(false);
  const [newMsgScope, setNewMsgScope] = useState("friends"); // "friends" | "all"
  const [friends, setFriends] = useState([]);
  // Group chat state
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [msgBlockedError, setMsgBlockedError] = useState("");
  const messagesEndRef = useRef(null);
  const threadRef = useRef(null);
  const pollRef = useRef(null);
  const newMsgDebounce = useRef(null);

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
        fetch(API.CONVERSATION_READ(convId), { method: "PUT", credentials: "include" })
          .then(() => onRead?.());
      });
  }, [onRead]);

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

  // Load friends list for "friends only" scope
  useEffect(() => {
    fetch(API.FRIENDS, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => setFriends(data));
  }, []);

  // Load friendsList when create group or add member panels open
  useEffect(() => {
    if (!showCreateGroup && !showAddMember) return;
    fetch(API.FRIENDS, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setFriendsList);
  }, [showCreateGroup, showAddMember]);

  // Load group members when active group conversation changes
  const activeConv = conversations.find(c => c.id === activeConvId);
  useEffect(() => {
    if (!activeConvId || !activeConv?.isGroup) { setGroupMembers([]); return; }
    fetch(API.CONVERSATION_MEMBERS(activeConvId), { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setGroupMembers);
  }, [activeConvId, activeConv?.isGroup]);

  const handleNewMsgSearch = (q) => {
    setNewMsgSearch(q);
    clearTimeout(newMsgDebounce.current);
    setNewMsgResults([]);
    if (newMsgScope === "friends") {
      // Filter locally from already-loaded friends
      const filtered = friends.filter(f => {
        const full = `${f.firstName || ""} ${f.lastName || ""} ${f.username}`.toLowerCase();
        return full.includes(q.toLowerCase());
      });
      setNewMsgResults(filtered);
      return;
    }
    if (q.trim().length < 2) { return; }
    setNewMsgSearching(true);
    newMsgDebounce.current = setTimeout(() => {
      fetch(`${API.USER_SEARCH}?q=${encodeURIComponent(q.trim())}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then(data => { setNewMsgResults(data); setNewMsgSearching(false); });
    }, 350);
  };

  // When scope changes, re-run search with current query
  const handleScopeChange = (scope) => {
    setNewMsgScope(scope);
    setNewMsgResults([]);
    setNewMsgSearching(false);
    clearTimeout(newMsgDebounce.current);
    if (scope === "friends") {
      const q = newMsgSearch;
      const filtered = friends.filter(f => {
        const full = `${f.firstName || ""} ${f.lastName || ""} ${f.username}`.toLowerCase();
        return q ? full.includes(q.toLowerCase()) : true;
      });
      setNewMsgResults(filtered);
    } else {
      if (newMsgSearch.trim().length >= 2) {
        setNewMsgSearching(true);
        newMsgDebounce.current = setTimeout(() => {
          fetch(`${API.USER_SEARCH}?q=${encodeURIComponent(newMsgSearch.trim())}`, { credentials: "include" })
            .then(r => r.ok ? r.json() : [])
            .then(data => { setNewMsgResults(data); setNewMsgSearching(false); });
        }, 350);
      }
    }
  };

  const startConvWithUser = (username) => {
    setMsgBlockedError("");
    fetch(API.CONVERSATION_START(username), { method: "POST", credentials: "include" })
      .then(async r => {
        const data = await r.json();
        if (r.status === 403 && data?.code === "MESSAGING_PRIVATE") {
          setMsgBlockedError(t("settings.messagingBlockedError"));
          return null;
        }
        return r.ok ? data : null;
      })
      .then(data => {
        if (data?.conversationId) {
          setNewMsgSearch("");
          setNewMsgResults([]);
          loadConversations().then(() => setActiveConvId(data.conversationId));
        }
      });
  };

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
            <button className="msg-new-group-btn" onClick={() => setShowCreateGroup(true)} title="Nowa grupa">
              👥+
            </button>
          </div>
          <div className="messages-sidebar-list">
            {loadingConvs && <div style={{ padding: "1rem", color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>Ładowanie...</div>}
            {!loadingConvs && conversations.length === 0 && (
              <div style={{ padding: "1rem", color: "var(--color-text-secondary)", fontSize: "0.85rem", textAlign: "center" }}>
                {t("messages.noConversations")}
              </div>
            )}
            {conversations.map(conv => {
              const hasUnread = conv.unreadCount > 0;
              return (
                <div
                  key={conv.id}
                  className={`conv-item${activeConvId === conv.id ? " conv-item--active" : ""}${hasUnread ? " conv-item--unread" : ""}`}
                  onClick={() => setActiveConvId(conv.id)}
                >
                  {conv.isGroup
                    ? <div className="conv-avatar-placeholder conv-avatar-group" style={{ width: 40, height: 40, fontSize: 16 }}>👥</div>
                    : <AvatarOrPlaceholder url={conv.otherAvatarUrl} name={conv.otherFirstName || conv.otherUsername} />}
                  <div className="conv-info">
                    <div className={`conv-name${hasUnread ? " conv-name--unread" : ""}`}>
                      {conv.isGroup
                        ? (conv.groupName || "Grupa")
                        : (conv.otherFirstName ? conv.otherFirstName + (conv.otherLastName ? " " + conv.otherLastName : "") : conv.otherUsername)}
                    </div>
                    {conv.lastMessage && (
                      <div className={`conv-last-msg${hasUnread ? " conv-last-msg--unread" : ""}`}>
                        {conv.lastMessageSender === currentUsername ? "Ty: " : ""}{stripHtml(conv.lastMessage)}
                      </div>
                    )}
                  </div>
                  {hasUnread && (
                    <span className="conv-unread-badge">{conv.unreadCount > 99 ? "99+" : conv.unreadCount}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Thread */}
        <div className="messages-thread">
          {!activeConvId ? (
            <div className="thread-new-msg">
              <div className="thread-new-msg-title">Nowa wiadomość</div>
              {/* Scope tabs */}
              <div className="thread-new-msg-tabs">
                <button
                  className={`thread-new-msg-tab${newMsgScope === "friends" ? " thread-new-msg-tab--active" : ""}`}
                  onClick={() => handleScopeChange("friends")}
                >
                  👥 Znajomi
                </button>
                <button
                  className={`thread-new-msg-tab${newMsgScope === "all" ? " thread-new-msg-tab--active" : ""}`}
                  onClick={() => handleScopeChange("all")}
                >
                  🔍 Wszyscy użytkownicy
                </button>
              </div>
              <div className="thread-new-msg-search">
                <input
                  type="text"
                  placeholder={newMsgScope === "friends" ? "Filtruj znajomych..." : "Szukaj po nazwie lub loginie (min. 2 znaki)..."}
                  value={newMsgSearch}
                  onChange={e => handleNewMsgSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {newMsgSearching && <div className="thread-new-msg-loading">Szukam...</div>}
              {!newMsgSearching && newMsgScope === "all" && newMsgSearch.trim().length >= 2 && newMsgResults.length === 0 && (
                <div className="thread-new-msg-loading">Brak wyników</div>
              )}
              {!newMsgSearching && newMsgScope === "friends" && friends.length === 0 && (
                <div className="thread-new-msg-loading">Nie masz jeszcze żadnych znajomych</div>
              )}
              <div className="thread-new-msg-results">
                {(newMsgScope === "friends" ? (newMsgSearch ? newMsgResults : friends) : newMsgResults).map(u => (
                  <div key={u.username} className="thread-new-msg-user" onClick={() => startConvWithUser(u.username)}>
                    <AvatarOrPlaceholder url={u.avatarUrl} name={u.firstName || u.username} size={36} />
                    <div className="thread-new-msg-user-info">
                      <div className="thread-new-msg-user-name">{u.firstName} {u.lastName}</div>
                      <div className="thread-new-msg-user-username">@{u.username}</div>
                    </div>
                  </div>
                ))}
              </div>
              {msgBlockedError && (
                <div className="thread-new-msg-blocked">{msgBlockedError}</div>
              )}
            </div>
          ) : (
            <>
              {activeConv?.isGroup ? (
                <div className="thread-header-group">
                  <div className="thread-header-group-info">
                    <span className="thread-header-group-name">{activeConv.groupName || "Grupa"}</span>
                    <span className="thread-header-group-count">{activeConv.memberCount} uczestników</span>
                  </div>
                  <button className="thread-add-member-btn" onClick={() => setShowAddMember(true)}>+ Dodaj osobę</button>
                </div>
              ) : (
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
              )}
              <div className="thread-messages" ref={threadRef}>
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
                        {msg.content && <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content) }} />}
                        {msg.imageUrl && (
                          <img
                            src={msg.imageUrl}
                            alt="attachment"
                            className="msg-bubble-image"
                            onClick={() => window.open(msg.imageUrl, "_blank")}
                          />
                        )}
                      </div>
                      <div className="msg-time">{formatTime(msg.createdAt)}</div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              <MessageComposer
                onSend={({ content, imageUrl }) => {
                  if ((!content || content === "<p></p>") && !imageUrl) return;
                  fetch(API.CONVERSATION_SEND(activeConvId), {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: content || "", imageUrl: imageUrl || null }),
                  }).then(r => r.ok ? r.json() : null).then(msg => {
                    if (msg) {
                      setMessages(prev => [...prev, msg]);
                      loadConversations();
                    }
                  });
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="modal-overlay" onClick={() => setShowCreateGroup(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Nowa grupa</div>
            <input
              className="modal-input"
              type="text"
              placeholder="Nazwa grupy..."
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              autoFocus
            />
            <div className="modal-section-label">Wybierz znajomych:</div>
            <div className="modal-friend-list">
              {friendsList.map(f => (
                <label key={f.username} className="modal-friend-item">
                  <input
                    type="checkbox"
                    checked={selectedFriends.includes(f.username)}
                    onChange={e => {
                      if (e.target.checked) setSelectedFriends(p => [...p, f.username]);
                      else setSelectedFriends(p => p.filter(u => u !== f.username));
                    }}
                  />
                  <span>{f.firstName} {f.lastName} (@{f.username})</span>
                </label>
              ))}
              {friendsList.length === 0 && <div className="modal-empty">Brak znajomych</div>}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setShowCreateGroup(false); setGroupName(""); setSelectedFriends([]); }}>Anuluj</button>
              <button
                className="btn-primary"
                disabled={!groupName.trim() || selectedFriends.length === 0}
                onClick={() => {
                  fetch(API.CONVERSATION_CREATE_GROUP, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ groupName: groupName.trim(), members: selectedFriends }),
                  }).then(r => r.ok ? r.json() : null).then(data => {
                    if (data?.conversationId) {
                      setShowCreateGroup(false);
                      setGroupName("");
                      setSelectedFriends([]);
                      loadConversations().then(() => setActiveConvId(data.conversationId));
                    }
                  });
                }}
              >
                Utwórz grupę
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMember && (
        <div className="modal-overlay" onClick={() => { setShowAddMember(false); setSelectedFriends([]); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Dodaj do grupy</div>
            <div className="modal-friend-list">
              {friendsList.filter(f => !groupMembers.find(m => m.username === f.username)).map(f => (
                <label key={f.username} className="modal-friend-item">
                  <input
                    type="checkbox"
                    checked={selectedFriends.includes(f.username)}
                    onChange={e => {
                      if (e.target.checked) setSelectedFriends(p => [...p, f.username]);
                      else setSelectedFriends(p => p.filter(u => u !== f.username));
                    }}
                  />
                  <span>{f.firstName} {f.lastName} (@{f.username})</span>
                </label>
              ))}
              {friendsList.filter(f => !groupMembers.find(m => m.username === f.username)).length === 0 && (
                <div className="modal-empty">Wszyscy znajomi są już w grupie</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setShowAddMember(false); setSelectedFriends([]); }}>Anuluj</button>
              <button
                className="btn-primary"
                disabled={selectedFriends.length === 0}
                onClick={() => {
                  Promise.all(selectedFriends.map(u =>
                    fetch(API.CONVERSATION_MEMBERS(activeConvId), {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ username: u }),
                    })
                  )).then(() => {
                    setShowAddMember(false);
                    setSelectedFriends([]);
                    fetch(API.CONVERSATION_MEMBERS(activeConvId), { credentials: "include" })
                      .then(r => r.ok ? r.json() : []).then(setGroupMembers);
                    loadConversations();
                  });
                }}
              >
                Dodaj ({selectedFriends.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
