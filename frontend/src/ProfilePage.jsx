import { useState } from "react";
import { useAuth } from "./AuthContext";
import "./UserPages.css";

export default function ProfilePage({ onBack }) {
  const { user, updateProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName]   = useState(user?.lastName  ?? "");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [saved, setSaved]     = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await updateProfile(firstName, lastName);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName   ?? "");
    setEditing(false);
    setError("");
  };

  return (
    <div className="user-page">
      <button className="back-btn" onClick={onBack}>← Wróć</button>

      <div className="user-page-card">
        <div className="page-avatar">
          <span className="page-avatar-initials">
            {(firstName[0] ?? "?").toUpperCase()}
            {(lastName[0]  ?? "").toUpperCase()}
          </span>
        </div>

        <h2 className="user-page-title">Profil użytkownika</h2>
        <p className="user-page-username">@{user?.username}</p>

        {editing ? (
          <div className="user-page-form">
            <label>
              Imię
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
            </label>
            <label>
              Nazwisko
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </label>
            {error && <p className="page-error">{error}</p>}
            <div className="page-btn-row">
              <button className="page-btn primary" onClick={handleSave} disabled={saving}>
                {saving ? "Zapisywanie…" : "Zapisz zmiany"}
              </button>
              <button className="page-btn" onClick={handleCancel}>Anuluj</button>
            </div>
          </div>
        ) : (
          <div className="user-page-form">
            <div className="profile-row">
              <span className="profile-row-label">Imię</span>
              <span className="profile-row-value">{user?.firstName}</span>
            </div>
            <div className="profile-row">
              <span className="profile-row-label">Nazwisko</span>
              <span className="profile-row-value">{user?.lastName}</span>
            </div>
            <div className="profile-row">
              <span className="profile-row-label">Użytkownik</span>
              <span className="profile-row-value">{user?.username}</span>
            </div>
            <div className="profile-row">
              <span className="profile-row-label">Strefa czasowa</span>
              <span className="profile-row-value">{user?.timezone}</span>
            </div>
            {saved && <p className="page-success">✓ Zmiany zostały zapisane</p>}
            <button className="page-btn primary" onClick={() => setEditing(true)}>
              ✎ Edytuj profil
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
