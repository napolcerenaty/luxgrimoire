import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import LoginModal from "./LoginModal";
import { API } from "./api";
import "./UserModals.css";

export default function UserMenu({ onNavigate, msgRefreshKey = 0 }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [showLogin, setShowLogin] = useState(false);
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  useEffect(() => {
    if (!user) { setUnreadMsgs(0); return; }
    const fetchCount = () =>
      fetch(API.MESSAGES_UNREAD_COUNT, { credentials: "include" })
        .then(r => r.ok ? r.json() : { count: 0 })
        .then(d => setUnreadMsgs(d.count ?? 0))
        .catch(() => {});
    fetchCount();
    const iv = setInterval(fetchCount, 15000);
    return () => clearInterval(iv);
  }, [user, msgRefreshKey]);

  const handleLogout = async () => {
    await logout();
    onNavigate("browse");
  };

  return (
    <div className="user-menu-wrapper">
      {user && (
        <>
          <button
            className="user-nav-btn"
            onClick={() => onNavigate("friends")}
            title={t("friends.title")}
            aria-label={t("friends.title")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </button>
          <button
            className="user-nav-btn"
            onClick={() => onNavigate("messages")}
            title={t("messages.title")}
            aria-label={t("messages.title")}
            style={{ position: "relative" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
            </svg>
            {unreadMsgs > 0 && (
              <span className="notif-bell-badge" style={{ top: "-4px", right: "-4px" }}>
                {unreadMsgs > 99 ? "99+" : unreadMsgs}
              </span>
            )}
          </button>
        </>
      )}

      <button
        className="user-icon-btn"
        onClick={() => user ? onNavigate("account") : setShowLogin(true)}
        title={user ? `${user.firstName} ${user.lastName}` : t("user.loginTooltip")}
        aria-label={user ? t("user.menuTooltip") : t("user.loginTooltip")}
      >
        {user ? (
          <span className="user-icon-initials">
            {(user.firstName?.[0] ?? "?").toUpperCase()}
            {(user.lastName?.[0]  ?? "").toUpperCase()}
          </span>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
          </svg>
        )}
      </button>

      {user && (
        <button className="user-logout-btn" onClick={handleLogout} title={t("user.menuLogout")}>
          {t("user.menuLogout")}
        </button>
      )}

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}
