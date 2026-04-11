import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import { API } from "./api";
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
  { key: "iso",           icon: "🔍", labelKey: "account.navIso"           },
  { key: "interested",    icon: "⭐", labelKey: "account.navInterested"    },
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

// ─── BOOK CARD (grid) ────────────────────────────────────────────────────────
function BookCard({ entry, onRemove, onBookClick, t }) {
  return (
    <div className={`account-book-card${onBookClick ? " clickable" : ""}`} onClick={onBookClick ? () => onBookClick(entry.bookId) : undefined}>
      <div className="account-book-card-cover">
        {entry.imageUrl
          ? <img src={entry.imageUrl} alt={entry.title} />
          : <div className="account-book-card-cover-placeholder"><span>{entry.title?.[0] ?? "?"}</span></div>
        }
      </div>
      <div className="account-book-card-info">
        <p className="account-book-card-title">{entry.title || "—"}</p>
        {entry.author && <p className="account-book-card-author">{entry.author}</p>}
        {entry.editionName && <p className="account-book-card-edition">{entry.editionName}</p>}
        {entry.seriesName && <p className="account-book-card-series">{entry.seriesName}</p>}
      </div>
      <button className="account-book-card-remove" onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }} title={t("booklist.remove")}>✕</button>
    </div>
  );
}

// ─── BOOK ROW (list) ─────────────────────────────────────────────────────────
function BookRow({ entry, onRemove, onBookClick, t }) {
  return (
    <div className={`account-book-row${onBookClick ? " clickable" : ""}`} onClick={onBookClick ? () => onBookClick(entry.bookId) : undefined}>
      <div className="account-book-row-thumb">
        {entry.imageUrl
          ? <img src={entry.imageUrl} alt={entry.title} />
          : <div className="account-book-row-thumb-placeholder" />
        }
      </div>
      <div className="account-book-row-info">
        <span className="account-book-row-title">{entry.title || "—"}</span>
        {entry.author && <span className="account-book-row-author">{entry.author}</span>}
        {entry.editionName && <span className="account-book-row-edition">{entry.editionName}</span>}
        {entry.seriesName && <span className="account-book-row-series">{entry.seriesName}</span>}
      </div>
      <button className="account-book-row-remove" onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }} title={t("booklist.remove")}>✕</button>
    </div>
  );
}

// ─── BOOK LIST SECTION (shared for collection / ISO / interested) ─────────────
function BookListSection({ flag, onBookClick }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [entries,     setEntries]     = useState([]);
  const [bookDetails, setBookDetails] = useState({});
  const [companies,   setCompanies]   = useState([]);
  const [viewMode,    setViewMode]    = useState("grid");
  const [filterTitle,  setFilterTitle]  = useState("");
  const [filterAuthor, setFilterAuthor] = useState("");
  const [filterBoxId,  setFilterBoxId]  = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(API.COMPANIES, { credentials: "include" })
      .then((r) => r.ok ? r.json() : []).then(setCompanies).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setEntries([]);
    setBookDetails({});
    fetch(`${API.USER_BOOKS}?flag=${flag}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { setEntries(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user, flag]);

  useEffect(() => {
    const ids = [...new Set(entries.map((e) => e.editionId).filter(Boolean))];
    ids.forEach((id) => {
      if (bookDetails[id]) return;
      fetch(API.BOOK_BY_EDITION(id), { credentials: "include" })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) setBookDetails((prev) => ({ ...prev, [id]: d })); })
        .catch(() => {});
    });
  }, [entries]); // bookDetails intentionally omitted to avoid refetch loop

  const enriched = entries.map((entry) => {
    const bd = bookDetails[entry.editionId];
    const ed = bd ? (bd.editions || []).find((e) => e.id === entry.editionId) : null;
    return {
      ...entry,
      title:            bd?.title ?? "",
      author:           bd?.author ?? "",
      seriesName:       bd?.seriesName ?? "",
      editionName:      ed?.editionName ?? "",
      bookBoxCompanyId: ed?.bookBoxCompanyId ?? null,
      imageUrl:         ed?.imageUrls?.[0] ?? null,
    };
  });

  const filtered = enriched.filter((e) => {
    if (filterTitle  && !e.title.toLowerCase().includes(filterTitle.toLowerCase()))  return false;
    if (filterAuthor && !e.author.toLowerCase().includes(filterAuthor.toLowerCase())) return false;
    if (filterBoxId  && e.bookBoxCompanyId !== filterBoxId)                           return false;
    return true;
  });

  const removeBook = async (entryId) => {
    const res = await fetch(API.USER_BOOK(entryId), { method: "DELETE", credentials: "include" });
    if (res.ok) setEntries((prev) => prev.filter((e) => e.id !== entryId));
  };

  const sectionTitle = flag === "OWNED"       ? t("account.navCollection")
                     : flag === "ISO"         ? t("account.navIso")
                     :                          t("account.navInterested");

  return (
    <section className="account-section">
      <div className="account-booklist-header">
        <h2 className="account-section-title">{sectionTitle}</h2>
        <div className="account-view-toggle">
          <button className={`account-view-btn${viewMode === "grid" ? " active" : ""}`} onClick={() => setViewMode("grid")} title={t("booklist.grid")}>⊞</button>
          <button className={`account-view-btn${viewMode === "list" ? " active" : ""}`} onClick={() => setViewMode("list")} title={t("booklist.list")}>☰</button>
        </div>
      </div>

      <div className="account-booklist-filters">
        <input className="account-filter-input" placeholder={t("booklist.filterTitle")}  value={filterTitle}  onChange={(e) => setFilterTitle(e.target.value)} />
        <input className="account-filter-input" placeholder={t("booklist.filterAuthor")} value={filterAuthor} onChange={(e) => setFilterAuthor(e.target.value)} />
        <select className="account-filter-input account-filter-select" value={filterBoxId} onChange={(e) => setFilterBoxId(e.target.value)}>
          <option value="">{t("booklist.filterBoxAll")}</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="user-collection-empty">{t("booklist.loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="user-collection-empty">{t("booklist.empty")}</p>
      ) : viewMode === "grid" ? (
        <div className="account-booklist-grid">
          {filtered.map((e) => <BookCard key={e.id} entry={e} onRemove={removeBook} onBookClick={onBookClick} t={t} />)}
        </div>
      ) : (
        <div className="account-booklist-list">
          {filtered.map((e) => <BookRow key={e.id} entry={e} onRemove={removeBook} onBookClick={onBookClick} t={t} />)}
        </div>
      )}
    </section>
  );
}

// ─── Helper: next renewal date ────────────────────────────────────────────────
function nextRenewal(entry, sub) {
  // entry.renewalDay takes precedence (user-set), falls back to sub.renewalDay
  const renewalDay = entry?.renewalDay ?? sub?.renewalDay;
  if (!renewalDay) return null;

  const type = sub?.type || 'MONTHLY';
  const startingMonth = entry?.startingMonth ?? 1;
  const now = new Date();

  if (type === 'MONTHLY') {
    const candidate = new Date(now.getFullYear(), now.getMonth(), renewalDay);
    if (candidate > now) return candidate;
    return new Date(now.getFullYear(), now.getMonth() + 1, renewalDay);
  }

  const step = type === 'BI_MONTHLY' ? 2 : 3;
  const startMonthIdx = (startingMonth - 1) % step;
  for (let i = 0; i < 24; i++) {
    const candidateMonth = now.getMonth() + i;
    const year = now.getFullYear() + Math.floor(candidateMonth / 12);
    const month = candidateMonth % 12;
    if (((month - startMonthIdx) % step + step) % step === 0) {
      const candidate = new Date(year, month, renewalDay);
      if (candidate > now) return candidate;
    }
  }
  return null;
}

// ─── SUBSCRIPTION DETAIL ─────────────────────────────────────────────────────
function SubDetailView({ entry: initialEntry, company, sub, onBack }) {
  const { t, lang } = useI18n();
  const locale = LANG_LOCALE[lang] ?? "en-GB";
  const [entry, setEntry] = useState(initialEntry);
  const [costHistory, setCostHistory] = useState([]);
  const [billingPeriods, setBillingPeriods] = useState([]);
  const [editingCosts, setEditingCosts] = useState(false);
  const [addingBillingPeriod, setAddingBillingPeriod] = useState(false);
  const now = new Date();
  const [costForm, setCostForm] = useState({
    effectiveFromMonth: now.getMonth() + 1,
    effectiveFromYear: now.getFullYear(),
    shippingCost: "",
    taxesAndFees: "",
  });
  const [bpForm, setBpForm] = useState({
    billedAt: new Date().toISOString().slice(0, 10),
    amountPaid: "",
    monthsCovered: "1",
    coveredFromMonth: String(now.getMonth() + 1),
    coveredFromYear: String(now.getFullYear()),
    prepayOptionId: "",
    notes: "",
  });

  const loadBillingPeriods = () => {
    fetch(API.USER_SUB_BILLING_PERIODS(entry.id), { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setBillingPeriods)
      .catch(() => {});
  };

  useEffect(() => {
    fetch(API.USER_SUBSCRIPTION_COST_HISTORY(entry.id), { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setCostHistory)
      .catch(() => {});
    loadBillingPeriods();
  }, [entry.id]);

  const renewal = nextRenewal(entry, sub);
  const renewalStr = renewal
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(renewal)
    : null;

  const logoSrc = sub?.logoUrl || company?.logoUrl;

  const handleSaveCosts = async () => {
    const body = {
      shippingCost: costForm.shippingCost !== "" ? parseFloat(costForm.shippingCost) : null,
      taxesAndFees: costForm.taxesAndFees !== "" ? parseFloat(costForm.taxesAndFees) : null,
      effectiveFromMonth: parseInt(costForm.effectiveFromMonth),
      effectiveFromYear: parseInt(costForm.effectiveFromYear),
    };
    const res = await fetch(API.USER_SUBSCRIPTION(entry.id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setEntry(updated);
      setEditingCosts(false);
      fetch(API.USER_SUBSCRIPTION_COST_HISTORY(entry.id), { credentials: "include" })
        .then((r) => r.ok ? r.json() : [])
        .then(setCostHistory)
        .catch(() => {});
    }
  };

  return (
    <section className="account-section">
      <button className="account-back-site-btn" style={{ alignSelf: "flex-start", marginBottom: "1.25rem" }} onClick={onBack}>
        ← {t("account.navSubscriptions")}
      </button>

      <div className="account-sub-detail-header">
        <div className="account-sub-detail-logo">
          {logoSrc
            ? <img src={logoSrc} alt={company?.name} />
            : <span className="account-sub-logo-placeholder">{company?.name?.[0] ?? "?"}</span>
          }
        </div>
        <div className="account-sub-detail-title-block">
          <h2 className="account-sub-detail-company">{company?.name}</h2>
          <p className="account-sub-detail-subname">{sub?.name}</p>
          {company?.websiteUrl && (
            <a className="account-sub-detail-website" href={company.websiteUrl} target="_blank" rel="noopener noreferrer">
              🌐 {company.websiteUrl}
            </a>
          )}
        </div>
      </div>

      {renewalStr && (
        <div className="account-sub-detail-renewal">
          🔄 {t("sub.nextRenewal")}: <strong>{renewalStr}</strong>
        </div>
      )}

      <div className="account-sub-detail-meta">
        {sub?.basePrice && (
          <div className="account-sub-meta-row">
            <span className="account-sub-meta-label">{t("sub.price")}</span>
            <span className="account-sub-meta-value">{sub.basePrice} {sub.currency ?? ""}</span>
          </div>
        )}
        {sub?.type && (
          <div className="account-sub-meta-row">
            <span className="account-sub-meta-label">{t("sub.type")}</span>
            <span className="account-sub-meta-value">{sub.type}</span>
          </div>
        )}
        {sub?.renewalDay && (
          <div className="account-sub-meta-row">
            <span className="account-sub-meta-label">Dzień odnowy</span>
            <span className="account-sub-meta-value">{sub.renewalDay}</span>
          </div>
        )}
        {entry.shippingCost != null && (
          <div className="account-sub-meta-row">
            <span className="account-sub-meta-label">Wysyłka</span>
            <span className="account-sub-meta-value">{entry.shippingCost}</span>
          </div>
        )}
        {entry.taxesAndFees != null && (
          <div className="account-sub-meta-row">
            <span className="account-sub-meta-label">Podatki/opłaty</span>
            <span className="account-sub-meta-value">{entry.taxesAndFees}</span>
          </div>
        )}
        {sub?.genres?.length > 0 && (
          <div className="account-sub-meta-row">
            <span className="account-sub-meta-label">{t("sub.genres")}</span>
            <div className="account-sub-genres">
              {sub.genres.map((g) => <span key={g} className="account-sub-genre-tag">{g}</span>)}
            </div>
          </div>
        )}
        {sub?.shipsInternationally !== undefined && (
          <div className="account-sub-meta-row">
            <span className="account-sub-meta-label">{t("sub.international")}</span>
            <span className="account-sub-meta-value">{sub.shipsInternationally ? "✓" : "✗"}</span>
          </div>
        )}
      </div>

      {/* Edit costs */}
      {!editingCosts ? (
        <button className="page-btn" style={{ marginTop: "1rem" }} onClick={() => setEditingCosts(true)}>
          Edytuj koszty
        </button>
      ) : (
        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 360 }}>
          <h4 style={{ margin: 0 }}>Edytuj koszty</h4>
          <label style={{ fontSize: "0.9rem" }}>
            Miesiąc obowiązywania
            <select
              className="admin-form-select"
              style={{ display: "block", marginTop: "0.25rem" }}
              value={costForm.effectiveFromMonth}
              onChange={(e) => setCostForm((f) => ({ ...f, effectiveFromMonth: e.target.value }))}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: "0.9rem" }}>
            Rok obowiązywania
            <input
              type="number"
              className="admin-form-input"
              style={{ display: "block", marginTop: "0.25rem" }}
              value={costForm.effectiveFromYear}
              onChange={(e) => setCostForm((f) => ({ ...f, effectiveFromYear: e.target.value }))}
            />
          </label>
          <label style={{ fontSize: "0.9rem" }}>
            Koszt wysyłki
            <input
              type="number"
              step="0.01"
              min="0"
              className="admin-form-input"
              style={{ display: "block", marginTop: "0.25rem" }}
              value={costForm.shippingCost}
              onChange={(e) => setCostForm((f) => ({ ...f, shippingCost: e.target.value }))}
              placeholder="0.00"
            />
          </label>
          <label style={{ fontSize: "0.9rem" }}>
            Podatki/opłaty
            <input
              type="number"
              step="0.01"
              min="0"
              className="admin-form-input"
              style={{ display: "block", marginTop: "0.25rem" }}
              value={costForm.taxesAndFees}
              onChange={(e) => setCostForm((f) => ({ ...f, taxesAndFees: e.target.value }))}
              placeholder="0.00"
            />
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="page-btn primary" onClick={handleSaveCosts}>Zapisz</button>
            <button className="page-btn" onClick={() => setEditingCosts(false)}>Anuluj</button>
          </div>
        </div>
      )}

      {/* Cost history */}
      {costHistory.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <h4 style={{ marginBottom: "0.5rem" }}>Historia kosztów</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {costHistory.map((ch) => (
              <li key={ch.id} style={{ fontSize: "0.9rem" }}>
                Od {ch.effectiveFromMonth}/{ch.effectiveFromYear}: Wysyłka {ch.shippingCost ?? "—"}, Podatki {ch.taxesAndFees ?? "—"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Billing periods */}
      <div style={{ marginTop: "1.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h4 style={{ margin: 0 }}>Okresy rozliczeniowe</h4>
          <button className="page-btn primary" style={{ fontSize: "0.85rem" }}
            onClick={() => setAddingBillingPeriod(true)}>+ Dodaj</button>
        </div>
        {billingPeriods.length === 0 && !addingBillingPeriod && (
          <p style={{ fontSize: "0.9rem", color: "var(--text-ghost)" }}>Brak zapisanych okresów rozliczeniowych.</p>
        )}
        {billingPeriods.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {billingPeriods.map((bp) => {
              const amortized = bp.monthsCovered > 1
                ? ` (${(bp.amountPaid / bp.monthsCovered).toFixed(2)}/mies.)`
                : "";
              return (
                <li key={bp.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem" }}>
                  <span>
                    {bp.coveredFromMonth}/{bp.coveredFromYear}
                    {bp.monthsCovered > 1 ? ` – ${bp.monthsCovered} mies.` : ""}
                    {" — "}<strong>{bp.amountPaid}</strong>{amortized}
                    {bp.billedAt ? ` · płatność: ${bp.billedAt}` : ""}
                    {bp.notes ? ` · ${bp.notes}` : ""}
                  </span>
                  <button className="page-btn" style={{ fontSize: "0.78rem", padding: "0.1rem 0.4rem" }}
                    onClick={async () => {
                      const res = await fetch(API.USER_SUB_BILLING_PERIOD(entry.id, bp.id), { method: "DELETE", credentials: "include" });
                      if (res.ok) loadBillingPeriods();
                    }}>✕</button>
                </li>
              );
            })}
          </ul>
        )}
        {addingBillingPeriod && (
          <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "var(--bg-subtle)", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {/* Prepay option shortcuts */}
            {sub?.prepayOptions && sub.prepayOptions.length > 0 && (
              <div>
                <div style={{ fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.3rem" }}>Szybki wybór opcji z góry:</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  <button type="button" className="page-btn"
                    style={{ fontSize: "0.82rem" }}
                    onClick={() => setBpForm(f => ({ ...f, monthsCovered: "1", amountPaid: String(sub.basePrice ?? ""), prepayOptionId: "" }))}>
                    Miesięczna ({sub.basePrice})
                  </button>
                  {sub.prepayOptions.map(opt => (
                    <button key={opt.id} type="button" className="page-btn"
                      style={{ fontSize: "0.82rem" }}
                      onClick={() => setBpForm(f => ({ ...f, monthsCovered: String(opt.months), amountPaid: String(opt.price), prepayOptionId: opt.id }))}>
                      {opt.label || `${opt.months} mies.`} ({opt.price})
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <label style={{ fontSize: "0.88rem" }}>
                Data płatności
                <input type="date" className="admin-form-input" style={{ display: "block" }}
                  value={bpForm.billedAt} onChange={e => setBpForm(f => ({ ...f, billedAt: e.target.value }))} />
              </label>
              <label style={{ fontSize: "0.88rem" }}>
                Kwota
                <input type="number" step="0.01" min="0" className="admin-form-input" style={{ display: "block" }}
                  value={bpForm.amountPaid} onChange={e => setBpForm(f => ({ ...f, amountPaid: e.target.value }))} placeholder="0.00" />
              </label>
              <label style={{ fontSize: "0.88rem" }}>
                Mies. pokrytych
                <input type="number" min="1" max="24" className="admin-form-input" style={{ display: "block" }}
                  value={bpForm.monthsCovered} onChange={e => setBpForm(f => ({ ...f, monthsCovered: e.target.value }))} />
              </label>
              <label style={{ fontSize: "0.88rem" }}>
                Od miesiąca
                <input type="number" min="1" max="12" className="admin-form-input" style={{ display: "block" }}
                  value={bpForm.coveredFromMonth} onChange={e => setBpForm(f => ({ ...f, coveredFromMonth: e.target.value }))} />
              </label>
              <label style={{ fontSize: "0.88rem" }}>
                Od roku
                <input type="number" min="2020" max="2099" className="admin-form-input" style={{ display: "block" }}
                  value={bpForm.coveredFromYear} onChange={e => setBpForm(f => ({ ...f, coveredFromYear: e.target.value }))} />
              </label>
            </div>
            <label style={{ fontSize: "0.88rem" }}>
              Notatka (opcjonalnie)
              <input className="admin-form-input" style={{ display: "block" }}
                value={bpForm.notes} onChange={e => setBpForm(f => ({ ...f, notes: e.target.value }))} />
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="page-btn primary" onClick={async () => {
                const body = {
                  billedAt: bpForm.billedAt,
                  amountPaid: bpForm.amountPaid !== "" ? parseFloat(bpForm.amountPaid) : null,
                  monthsCovered: parseInt(bpForm.monthsCovered) || 1,
                  coveredFromMonth: parseInt(bpForm.coveredFromMonth),
                  coveredFromYear: parseInt(bpForm.coveredFromYear),
                  prepayOptionId: bpForm.prepayOptionId || null,
                  notes: bpForm.notes || null,
                };
                const res = await fetch(API.USER_SUB_BILLING_PERIODS(entry.id), {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify(body),
                });
                if (res.ok) {
                  loadBillingPeriods();
                  setAddingBillingPeriod(false);
                }
              }}>Zapisz</button>
              <button className="page-btn" onClick={() => setAddingBillingPeriod(false)}>Anuluj</button>
            </div>
          </div>
        )}
      </div>

      {company?.description && (
        <p className="account-sub-detail-desc">{company.description}</p>
      )}
    </section>
  );
}

// ─── SUBSCRIPTIONS SECTION ────────────────────────────────────────────────────
function SubscriptionsSection() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const locale = LANG_LOCALE[lang] ?? "en-GB";
  const [userSubs,    setUserSubs]    = useState([]);
  const [companies,   setCompanies]   = useState([]);
  const [selected,    setSelected]    = useState(null); // { entry, company, sub }
  const [filterQuery, setFilterQuery] = useState("");

  useEffect(() => {
    if (!user) return;
    fetch(API.USER_SUBSCRIPTIONS, { credentials: "include" })
      .then((r) => r.ok ? r.json() : []).then(setUserSubs).catch(() => {});
    fetch(API.COMPANIES, { credentials: "include" })
      .then((r) => r.ok ? r.json() : []).then(setCompanies).catch(() => {});
  }, [user]);

  if (selected) {
    return <SubDetailView {...selected} onBack={() => setSelected(null)} />;
  }

  const removeSub = async (entryId) => {
    const res = await fetch(API.USER_SUBSCRIPTION(entryId), { method: "DELETE", credentials: "include" });
    if (res.ok) setUserSubs((prev) => prev.filter((e) => e.id !== entryId));
  };

  const handleClick = (entry) => {
    const co  = companies.find((c) => c.id === entry.companyId);
    const sub = co ? (co.subscriptions || []).find((s) => s.id === entry.subscriptionId) : null;
    setSelected({ entry, company: co, sub });
  };

  const q = filterQuery.trim().toLowerCase();
  const filtered = q
    ? userSubs.filter((entry) => {
        const co  = companies.find((c) => c.id === entry.companyId);
        const sub = co ? (co.subscriptions || []).find((s) => s.id === entry.subscriptionId) : null;
        return (
          (sub?.name  ?? "").toLowerCase().includes(q) ||
          (co?.name   ?? "").toLowerCase().includes(q)
        );
      })
    : userSubs;

  return (
    <section className="account-section">
      <h2 className="account-section-title">{t("account.navSubscriptions")}</h2>

      {userSubs.length > 0 && (
        <div className="account-booklist-filters" style={{ marginBottom: "1rem" }}>
          <input
            className="account-filter-input"
            type="text"
            placeholder="Filtruj po nazwie subskrypcji lub book boxa…"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
          {q && (
            <button
              className="account-filter-clear"
              onClick={() => setFilterQuery("")}
              title="Wyczyść filtr"
            >✕</button>
          )}
        </div>
      )}

      {userSubs.length === 0 ? (
        <p className="user-collection-empty">{t("userCollection.empty")}</p>
      ) : filtered.length === 0 ? (
        <p className="user-collection-empty">Brak wyników dla „{filterQuery}"</p>
      ) : (
        <div className="account-sub-list">
          {filtered.map((entry) => {
            const co  = companies.find((c) => c.id === entry.companyId);
            const sub = co ? (co.subscriptions || []).find((s) => s.id === entry.subscriptionId) : null;
            const logoSrc = sub?.logoUrl || co?.logoUrl;
            const renewal = nextRenewal(entry, sub);
            const renewalStr = renewal
              ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(renewal)
              : null;

            return (
              <div key={entry.id} className="account-sub-row" onClick={() => handleClick(entry)}>
                <div className="account-sub-logo">
                  {logoSrc
                    ? <img src={logoSrc} alt={co?.name} />
                    : <span className="account-sub-logo-placeholder">{co?.name?.[0] ?? "?"}</span>
                  }
                </div>
                <div className="account-sub-info">
                  <span className="account-sub-company-name">{co?.name ?? entry.companyId}</span>
                  <span className="account-sub-name">{sub?.name ?? entry.subscriptionId}</span>
                  {renewalStr && <span className="account-sub-renewal">🔄 {renewalStr}</span>}
                </div>
                <button
                  className="account-sub-remove"
                  onClick={(e) => { e.stopPropagation(); removeSub(entry.id); }}
                  title={t("userCollection.remove")}
                >✕</button>
                <span className="account-sub-arrow">›</span>
              </div>
            );
          })}
        </div>
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

  const currentAvatarSrc = user?.avatarUrl ? `${API.BASE}${user.avatarUrl}` : null;
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
export default function AccountPage({ onBack, initialSection = "calendar", onSectionChange, onBookClick }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [activeSection, setActiveSection]       = useState(initialSection);
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false);

  const handleNavClick = (key) => {
    setActiveSection(key);
    setMobileSectionOpen(true);
    onSectionChange?.(key);
  };

  const renderSection = () => {
    switch (activeSection) {
      case "calendar":      return <CalendarSection />;
      case "collection":    return <BookListSection flag="OWNED"      onBookClick={onBookClick} />;
      case "iso":           return <BookListSection flag="ISO"        onBookClick={onBookClick} />;
      case "interested":    return <BookListSection flag="INTERESTED" onBookClick={onBookClick} />;
      case "subscriptions": return <SubscriptionsSection />;
      case "settings":      return <SettingsSection />;
      default:              return null;
    }
  };

  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  const sidebarAvatarSrc = user?.avatarUrl ? `${API.BASE}${user.avatarUrl}` : null;

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
