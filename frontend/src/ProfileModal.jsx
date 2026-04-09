import { useState } from "react";
import { useAuth } from "./AuthContext";
import "./UserModals.css";

export default function ProfileModal({ onClose }) {
  const { user, updateProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await updateProfile(firstName, lastName);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
    setEditing(false);
    setError("");
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 className="modal-title">Profil</h2>

        <div className="avatar-placeholder">
          <span className="avatar-initials">
            {(firstName[0] ?? "?").toUpperCase()}{(lastName[0] ?? "").toUpperCase()}
          </span>
        </div>

        <div className="modal-form">
          {editing ? (
            <>
              <label>
                Imię
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
              </label>
              <label>
                Nazwisko
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </label>
              {error && <p className="modal-error">{error}</p>}
              <div className="modal-btn-row">
                <button className="modal-btn primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Zapisywanie…" : "Zapisz"}
                </button>
                <button className="modal-btn" onClick={handleCancel}>Anuluj</button>
              </div>
            </>
          ) : (
            <>
              <div className="profile-field">
                <span className="profile-label">Imię</span>
                <span className="profile-value">{user?.firstName}</span>
              </div>
              <div className="profile-field">
                <span className="profile-label">Nazwisko</span>
                <span className="profile-value">{user?.lastName}</span>
              </div>
              <div className="profile-field">
                <span className="profile-label">Użytkownik</span>
                <span className="profile-value">{user?.username}</span>
              </div>
              {saved && <p className="modal-success">✓ Zapisano</p>}
              <button className="modal-btn primary" onClick={() => setEditing(true)}>
                Edytuj
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
