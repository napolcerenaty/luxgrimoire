import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import "./AccountPage.css";
import "./UserPages.css";

// ─── Timezone data ────────────────────────────────────────────────────────────
const TIMEZONE_GROUPS = [
  { group: "Europa", zones: [
    "Europe/Warsaw","Europe/London","Europe/Paris","Europe/Berlin","Europe/Rome",
    "Europe/Madrid","Europe/Amsterdam","Europe/Brussels","Europe/Vienna","Europe/Prague",
    "Europe/Budapest","Europe/Bucharest","Europe/Sofia","Europe/Athens","Europe/Helsinki",
    "Europe/Stockholm","Europe/Oslo","Europe/Copenhagen","Europe/Zurich","Europe/Lisbon",
    "Europe/Kiev","Europe/Moscow","Europe/Istanbul",
  ]},
  { group: "Ameryka", zones: [
    "America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
    "America/Anchorage","America/Honolulu","America/Toronto","America/Vancouver",
    "America/Mexico_City","America/Sao_Paulo","America/Argentina/Buenos_Aires","America/Bogota",
  ]},
  { group: "Azja / Pacyfik", zones: [
    "Asia/Tokyo","Asia/Seoul","Asia/Shanghai","Asia/Hong_Kong","Asia/Singapore",
    "Asia/Bangkok","Asia/Dubai","Asia/Kolkata","Asia/Karachi","Asia/Dhaka",
    "Asia/Jakarta","Asia/Taipei","Australia/Sydney","Australia/Melbourne","Pacific/Auckland",
  ]},
  { group: "Afryka / Inne", zones: [
    "Africa/Cairo","Africa/Johannesburg","Africa/Lagos","Africa/Nairobi",
    "Atlantic/Reykjavik","UTC",
  ]},
];

function getGmtOffset(tz) {
  try {
    const parts = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch { return ""; }
}

// ─── NAV ITEMS ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: "profile",       icon: "👤", labelKey: "account.navProfile"       },
  { key: "collection",    icon: "📚", labelKey: "account.navCollection"    },
  { key: "subscriptions", icon: "📮", labelKey: "account.navSubscriptions" },
  { key: "settings",      icon: "⚙️", labelKey: "account.navSettings"      },
];

// ─── PROFILE SECTION (read-only display) ─────────────────────────────────────
function ProfileSection() {
  const { user } = useAuth();
  const { t } = useI18n();

  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  const avatarSrc = user?.avatarUrl ? `http://localhost:8080${user.avatarUrl}` : null;

  return (
    <section className="account-section">
      <h2 className="account-section-title">{t("profile.title")}</h2>

      <div className="account-profile-display">
        <div className="account-profile-avatar-lg">
          {avatarSrc
            ? <img src={avatarSrc} alt={user?.username} className="account-avatar-img-lg" />
            : <span className="account-avatar-initials-lg">{initials}</span>
          }
        </div>
        <div className="account-profile-details">
          <p className="account-profile-fullname">{user?.firstName} {user?.lastName}</p>
          <p className="account-profile-username">@{user?.username}</p>
          <div className="profile-row"><span className="profile-row-label">{t("profile.timezone")}</span><span className="profile-row-value">{user?.timezone}</span></div>
        </div>
      </div>
    </section>
  );
}

// ─── COLLECTION SECTION ───────────────────────────────────────────────────────
function CollectionSection() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [ownedBooks, setOwnedBooks]   = useState([]);
  const [bookDetails, setBookDetails] = useState({});

  useEffect(() => {
    if (!user) return;
    fetch("http://localhost:8080/api/user/books", { credentials: "include" })
      .then((r) => r.ok ? r.json() : []).then(setOwnedBooks).catch(() => {});
  }, [user]);

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
    const res = await fetch(`http://localhost:8080/api/user/books/${entryId}`, { method: "DELETE", credentials: "include" });
    if (res.ok) setOwnedBooks((prev) => prev.filter((e) => e.id !== entryId));
  };

  return (
    <section className="account-section">
      <h2 className="account-section-title">{t("userCollection.myBooks")}</h2>
      {ownedBooks.length === 0 ? (
        <p className="user-collection-empty">{t("userCollection.empty")}</p>
      ) : (
        <ul className="user-collection-list">
          {ownedBooks.map((entry) => {
            const bd = bookDetails[entry.editionId];
            const ed = bd ? (bd.editions || []).find((e) => e.id === entry.editionId) : null;
            const label = bd
              ? `${bd.title}${bd.author ? ` — ${bd.author}` : ""}${ed?.editionName ? ` (${ed.editionName})` : ""}`
              : (entry.editionId || "?");
            return (
              <li key={entry.id} className="user-collection-item">
                <span className="user-collection-item-label">{label}</span>
                <button className="user-collection-remove-btn" onClick={() => removeBook(entry.id)} title={t("userCollection.remove")}>✕</button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── SUBSCRIPTIONS SECTION ────────────────────────────────────────────────────
function SubscriptionsSection() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [userSubs, setUserSubs]   = useState([]);
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    if (!user) return;
    fetch("http://localhost:8080/api/user/subscriptions", { credentials: "include" })
      .then((r) => r.ok ? r.json() : []).then(setUserSubs).catch(() => {});
    fetch("http://localhost:8080/api/companies", { credentials: "include" })
      .then((r) => r.ok ? r.json() : []).then(setCompanies).catch(() => {});
  }, [user]);

  const removeSub = async (entryId) => {
    const res = await fetch(`http://localhost:8080/api/user/subscriptions/${entryId}`, { method: "DELETE", credentials: "include" });
    if (res.ok) setUserSubs((prev) => prev.filter((e) => e.id !== entryId));
  };

  const getSubLabel = (entry) => {
    const co = companies.find((c) => c.id === entry.companyId);
    if (!co) return entry.subscriptionId;
    const sub = (co.subscriptions || []).find((s) => s.id === entry.subscriptionId);
    return sub ? `${co.name} — ${sub.name}` : co.name;
  };

  return (
    <section className="account-section">
      <h2 className="account-section-title">{t("userCollection.mySubs")}</h2>
      {userSubs.length === 0 ? (
        <p className="user-collection-empty">{t("userCollection.empty")}</p>
      ) : (
        <ul className="user-collection-list">
          {userSubs.map((entry) => (
            <li key={entry.id} className="user-collection-item">
              <span className="user-collection-item-label">{getSubLabel(entry)}</span>
              <button className="user-collection-remove-btn" onClick={() => removeSub(entry.id)} title={t("userCollection.remove")}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── SETTINGS SECTION ─────────────────────────────────────────────────────────
function SettingsSection() {
  const { user, updateProfile, uploadAvatar } = useAuth();
  const { t } = useI18n();

  // ── Name / timezone form ──────────────────────────────────────────────────
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName,  setLastName]  = useState(user?.lastName  ?? "");
  const [timezone,  setTimezone]  = useState(user?.timezone  ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [saved,   setSaved]   = useState(false);

  // ── Avatar upload ──────────────────────────────────────────────────────────
  const [avatarPreview,   setAvatarPreview]   = useState(null);
  const [avatarFile,      setAvatarFile]      = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarErr,       setAvatarErr]       = useState("");
  const [avatarSaved,     setAvatarSaved]     = useState(false);
  const fileInputRef = useRef(null);

  const currentAvatarSrc = user?.avatarUrl ? `http://localhost:8080${user.avatarUrl}` : null;
  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarErr("");
    setAvatarSaved(false);
  };

  const handleAvatarSave = async () => {
    if (!avatarFile) return;
    setUploadingAvatar(true); setAvatarErr("");
    try {
      await uploadAvatar(avatarFile);
      setAvatarFile(null); setAvatarPreview(null); setAvatarSaved(true);
      setTimeout(() => setAvatarSaved(false), 3000);
    } catch (err) { setAvatarErr(err.message); }
    finally { setUploadingAvatar(false); }
  };

  const handleAvatarCancel = () => {
    setAvatarFile(null);
    if (avatarPreview) { URL.revokeObjectURL(avatarPreview); setAvatarPreview(null); }
    setAvatarErr("");
  };

  // ── Save name + timezone ────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true); setSaveErr("");
    try {
      await updateProfile(firstName, lastName, timezone);
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) { setSaveErr(err.message); }
    finally { setSaving(false); }
  };

  const gmtOffsets = useMemo(() => {
    const map = {};
    TIMEZONE_GROUPS.forEach(({ zones }) => zones.forEach((tz) => { map[tz] = getGmtOffset(tz); }));
    return map;
  }, []);

  const tzLabel = (tz) => {
    const offset = gmtOffsets[tz] ?? "";
    return offset ? `${tz.replace(/_/g, " ")}  (${offset})` : tz.replace(/_/g, " ");
  };

  const displayAvatarSrc = avatarPreview ?? currentAvatarSrc;

  return (
    <section className="account-section">
      <h2 className="account-section-title">{t("settings.title")}</h2>

      {/* ── Avatar ── */}
      <div className="account-avatar-editor">
        <div className="account-avatar-preview-wrap">
          {displayAvatarSrc
            ? <img src={displayAvatarSrc} alt="avatar" className="account-avatar-img-lg" />
            : <span className="account-avatar-initials-lg">{initials}</span>
          }
          {avatarPreview && (
            <span className="account-avatar-preview-badge">{t("settings.avatarPreview")}</span>
          )}
        </div>
        <div className="account-avatar-editor-actions">
          <button className="page-btn" onClick={() => fileInputRef.current?.click()}>
            {t("settings.avatarChange")}
          </button>
          {avatarFile && (
            <>
              <button className="page-btn primary" onClick={handleAvatarSave} disabled={uploadingAvatar}>
                {uploadingAvatar ? t("settings.avatarUploading") : t("settings.avatarSave")}
              </button>
              <button className="page-btn" onClick={handleAvatarCancel}>{t("profile.cancel")}</button>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleAvatarChange}
          />
          {avatarErr  && <p className="page-error">{avatarErr}</p>}
          {avatarSaved && <p className="page-success">{t("settings.avatarSaved")}</p>}
        </div>
      </div>

      <div className="account-section-divider" />

      {/* ── Name + timezone ── */}
      <div className="user-page-form">
        <label>{t("profile.firstName")}<input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></label>
        <label>{t("profile.lastName")} <input value={lastName}  onChange={(e) => setLastName(e.target.value)} /></label>
        <label>
          {t("settings.timezone")}
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONE_GROUPS.map(({ group, zones }) => (
              <optgroup key={group} label={group}>
                {zones.map((tz) => <option key={tz} value={tz}>{tzLabel(tz)}</option>)}
              </optgroup>
            ))}
          </select>
          <span className="field-hint">{t("settings.browserTz", { tz: Intl.DateTimeFormat().resolvedOptions().timeZone })}</span>
        </label>
        {saveErr && <p className="page-error">{saveErr}</p>}
        {saved   && <p className="page-success">{t("settings.saved")}</p>}
        <button className="page-btn primary" onClick={handleSave} disabled={saving}>
          {saving ? t("settings.saving") : t("settings.saveBtn")}
        </button>
      </div>
    </section>
  );
}

// ─── ACCOUNT PAGE (master-detail) ────────────────────────────────────────────
export default function AccountPage({ onBack, initialSection = "profile" }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [activeSection, setActiveSection]       = useState(initialSection);
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false);

  const handleNavClick = (key) => {
    setActiveSection(key);
    setMobileSectionOpen(true);
  };

  const renderSection = () => {
    switch (activeSection) {
      case "profile":       return <ProfileSection />;
      case "collection":    return <CollectionSection />;
      case "subscriptions": return <SubscriptionsSection />;
      case "settings":      return <SettingsSection />;
      default:              return null;
    }
  };

  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  const sidebarAvatarSrc = user?.avatarUrl ? `http://localhost:8080${user.avatarUrl}` : null;

  return (
    <div className={`account-page${mobileSectionOpen ? " section-open" : ""}`}>

      {/* ── Sidebar / mobile menu ── */}
      <aside className="account-sidebar">
        <div className="account-user-badge">
          <div className="account-avatar">
            {sidebarAvatarSrc
              ? <img src={sidebarAvatarSrc} alt={user?.username} className="account-avatar-img" />
              : <span className="account-avatar-initials">{initials}</span>
            }
          </div>
          <div className="account-user-text">
            <p className="account-display-name">{user?.firstName} {user?.lastName}</p>
            <p className="account-username">@{user?.username}</p>
          </div>
        </div>

        <nav className="account-nav">
          {NAV_ITEMS.map(({ key, icon, labelKey }) => (
            <button
              key={key}
              className={`account-nav-item${activeSection === key ? " active" : ""}`}
              onClick={() => handleNavClick(key)}
            >
              <span className="account-nav-icon">{icon}</span>
              <span className="account-nav-label">{t(labelKey)}</span>
              <span className="account-nav-arrow">›</span>
            </button>
          ))}
        </nav>

        <button className="account-back-site-btn" onClick={onBack}>
          {t("account.backToSite")}
        </button>
      </aside>

      {/* ── Content area ── */}
      <main className="account-content">
        <button
          className="account-mobile-back-btn"
          onClick={() => setMobileSectionOpen(false)}
        >
          {t("account.backToAccount")}
        </button>
        {renderSection()}
      </main>
    </div>
  );
}
