import { useState, useEffect, useCallback } from "react";
import "./FriendsPage.css";
import { API } from "./api";
import { useI18n } from "./i18n";

function AvatarOrPlaceholder({ url, name, size = 44 }) {
  if (url) {
    return <img className="friend-avatar" src={url} alt={name} style={{ width: size, height: size }} />;
  }
  const initial = name ? name.charAt(0).toUpperCase() : "?";
  return (
    <div className="friend-avatar-placeholder" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initial}
    </div>
  );
}

export default function FriendsPage({ onBack, onMessage, onViewProfile }) {
  const { t } = useI18n();
  const [friends, setFriends] = useState([]);
  const [pendingIn, setPendingIn] = useState([]);
  const [pendingOut, setPendingOut] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [statusMap, setStatusMap] = useState({}); // username -> status
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    Promise.all([
      fetch(API.FRIENDS, { credentials: "include" }).then(r => r.ok ? r.json() : []),
      fetch(API.FRIEND_REQUESTS_PENDING, { credentials: "include" }).then(r => r.ok ? r.json() : { incoming: [], outgoing: [] }),
    ]).then(([f, req]) => {
      setFriends(f);
      setPendingIn(req.incoming || []);
      setPendingOut(req.outgoing || []);
      setLoading(false);
    });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Search debounce
  useEffect(() => {
    if (searchQuery.trim().length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(() => {
      setSearchLoading(true);
      fetch(`${API.USER_SEARCH}?q=${encodeURIComponent(searchQuery)}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then(data => {
          setSearchResults(data);
          // Fetch statuses for results
          data.forEach(u => {
            fetch(API.FRIEND_STATUS(u.username), { credentials: "include" })
              .then(r => r.ok ? r.json() : { status: "NONE" })
              .then(d => setStatusMap(prev => ({ ...prev, [u.username]: d.status })));
          });
          setSearchLoading(false);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const sendRequest = (username) => {
    fetch(API.FRIEND_REQUEST(username), { method: "POST", credentials: "include" })
      .then(r => {
        if (r.ok) setStatusMap(prev => ({ ...prev, [username]: "PENDING_SENT" }));
      });
  };

  const acceptRequest = (requestId, senderUsername) => {
    fetch(API.FRIEND_ACCEPT(requestId), { method: "POST", credentials: "include" })
      .then(r => { if (r.ok) loadData(); });
  };

  const rejectRequest = (requestId) => {
    fetch(API.FRIEND_REJECT(requestId), { method: "POST", credentials: "include" })
      .then(r => { if (r.ok) loadData(); });
  };

  const removeFriend = (username) => {
    if (!window.confirm(t("friends.confirmRemove", { name: username }))) return;
    fetch(API.FRIEND_REMOVE(username), { method: "DELETE", credentials: "include" })
      .then(r => { if (r.ok) loadData(); });
  };

  const renderSearchAction = (user) => {
    const status = statusMap[user.username] || "NONE";
    return (
      <>
        <button className="btn-friend-message" onClick={() => onMessage?.(user.username)} title="Wyślij wiadomość">✉</button>
        {status === "FRIENDS"
          ? <span className="btn-friend-pending">{t("friends.alreadyFriends")}</span>
          : status === "PENDING_SENT"
          ? <span className="btn-friend-pending">{t("friends.requestSent")}</span>
          : status === "PENDING_RECEIVED"
          ? <button className="btn-friend-accept" onClick={() => {
              const req = pendingIn.find(r => r.senderUsername === user.username);
              if (req) acceptRequest(req.id, user.username);
            }}>{t("friends.accept")}</button>
          : <button className="btn-friend-add" onClick={() => sendRequest(user.username)}>{t("friends.addFriend")}</button>
        }
      </>
    );
  };

  const renderUser = (user, actions) => (
    <div key={user.username} className="friend-card" onClick={() => onViewProfile?.(user.username)}>
      <AvatarOrPlaceholder url={user.avatarUrl} name={user.firstName || user.username} />
      <div className="friend-info">
        <div className="friend-name">{user.firstName || ""} {user.lastName || ""}</div>
        <div className="friend-username">@{user.username}</div>
      </div>
      <div className="friend-actions" onClick={e => e.stopPropagation()}>
        {actions(user)}
      </div>
    </div>
  );

  if (loading) return <div className="friends-page"><div className="friends-empty">Ładowanie...</div></div>;

  return (
    <div className="friends-page">
      <div className="friends-page-header">
        <button className="detail-back-btn" onClick={onBack}>{t("back")}</button>
        <h2>{t("friends.title")}</h2>
      </div>

      {/* Search */}
      <div className="friends-search-bar">
        <input
          type="text"
          placeholder={t("friends.searchPlaceholder")}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {searchQuery.trim().length >= 2 && (
        <div className="friends-section">
          <div className="friends-section-title">{t("friends.searchResults")}</div>
          <div className="friends-search-results">
            {searchLoading && <div className="friends-empty">Szukam...</div>}
            {!searchLoading && searchResults.length === 0 && <div className="friends-empty">{t("friends.noResults")}</div>}
            {searchResults.map(u => renderUser(u, renderSearchAction))}
          </div>
        </div>
      )}

      {/* Incoming requests */}
      {pendingIn.length > 0 && (
        <div className="friends-section">
          <div className="friends-section-title">{t("friends.incomingRequests")} ({pendingIn.length})</div>
          <div className="friends-search-results">
            {pendingIn.map(req => renderUser(
              { username: req.senderUsername, firstName: req.senderUsername, lastName: "", avatarUrl: "" },
              () => (
                <>
                  <button className="btn-friend-accept" onClick={() => acceptRequest(req.id, req.senderUsername)}>{t("friends.accept")}</button>
                  <button className="btn-friend-reject" onClick={() => rejectRequest(req.id)}>{t("friends.reject")}</button>
                </>
              )
            ))}
          </div>
        </div>
      )}

      {/* Friends list */}
      <div className="friends-section">
        <div className="friends-section-title">{t("friends.myFriends")} ({friends.length})</div>
        <div className="friends-search-results">
          {friends.length === 0 && <div className="friends-empty">{t("friends.noFriends")}</div>}
          {friends.map(u => renderUser(u, () => (
            <>
              <button className="btn-friend-message" onClick={() => onMessage?.(u.username)}>✉</button>
              <button className="btn-friend-remove" onClick={() => removeFriend(u.username)}>{t("friends.remove")}</button>
            </>
          )))}
        </div>
      </div>

      {/* Pending outgoing */}
      {pendingOut.length > 0 && (
        <div className="friends-section">
          <div className="friends-section-title">{t("friends.sentRequests")} ({pendingOut.length})</div>
          <div className="friends-search-results">
            {pendingOut.map(req => renderUser(
              { username: req.receiverUsername, firstName: req.receiverUsername, lastName: "", avatarUrl: "" },
              () => <span className="btn-friend-pending">{t("friends.pending")}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
