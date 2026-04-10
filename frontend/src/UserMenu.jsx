import { useState, useRef, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import LoginModal from "./LoginModal";
import "./UserModals.css";

export default function UserMenu({ onNavigate }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navigate = (page) => { setOpen(false); onNavigate(page); };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    onNavigate("browse");
  };

  return (
    <div className="user-menu-wrapper" ref={menuRef}>
      <button
        className="user-icon-btn"
        onClick={() => user ? setOpen((v) => !v) : setShowLogin(true)}
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

      {open && user && (
        <div className="user-dropdown">
          <div className="user-dropdown-header">
            <span className="dropdown-name">{user.firstName} {user.lastName}</span>
            <span className="dropdown-username">@{user.username}</span>
          </div>
          <hr className="dropdown-divider" />
          <button className="dropdown-item" onClick={() => navigate("profile")}>{t("user.menuProfile")}</button>
          <button className="dropdown-item" onClick={() => navigate("settings")}>{t("user.menuSettings")}</button>
          <hr className="dropdown-divider" />
          <button className="dropdown-item logout" onClick={handleLogout}>{t("user.menuLogout")}</button>
        </div>
      )}

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}
