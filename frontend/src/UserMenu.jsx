import { useState, useRef, useEffect } from "react";
import { useAuth } from "./AuthContext";
import LoginModal from "./LoginModal";
import ProfileModal from "./ProfileModal";
import SettingsModal from "./SettingsModal";
import "./UserModals.css";

export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(null); // "login" | "profile" | "settings"
  const menuRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const openModal = (name) => { setOpen(false); setModal(name); };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
  };

  return (
    <div className="user-menu-wrapper" ref={menuRef}>
      <button
        className="user-icon-btn"
        onClick={() => user ? setOpen((v) => !v) : setModal("login")}
        title={user ? `${user.firstName} ${user.lastName}` : "Zaloguj się"}
        aria-label={user ? "Menu użytkownika" : "Zaloguj się"}
      >
        {user ? (
          <span className="user-icon-initials">
            {(user.firstName?.[0] ?? "?").toUpperCase()}
            {(user.lastName?.[0] ?? "").toUpperCase()}
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
          <button className="dropdown-item" onClick={() => openModal("profile")}>👤 Profil</button>
          <button className="dropdown-item" onClick={() => openModal("settings")}>⚙️ Ustawienia</button>
          <hr className="dropdown-divider" />
          <button className="dropdown-item logout" onClick={handleLogout}>🚪 Wyloguj</button>
        </div>
      )}

      {modal === "login"    && <LoginModal    onClose={() => setModal(null)} />}
      {modal === "profile"  && <ProfileModal  onClose={() => setModal(null)} />}
      {modal === "settings" && <SettingsModal onClose={() => setModal(null)} />}
    </div>
  );
}
