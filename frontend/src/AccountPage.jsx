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

// ─── Language → Intl locale ────────────────────────────────────────────────────
const LANG_LOCALE = { pl: "pl-PL", en: "en-GB", de: "de-DE", fr: "fr-FR", es: "es-ES" };

// ─── Test calendar data ────────────────────────────────────────────────────────
const TEST_RENEWALS = [
  { id: "r1", day: 5,  label: "FairyLoot • Romantasy",  hue: "255,62%,55%" },
  { id: "r2", day: 12, label: "OwlCrate • YA Box",       hue: "199,91%,36%" },
  { id: "r3", day: 20, label: "Illumicrate • Fantasy",   hue: "38,80%,40%"  },
];

const TEST_SALES = [
  { id: "s1", day: 8,  title: "A Court of Thorns and Roses", box: "FairyLoot",   edition: "Deluxe Collector's Edition",        time: "13:00 UTC", author: "Sarah J. Maas",   hue: "255,62%,55%" },
  { id: "s2", day: 15, title: "Fourth Wing",                 box: "OwlCrate",    edition: "Special Edition",                  time: "16:00 UTC", author: "Rebecca Yarros",  hue: "199,91%,36%" },
  { id: "s3", day: 23, title: "House of Salt and Sorrows",   box: "FairyLoot",   edition: "FairyLoot Exclusive Edition",       time: "12:00 UTC", author: "Erin A. Craig",   hue: "350,80%,46%" },
  { id: "s4", day: 28, title: "Crescent City",               box: "Illumicrate", edition: "Collector's Edition",               time: "14:00 UTC", author: "Sarah J. Maas",   hue: "38,80%,40%"  },
];

// ─── NAV ITEMS ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: "calendar",      icon: "📅", labelKey: "account.navCalendar"      },
  { key: "collection",    icon: "📚", labelKey: "account.navCollection"    },
  { key: "subscriptions", icon: "📮", labelKey: "account.navSubscriptions" },
  { key: "settings",      icon: "⚙️", labelKey: "account.navSettings"      },
];

// ─── CALENDAR SECTION ────────────────────────────────────────────────────────
function CalendarSection() {
  const { t, lang } = useI18n();
  const locale = LANG_LOCALE[lang] ?? "en-GB";
  const today  = new Date();

  const [viewDate,     setViewDate]     = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedSale, setSelectedSale] = useState(null);

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  // Mon–Sun day names via Intl (2024-01-01 = Monday)
  const dayNames = useMemo(() =>
    Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 0, i + 1))
    ), [locale]);

  const monthHeading = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(viewDate);

  // 42-cell grid, Mon-based week
  const cells = useMemo(() => {
    const firstDow    = new Date(year, month, 1).getDay();
    const startPad    = (firstDow + 6) % 7;           // Mon=0 … Sun=6
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev  = new Date(year, month,     0).getDate();
    const arr = [];
    for (let i = startPad - 1; i >= 0; i--) arr.push({ day: daysInPrev - i, current: false });
    for (let d = 1; d <= daysInMonth; d++)  arr.push({ day: d,              current: true  });
    let nd = 1;
    while (arr.length < 42) arr.push({ day: nd++, current: false });
    return arr;
  }, [year, month]);

  const renewalsForDay = (day) => TEST_RENEWALS.filter(r => r.day === day);
  const salesForDay    = (day) => TEST_SALES.filter(s => s.day === day);
  const isToday        = (day) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <section className="account-section account-calendar-section">

      {/* ── Month navigation ── */}
      <div className="account-cal-header">
        <button className="account-cal-nav-btn" onClick={prevMonth} aria-label="previous month">‹</button>
        <h2 className="account-cal-title">{monthHeading}</h2>
        <button className="account-cal-nav-btn" onClick={nextMonth} aria-label="next month">›</button>
      </div>

      {/* ── Day-name row + grid ── */}
      <div className="account-cal-grid">
        {dayNames.map(dn => (
          <div key={dn} className="account-cal-day-header">{dn}</div>
        ))}

        {cells.map((cell, idx) => (
          <div
            key={idx}
            className={[
              "account-cal-cell",
              !cell.current          ? "other-month" : "",
              cell.current && isToday(cell.day) ? "today" : "",
            ].filter(Boolean).join(" ")}
          >
            <span className="account-cal-day-num">{cell.day}</span>

            {cell.current && renewalsForDay(cell.day).map(r => (
              <div
                key={r.id}
                className="account-cal-renewal"
                style={{ "--ev": `hsl(${r.hue})`, "--ev-bg": `hsla(${r.hue},.18)` }}
                title={r.label}
              >
                🔄 {r.label}
              </div>
            ))}

            {cell.current && salesForDay(cell.day).map(s => (
              <button
                key={s.id}
                className="account-cal-sale"
                style={{ "--ev": `hsl(${s.hue})`, "--ev-bg": `hsla(${s.hue},.18)` }}
                onClick={() => setSelectedSale(s)}
                title={s.title}
              >
                <span className="account-cal-sale-dot" />
                <span className="account-cal-sale-inner">
                  <span className="account-cal-sale-time">{s.time}</span>
                  <span className="account-cal-sale-title">{s.title}</span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* ── Sale detail popup ── */}
      {selectedSale && (
        <div className="account-cal-overlay" onClick={() => setSelectedSale(null)}>
          <div className="account-cal-popup" onClick={e => e.stopPropagation()}>
            <div className="account-cal-popup-bar" style={{ background: `hsl(${selectedSale.hue})` }} />
            <button className="account-cal-popup-close" onClick={() => setSelectedSale(null)}>✕</button>
            <div className="account-cal-popup-body">
              <p  className="account-cal-popup-box">{selectedSale.box}</p>
              <h3 className="account-cal-popup-title">{selectedSale.title}</h3>
              <p  className="account-cal-popup-author">{selectedSale.author}</p>
              <p  className="account-cal-popup-edition">{selectedSale.edition}</p>
              <p  className="account-cal-popup-time">🕐 {selectedSale.time}</p>
            </div>
          </div>
        </div>
      )}
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
export default function AccountPage({ onBack, initialSection = "calendar" }) {
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
      case "calendar":      return <CalendarSection />;
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
