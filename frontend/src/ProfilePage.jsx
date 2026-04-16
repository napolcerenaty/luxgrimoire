import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import "./UserPages.css";

export default function ProfilePage({ onBack }) {
  const { user, updateProfile, updateSocial } = useAuth();
  const { t } = useI18n();

  // Basic info
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName]   = useState(user?.lastName  ?? "");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [saved, setSaved]     = useState(false);

  // Social / bio
  const [editingSocial, setEditingSocial] = useState(false);
  const [bioPublic,     setBioPublic]     = useState(user?.bioPublic     ?? "");
  const [goodreadsUrl,  setGoodreadsUrl]  = useState(user?.goodreadsUrl  ?? "");
  const [storygraphUrl, setStorygraphUrl] = useState(user?.storygraphUrl ?? "");
  const [instagramUrl,  setInstagramUrl]  = useState(user?.instagramUrl  ?? "");
  const [twitterUrl,    setTwitterUrl]    = useState(user?.twitterUrl    ?? "");
  const [socialSaving,  setSocialSaving]  = useState(false);
  const [socialSaved,   setSocialSaved]   = useState(false);
  const [socialError,   setSocialError]   = useState("");

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

  // fetch book details for display (batch unique edition ids)
  useEffect(() => {
    const ids = [...new Set(ownedBooks.map((e) => e.editionId).filter(Boolean))];
    ids.forEach((id) => {
      if (bookDetails[id]) return;
      fetch(`http://localhost:8080/api/book-details/edition/${id}`, { credentials: "include" })
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

  const handleSocialSave = async () => {
    setSocialSaving(true);
    setSocialError("");
    try {
      await updateSocial({ bioPublic, goodreadsUrl, storygraphUrl, instagramUrl, twitterUrl });
      setEditingSocial(false);
      setSocialSaved(true);
      setTimeout(() => setSocialSaved(false), 3000);
    } catch (err) {
      setSocialError(err.message);
    } finally {
      setSocialSaving(false);
    }
  };

  const handleSocialCancel = () => {
    setBioPublic(user?.bioPublic     ?? "");
    setGoodreadsUrl(user?.goodreadsUrl  ?? "");
    setStorygraphUrl(user?.storygraphUrl ?? "");
    setInstagramUrl(user?.instagramUrl  ?? "");
    setTwitterUrl(user?.twitterUrl    ?? "");
    setEditingSocial(false);
    setSocialError("");
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

      {/* ── Bio & Social Links ────────────────────────────────────────── */}
      <div className="user-page-card">
        <h3 className="user-collection-title">{t("profile.socialTitle")}</h3>
        <p className="field-hint">{t("profile.socialHint")}</p>

        {editingSocial ? (
          <div className="user-page-form">
            <label>
              {t("profile.bio")}
              <textarea
                rows={4}
                maxLength={500}
                value={bioPublic}
                onChange={(e) => setBioPublic(e.target.value)}
                placeholder={t("profile.bioPlaceholder")}
                style={{ resize: "vertical" }}
              />
            </label>
            <label>{t("profile.goodreads")}<input value={goodreadsUrl} onChange={(e) => setGoodreadsUrl(e.target.value)} placeholder="https://goodreads.com/user/..." /></label>
            <label>{t("profile.storygraph")}<input value={storygraphUrl} onChange={(e) => setStorygraphUrl(e.target.value)} placeholder="https://app.thestorygraph.com/profile/..." /></label>
            <label>{t("profile.instagram")}<input value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/..." /></label>
            <label>{t("profile.twitter")}<input value={twitterUrl} onChange={(e) => setTwitterUrl(e.target.value)} placeholder="https://x.com/..." /></label>
            {socialError && <p className="page-error">{socialError}</p>}
            <div className="page-btn-row">
              <button className="page-btn primary" onClick={handleSocialSave} disabled={socialSaving}>
                {socialSaving ? t("profile.saving") : t("profile.saveBtn")}
              </button>
              <button className="page-btn" onClick={handleSocialCancel}>{t("profile.cancel")}</button>
            </div>
          </div>
        ) : (
          <div className="user-page-form">
            {user?.bioPublic && (
              <div className="profile-row profile-bio-row">
                <p className="profile-bio-text">{user.bioPublic}</p>
              </div>
            )}
            {[
              { label: t("profile.goodreads"),  val: user?.goodreadsUrl  },
              { label: t("profile.storygraph"), val: user?.storygraphUrl },
              { label: t("profile.instagram"),  val: user?.instagramUrl  },
              { label: t("profile.twitter"),    val: user?.twitterUrl    },
            ].filter(r => r.val).map(({ label, val }) => (
              <div key={label} className="profile-row">
                <span className="profile-row-label">{label}</span>
                <a className="profile-row-value profile-row-link" href={val} target="_blank" rel="noopener noreferrer">{val}</a>
              </div>
            ))}
            {!user?.bioPublic && !user?.goodreadsUrl && !user?.storygraphUrl && !user?.instagramUrl && !user?.twitterUrl && (
              <p className="user-collection-empty">{t("profile.socialEmpty")}</p>
            )}
            {socialSaved && <p className="page-success">{t("profile.saved")}</p>}
            <button className="page-btn primary" onClick={() => setEditingSocial(true)}>
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
              const bookData = bookDetails[entry.editionId];
              const edition = bookData ? (bookData.editions || []).find((e) => e.id === entry.editionId) : null;
              const label = bookData
                ? `${bookData.title}${bookData.author ? ` \u2014 ${bookData.author}` : ""}${edition?.editionName ? ` (${edition.editionName})` : ""}`
                : (entry.editionId || entry.bookId || "?");
              return (
                <li key={entry.id} className="user-collection-item">
                  <span className="user-collection-item-label">{label}</span>
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
