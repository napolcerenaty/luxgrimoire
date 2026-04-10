import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import "./UserPages.css";

export default function ProfilePage({ onBack }) {
  const { user, updateProfile } = useAuth();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName]   = useState(user?.lastName  ?? "");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [saved, setSaved]     = useState(false);

  // collection
  const [ownedBooks, setOwnedBooks] = useState([]);
  const [userSubs, setUserSubs] = useState([]);
  const [bookDetails, setBookDetails] = useState({});   // id -> { title, author }
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    if (!user) return;
    fetch("http://localhost:8080/api/user/books", { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setOwnedBooks)
      .catch(() => {});
    fetch("http://localhost:8080/api/user/subscriptions", { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setUserSubs)
      .catch(() => {});
    fetch("http://localhost:8080/api/companies", { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setCompanies)
      .catch(() => {});
  }, [user]);

  // fetch book details for display (batch unique ids)
  useEffect(() => {
    const ids = [...new Set(ownedBooks.map((e) => e.bookDetailId))];
    ids.forEach((id) => {
      if (bookDetails[id]) return;
      fetch(`http://localhost:8080/api/book-details/${id}`, { credentials: "include" })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) setBookDetails((prev) => ({ ...prev, [id]: d })); })
        .catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedBooks]);

  const removeBook = async (entryId) => {
    const res = await fetch(`http://localhost:8080/api/user/books/${entryId}`, {
      method: "DELETE", credentials: "include",
    });
    if (res.ok) setOwnedBooks((prev) => prev.filter((e) => e.id !== entryId));
  };

  const removeSub = async (entryId) => {
    const res = await fetch(`http://localhost:8080/api/user/subscriptions/${entryId}`, {
      method: "DELETE", credentials: "include",
    });
    if (res.ok) setUserSubs((prev) => prev.filter((e) => e.id !== entryId));
  };

  const getSubLabel = (entry) => {
    const co = companies.find((c) => c.id === entry.companyId);
    if (!co) return entry.subscriptionId;
    const sub = (co.subscriptions || []).find((s) => s.id === entry.subscriptionId);
    return sub ? `${co.name} — ${sub.name}` : co.name;
  };

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
      <button className="back-btn" onClick={onBack}>{t("back")}</button>

      <div className="user-page-card">
        <div className="page-avatar">
          <span className="page-avatar-initials">
            {(firstName[0] ?? "?").toUpperCase()}
            {(lastName[0]  ?? "").toUpperCase()}
          </span>
        </div>

        <h2 className="user-page-title">{t("profile.title")}</h2>
        <p className="user-page-username">@{user?.username}</p>

        {editing ? (
          <div className="user-page-form">
            <label>
              {t("profile.firstName")}
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
            </label>
            <label>
              {t("profile.lastName")}
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </label>
            {error && <p className="page-error">{error}</p>}
            <div className="page-btn-row">
              <button className="page-btn primary" onClick={handleSave} disabled={saving}>
                {saving ? t("profile.saving") : t("profile.saveBtn")}
              </button>
              <button className="page-btn" onClick={handleCancel}>{t("profile.cancel")}</button>
            </div>
          </div>
        ) : (
          <div className="user-page-form">
            <div className="profile-row">
              <span className="profile-row-label">{t("profile.firstName")}</span>
              <span className="profile-row-value">{user?.firstName}</span>
            </div>
            <div className="profile-row">
              <span className="profile-row-label">{t("profile.lastName")}</span>
              <span className="profile-row-value">{user?.lastName}</span>
            </div>
            <div className="profile-row">
              <span className="profile-row-label">{t("profile.username")}</span>
              <span className="profile-row-value">{user?.username}</span>
            </div>
            <div className="profile-row">
              <span className="profile-row-label">{t("profile.timezone")}</span>
              <span className="profile-row-value">{user?.timezone}</span>
            </div>
            {saved && <p className="page-success">{t("profile.saved")}</p>}
            <button className="page-btn primary" onClick={() => setEditing(true)}>
              {t("profile.editBtn")}
            </button>
          </div>
        )}
      </div>

      {/* ── My Books ──────────────────────────────────────────────────── */}
      <div className="user-page-card user-collection-card">
        <h3 className="user-collection-title">{t("userCollection.myBooks")}</h3>
        {ownedBooks.length === 0 ? (
          <p className="user-collection-empty">{t("userCollection.empty")}</p>
        ) : (
          <ul className="user-collection-list">
            {ownedBooks.map((entry) => {
              const bd = bookDetails[entry.bookDetailId];
              return (
                <li key={entry.id} className="user-collection-item">
                  <span className="user-collection-item-label">
                    {bd ? `${bd.title}${bd.author ? ` — ${bd.author}` : ""}` : entry.bookDetailId}
                  </span>
                  <button
                    className="user-collection-remove-btn"
                    onClick={() => removeBook(entry.id)}
                    title={t("userCollection.remove")}
                  >✕</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── My Subscriptions ─────────────────────────────────────────── */}
      <div className="user-page-card user-collection-card">
        <h3 className="user-collection-title">{t("userCollection.mySubs")}</h3>
        {userSubs.length === 0 ? (
          <p className="user-collection-empty">{t("userCollection.empty")}</p>
        ) : (
          <ul className="user-collection-list">
            {userSubs.map((entry) => (
              <li key={entry.id} className="user-collection-item">
                <span className="user-collection-item-label">{getSubLabel(entry)}</span>
                <button
                  className="user-collection-remove-btn"
                  onClick={() => removeSub(entry.id)}
                  title={t("userCollection.remove")}
                >✕</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
