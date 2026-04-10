import { useState } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import LoginModal from "./LoginModal";
import "./UserModals.css";

export default function UserMenu({ onNavigate }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [showLogin, setShowLogin] = useState(false);

  const handleLogout = async () => {
    await logout();
    onNavigate("browse");
  };

  return (
    <div className="user-menu-wrapper">
      <button
        className="user-icon-btn"
        onClick={() => user ? onNavigate("profile") : setShowLogin(true)}
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
