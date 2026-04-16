import { useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import LoginModal from "./LoginModal";
import { API } from "./api";
import "./UserModals.css";

export default function UserMenu({ onNavigate, msgRefreshKey = 0 }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [showLogin, setShowLogin] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const dropdownRef = useRef(null);

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

  useEffect(() => {
    if (!showDropdown) return;
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDropdown]);

  const handleLogout = async () => {
    setShowDropdown(false);
    await logout();
    onNavigate("browse");
  };

  return (
    <div className="user-menu-wrapper" ref={dropdownRef}>
      <button
        className="user-icon-btn"
        onClick={() => user ? setShowDropdown(d => !d) : setShowLogin(true)}
        title={user ? `${user.firstName} ${user.lastName}` : t("user.loginTooltip")}
        aria-label={user ? t("user.menuTooltip") : t("user.loginTooltip")}
        style={{ position: "relative" }}
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
        {unreadMsgs > 0 && (
          <span className="notif-bell-badge" style={{ top: "-4px", right: "-4px" }}>
            {unreadMsgs > 99 ? "99+" : unreadMsgs}
          </span>
        )}
      </button>

      {user && showDropdown && (
        <div className="user-dropdown">
          <div className="user-dropdown-header">
            <span className="user-dropdown-name">{user.firstName} {user.lastName}</span>
            <span className="user-dropdown-username">@{user.username}</span>
          </div>
          <div className="user-dropdown-divider" />
          <button className="user-dropdown-item" onClick={() => { onNavigate("settings"); setShowDropdown(false); }}>
            <span>⚙️</span> {t("account.navSettings")}
          </button>
          <div className="user-dropdown-divider" />
          <button className="user-dropdown-item user-dropdown-logout" onClick={handleLogout}>
            {t("user.menuLogout")}
          </button>
        </div>
      )}

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}
