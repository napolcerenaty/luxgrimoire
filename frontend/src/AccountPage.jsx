import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import { API } from "./api";
import SpendingStatsPage from "./SpendingStatsPage";
import FavoritesPage from "./FavoritesPage";
import "./AccountPage.css";
import "./UserPages.css";

// Resolve relative upload URLs to absolute backend URLs
function resolveLogoUrl(url) {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API.BASE}${url}`;
}

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



// Stable hue derived from a string so each company gets a consistent colour
function strHue(str) {
  let h = 0;
  for (let i = 0; i < (str?.length ?? 0); i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return h % 360;
}

// Return renewal day within a given month if this month is a renewal month, else null
function renewalDayInMonth(entry, sub, year, month) {
  const renewalDay = entry?.renewalDay ?? sub?.renewalDay;
  if (!renewalDay) return null;
  const type = sub?.type || "MONTHLY";
  if (type === "MONTHLY") return renewalDay;
  const step = type === "BI_MONTHLY" ? 2 : 3;
  const startMonthIdx = ((entry?.startingMonth ?? 1) - 1) % step;
  if (((month - startMonthIdx) % step + step) % step === 0) return renewalDay;
  return null;
}

// ─── NAV ITEMS ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: "calendar",      icon: "📅", labelKey: "account.navCalendar"      },
  { key: "collection",    icon: "📚", labelKey: "account.navCollection"    },
  { key: "iso",           icon: "🔍", labelKey: "account.navIso"           },
  { key: "interested",    icon: "⭐", labelKey: "account.navInterested"    },
  { key: "sold",          icon: "🏷️",  labelKey: "account.navSold"          },
  { key: "subscriptions", icon: "📮", labelKey: "account.navSubscriptions" },
  { key: "spending",     icon: "💰", labelKey: "account.navSpending"     },
  { key: "favorites",   icon: "❤️",  labelKey: "account.navFavorites"    },
  { key: "settings",    icon: "⚙️",  labelKey: "account.navSettings"      },
];

// ─── CALENDAR SECTION ────────────────────────────────────────────────────────
export function CalendarSection() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const locale = LANG_LOCALE[lang] ?? "en-GB";
  const today  = new Date();

  const [viewDate,     setViewDate]     = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedSale, setSelectedSale] = useState(null); // mobile click popup
  const [calTip,       setCalTip]       = useState(null); // desktop hover tip
  const [calSubs,      setCalSubs]      = useState([]);
  const [calSales,     setCalSales]     = useState([]);

  // true = real pointer device that supports hover (desktop), false = touch/mobile
  const isHoverDevice = useRef(
    typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches
  ).current;

  const tipCloseTimer = useRef(null);
  const openTip = (e, data) => {
    clearTimeout(tipCloseTimer.current);
    const rect = e.currentTarget.getBoundingClientRect();
    setCalTip({ ...data, rect });
  };
  const scheduledCloseTip = () => {
    tipCloseTimer.current = setTimeout(() => setCalTip(null), 150);
  };
  const cancelCloseTip = () => clearTimeout(tipCloseTimer.current);

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();

  useEffect(() => {
    if (!user) { setCalSubs([]); setCalSales([]); return; }
    Promise.all([
      fetch(API.USER_SUBSCRIPTIONS, { credentials: "include" }).then(r => r.ok ? r.json() : []),
      fetch(API.COMPANIES,          { credentials: "include" }).then(r => r.ok ? r.json() : []),
      fetch(API.USER_SALES_UPCOMING,{ credentials: "include" }).then(r => r.ok ? r.json() : []),
    ]).then(([entries, companies, sales]) => {
      const resolved = entries
        .filter(e => e.active !== false)
        .map(entry => {
          const company = companies.find(c => c.id === entry.companyId) ?? null;
          const sub     = company ? (company.subscriptions ?? []).find(s => s.id === entry.subscriptionId) ?? null : null;
          return { entry, company, sub };
        })
        .filter(({ entry, sub }) => (entry.renewalDay ?? sub?.renewalDay) != null);
      setCalSubs(resolved);

      const interestedSales = sales
        .filter(s => s.userStatus === "INTERESTED")
        .map(s => ({
          id:        s.id,
          saleDate:  s.generalSaleDate,
          title:     s.title,
          box:       s.companyName,
          time:      s.saleTimezone ? `${s.generalSaleDate} (${s.saleTimezone})` : s.generalSaleDate,
          hue:       `${strHue(s.companyId ?? s.companyName)},60%,55%`,
          userStatus: s.userStatus,
        }));
      setCalSales(interestedSales);
    }).catch(() => {});
  }, [user]);

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

  const renewalsForDay = (day) =>
    calSubs
      .filter(({ entry, sub }) => renewalDayInMonth(entry, sub, year, month) === day)
      .map(({ entry, company, sub }) => {
        const hue = strHue(entry.companyId);
        return {
          id: entry.id,
          label: sub?.name ?? company?.name ?? entry.subscriptionId,
          hue: `${hue},60%,55%`,
        };
      });
  const salesForDay    = (day) => calSales.filter(s => {
    if (!s.saleDate) return false;
    const [sy, sm, sd] = s.saleDate.split("-").map(Number);
    return sy === year && sm === month + 1 && sd === day;
  });
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
                onMouseEnter={isHoverDevice ? (e) => openTip(e, { type: "renewal", label: r.label, hue: r.hue }) : undefined}
                onMouseLeave={isHoverDevice ? scheduledCloseTip : undefined}
                onClick={!isHoverDevice ? (e) => openTip(e, { type: "renewal", label: r.label, hue: r.hue }) : undefined}
              >
                🔄 {r.label}
              </div>
            ))}

            {cell.current && salesForDay(cell.day).map(s => (
              <button
                key={s.id}
                className="account-cal-sale"
                style={{ "--ev": `hsl(${s.hue})`, "--ev-bg": `hsla(${s.hue},.18)` }}
                onMouseEnter={isHoverDevice ? (e) => openTip(e, { type: "sale", sale: s }) : undefined}
                onMouseLeave={isHoverDevice ? scheduledCloseTip : undefined}
                onClick={!isHoverDevice ? () => setSelectedSale(s) : undefined}
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

      {/* ── Hover / tap tooltip ── */}
      {calTip && (() => {
        const top  = Math.min(calTip.rect.bottom + 6, window.innerHeight - 160);
        const left = Math.max(8, Math.min(calTip.rect.left, window.innerWidth - 220));
        return (
          <>
            {!isHoverDevice && (
              <div className="account-cal-overlay" style={{ background: "transparent" }}
                onClick={() => setCalTip(null)} />
            )}
            <div
              className="account-cal-tip-panel"
              style={{ top, left }}
              onMouseEnter={isHoverDevice ? cancelCloseTip : undefined}
              onMouseLeave={isHoverDevice ? scheduledCloseTip : undefined}
            >
              {calTip.type === "renewal" && (
                <>
                  <div className="account-cal-tip-type">🔄 Renewal</div>
                  <div className="account-cal-tip-label"
                    style={{ color: `hsl(${calTip.hue})` }}>{calTip.label}</div>
                </>
              )}
              {calTip.type === "sale" && (
                <>
                  <p  className="account-cal-popup-box"   style={{ margin: "0 0 0.2rem" }}>{calTip.sale.box}</p>
                  <h4 className="account-cal-popup-title" style={{ margin: "0 0 0.15rem", fontSize: "1rem" }}>{calTip.sale.title}</h4>
                  <p  className="account-cal-popup-author" style={{ margin: "0 0 0.25rem" }}>{calTip.sale.author}</p>
                  {calTip.sale.edition && <p className="account-cal-popup-edition" style={{ margin: "0 0 0.35rem" }}>{calTip.sale.edition}</p>}
                  <p  className="account-cal-popup-time"  style={{ margin: 0 }}>🕐 {calTip.sale.time}</p>
                </>
              )}
            </div>
          </>
        );
      })()}

      {/* ── Sale detail popup (mobile / click) ── */}
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

// ─── SELL BOOK MODAL ─────────────────────────────────────────────────────────
const COMMON_VENUES = ["eBay", "Vinted", "Depop", "Facebook Marketplace", "Direct"];

function SellBookModal({ entry, onClose, onSold, t }) {
  const [saleDate,     setSaleDate]     = useState(new Date().toISOString().slice(0, 10));
  const [salePrice,    setSalePrice]    = useState("");
  const [saleCurrency, setSaleCurrency] = useState(entry?.currency || "GBP");
  const [saleVenue,    setSaleVenue]    = useState("");
  const [saleNotes,    setSaleNotes]    = useState("");
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!salePrice || isNaN(parseFloat(salePrice))) { setError(t("sale.errorPrice")); return; }
    setSaving(true);
    try {
      const res = await fetch(API.USER_BOOK(entry.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ownershipStatus: "SOLD",
          saleDate,
          salePrice: parseFloat(salePrice),
          saleCurrency,
          saleVenue,
          saleNotes,
        }),
      });
      if (!res.ok) throw new Error();
      onSold(entry.id);
      onClose();
    } catch {
      setError(t("sale.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{t("sale.title")}</h2>
        {entry?.title && <p className="modal-subtitle">{entry.title}</p>}
        <form className="sale-form" onSubmit={handleSubmit}>
          <div className="sale-form-row">
            <label>{t("sale.date")}</label>
            <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} required />
          </div>
          <div className="sale-form-row sale-price-row">
            <label>{t("sale.price")}</label>
            <input type="number" step="0.01" min="0" value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)} required placeholder="0.00" />
            <select value={saleCurrency} onChange={(e) => setSaleCurrency(e.target.value)}>
              {["GBP","USD","EUR","PLN","CZK","SEK","DKK","AUD","CAD"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="sale-form-row">
            <label>{t("sale.venue")}</label>
            <input list="venues-list" value={saleVenue} onChange={(e) => setSaleVenue(e.target.value)}
              placeholder={t("sale.venuePlaceholder")} />
            <datalist id="venues-list">
              {COMMON_VENUES.map((v) => <option key={v} value={v} />)}
            </datalist>
          </div>
          <div className="sale-form-row">
            <label>{t("sale.notes")}</label>
            <textarea value={saleNotes} onChange={(e) => setSaleNotes(e.target.value)}
              rows={2} placeholder={t("sale.notesPlaceholder")} />
          </div>
          {error && <p className="sale-form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onClose}>{t("common.cancel")}</button>
            <button type="submit" className="modal-btn-confirm" disabled={saving}>
              {saving ? "…" : t("sale.confirm")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── SOLD BOOKS SECTION ───────────────────────────────────────────────────────
function SoldBooksSection() {
  const { user } = useAuth();
  const { t }    = useI18n();
  const [entries,     setEntries]     = useState([]);
  const [bookDetails, setBookDetails] = useState({});
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch(`${API.USER_BOOKS}?flag=SOLD`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { setEntries(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    const ids = [...new Set(entries.map((e) => e.editionId).filter(Boolean))];
    ids.forEach((id) => {
      if (bookDetails[id]) return;
      fetch(API.BOOK_BY_EDITION(id), { credentials: "include" })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) setBookDetails((prev) => ({ ...prev, [id]: d })); })
        .catch(() => {});
    });
  }, [entries]);

  const enriched = entries.map((entry) => {
    const bd = bookDetails[entry.editionId];
    const ed = bd ? (bd.editions || []).find((e) => e.id === entry.editionId) : null;
    return {
      ...entry,
      title:       bd?.title ?? "",
      author:      bd?.author ?? "",
      editionName: ed?.editionName ?? "",
      imageUrl:    ed?.imageUrls?.[0] ?? null,
    };
  });

  const fmt = (v, cur) => v != null ? `${Number(v).toFixed(2)} ${cur || ""}` : "—";
  const totalCost = (e) => {
    const base = parseFloat(e.allocatedPrice || 0);
    const taxes = parseFloat(e.proportionalTaxes || 0);
    const ship  = parseFloat(e.proportionalShipping || 0);
    return base + taxes + ship;
  };
  const profit = (e) => e.salePrice != null && e.allocatedPrice != null
    ? (parseFloat(e.salePrice) - totalCost(e)).toFixed(2)
    : null;

  return (
    <section className="account-section">
      <h2 className="section-title account-section-title">{t("account.navSold")}</h2>
      {loading ? (
        <p className="user-collection-empty">{t("booklist.loading")}</p>
      ) : enriched.length === 0 ? (
        <p className="user-collection-empty">{t("sale.noBooksYet")}</p>
      ) : (
        <div className="sold-books-list">
          {enriched.map((e) => {
            const p = profit(e);
            return (
              <div key={e.id} className="sold-book-row">
                <div className="sold-book-thumb">
                  {e.imageUrl
                    ? <img src={e.imageUrl} alt={e.title} />
                    : <div className="sold-book-thumb-placeholder">{e.title?.[0] ?? "?"}</div>}
                </div>
                <div className="sold-book-info">
                  <span className="sold-book-title">{e.title || "—"}</span>
                  {e.editionName && <span className="sold-book-edition">{e.editionName}</span>}
                  <span className="sold-book-meta">
                    {e.saleDate && <span>{e.saleDate}</span>}
                    {e.saleVenue && <span className="sold-book-venue">{e.saleVenue}</span>}
                  </span>
                </div>
                <div className="sold-book-prices">
                  <span className="sold-bought">{t("sale.boughtFor")} {fmt(totalCost(e), e.currency)}</span>
                  <span className="sold-sold">{t("sale.soldFor")} {fmt(e.salePrice, e.saleCurrency)}</span>
                  {p != null && (
                    <span className={`sold-profit ${parseFloat(p) >= 0 ? "positive" : "negative"}`}>
                      {parseFloat(p) >= 0 ? "+" : ""}{p} {e.saleCurrency || ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── BOOK CARD (grid) ────────────────────────────────────────────────────────
function StatusBadge({ status, type, t }) {
  if (!status) return null;
  const key = type === 'ownership' ? `collection.ownership.${status}` : `collection.readStatus.${status}`;
  const label = t(key) || status;
  const cls = `book-status-badge book-status-${type} book-status-${status.toLowerCase().replace(/_/g, '-')}`;
  return <span className={cls}>{label}</span>;
}

function BookCard({ entry, onRemove, onBookClick, onSell, t }) {
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
        <div className="book-status-badges">
          <StatusBadge status={entry.ownershipStatus} type="ownership" t={t} />
          <StatusBadge status={entry.readingStatus}   type="reading"   t={t} />
        </div>
        {entry.allocatedPrice != null && (
          <p className="account-book-card-price">{entry.allocatedPrice} {entry.currency || ""}</p>
        )}
      </div>
      <div className="account-book-card-actions">
        {onSell && entry.ownershipStatus === "OWNED" && (
          <button className="account-book-card-sell" onClick={(e) => { e.stopPropagation(); onSell(entry); }} title={t("sale.sellBtn")}>🏷️</button>
        )}
        <button className="account-book-card-remove" onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }} title={t("booklist.remove")}>✕</button>
      </div>
    </div>
  );
}

// ─── BOOK ROW (list) ─────────────────────────────────────────────────────────
function BookRow({ entry, onRemove, onBookClick, onSell, t }) {
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
        <div className="book-status-badges">
          <StatusBadge status={entry.ownershipStatus} type="ownership" t={t} />
          <StatusBadge status={entry.readingStatus}   type="reading"   t={t} />
          {entry.allocatedPrice != null && (
            <span className="account-book-row-price">{entry.allocatedPrice} {entry.currency || ""}</span>
          )}
        </div>
      </div>
      <div className="account-book-row-actions">
        {onSell && entry.ownershipStatus === "OWNED" && (
          <button className="account-book-row-sell" onClick={(e) => { e.stopPropagation(); onSell(entry); }} title={t("sale.sellBtn")}>🏷️</button>
        )}
        <button className="account-book-row-remove" onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }} title={t("booklist.remove")}>✕</button>
      </div>
    </div>
  );
}

// ─── BOOK LIST SECTION (shared for collection / ISO / interested) ─────────────
export function BookListSection({ flag, onBookClick }) {
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

  const [sellEntry, setSellEntry] = useState(null);

  const handleSold = (entryId) => {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  };

  const sectionTitle = flag === "OWNED"       ? t("account.navCollection")
                     : flag === "ISO"         ? t("account.navIso")
                     :                          t("account.navInterested");

  const showSell = flag === "OWNED";

  return (
    <section className="account-section">
      {sellEntry && (
        <SellBookModal
          entry={sellEntry}
          onClose={() => setSellEntry(null)}
          onSold={handleSold}
          t={t}
        />
      )}
      <div className="account-booklist-header">
        <h2 className="section-title account-section-title">{sectionTitle}</h2>
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
          {filtered.map((e) => <BookCard key={e.id} entry={e} onRemove={removeBook} onBookClick={onBookClick} onSell={showSell ? setSellEntry : null} t={t} />)}
        </div>
      ) : (
        <div className="account-booklist-list">
          {filtered.map((e) => <BookRow key={e.id} entry={e} onRemove={removeBook} onBookClick={onBookClick} onSell={showSell ? setSellEntry : null} t={t} />)}
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

// ─── SUB TAGS EDITOR ─────────────────────────────────────────────────────────
function SubTagsEditor({ entryId }) {
  const [tags, setTags] = useState([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (!entryId) return;
    fetch(API.USER_SUB_TAGS(entryId), { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setTags)
      .catch(() => {});
  }, [entryId]);

  const addTag = async () => {
    const tag = input.trim();
    if (!tag) return;
    const res = await fetch(API.USER_SUB_TAGS(entryId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tag }),
    });
    if (res.ok) {
      const t = await res.json();
      setTags((prev) => [...prev, t]);
      setInput("");
    }
  };

  const removeTag = async (tagId) => {
    const res = await fetch(API.USER_SUB_TAG(entryId, tagId), {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) setTags((prev) => prev.filter((t) => t.id !== tagId));
  };

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h4 style={{ margin: "0 0 0.5rem 0" }}>Tags</h4>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
        {tags.map((t) => (
          <span key={t.id} className="edition-tag" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            {t.tag}
            <button
              onClick={() => removeTag(t.id)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", lineHeight: 1, padding: 0, fontSize: "0.85rem" }}
            >✕</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          className="admin-form-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTag()}
          placeholder="Add tag…"
          style={{ maxWidth: "200px" }}
        />
        <button className="page-btn primary" onClick={addTag}>Add</button>
      </div>
    </div>
  );
}

// ─── SUBSCRIPTION DETAIL ─────────────────────────────────────────────────────
function SubDetailView({ entry: initialEntry, company, sub, onBack }) {
  const { t, lang } = useI18n();
  const locale = LANG_LOCALE[lang] ?? "en-GB";
  const [entry, setEntry] = useState(initialEntry);
  const [costHistory, setCostHistory] = useState([]);
  const [editingCosts, setEditingCosts] = useState(false);
  const now = new Date();
  const [costForm, setCostForm] = useState({
    effectiveFromMonth: now.getMonth() + 1,
    effectiveFromYear: now.getFullYear(),
    shippingCost: "",
    taxesAndFees: "",
  });

  useEffect(() => {
    fetch(API.USER_SUBSCRIPTION_COST_HISTORY(entry.id), { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setCostHistory)
      .catch(() => {});
  }, [entry.id]);

  const renewal = nextRenewal(entry, sub);
  const renewalStr = renewal
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(renewal)
    : null;

  const [savingStatus,   setSavingStatus]   = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelDate,     setCancelDate]     = useState(entry.cancellationDate ?? "");

  const handleSetStatus = async (active, date) => {
    setSavingStatus(true);
    const res = await fetch(API.USER_SUBSCRIPTION_STATUS(entry.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ active, cancellationDate: active ? null : (date || null) }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEntry(updated);
      setShowCancelForm(false);
    }
    setSavingStatus(false);
  };

  const logoSrc = resolveLogoUrl(sub?.logoUrl || company?.logoUrl);

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

      {/* Status: active / cancelled */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "0.35rem",
          padding: "0.25rem 0.7rem", borderRadius: "999px", fontSize: "0.82rem", fontWeight: 600,
          background: entry.active !== false ? "rgba(40,190,100,0.18)" : "rgba(220,60,60,0.18)",
          color: entry.active !== false ? "#3dba70" : "#e05555",
          border: `1px solid ${entry.active !== false ? "rgba(40,190,100,0.4)" : "rgba(220,60,60,0.4)"}`,
        }}>
          {entry.active !== false ? "✓ Aktywna" : "✕ Anulowana"}
        </span>
        {entry.active === false && entry.cancellationDate && (
          <span style={{ fontSize: "0.82rem", color: "var(--text-dim)" }}>od {entry.cancellationDate}</span>
        )}
        {entry.active !== false ? (
          <button className="page-btn" style={{ fontSize: "0.82rem" }}
            onClick={() => setShowCancelForm(v => !v)}>
            Anuluj subskrypcję
          </button>
        ) : (
          <button className="page-btn" style={{ fontSize: "0.82rem" }}
            disabled={savingStatus} onClick={() => handleSetStatus(true, null)}>
            {savingStatus ? "…" : "Przywróć"}
          </button>
        )}
      </div>
      {showCancelForm && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
          <label style={{ fontSize: "0.88rem" }}>
            Data anulowania (opcjonalnie)
            <input type="date" className="admin-form-input" style={{ display: "block", marginTop: "0.2rem" }}
              value={cancelDate} onChange={e => setCancelDate(e.target.value)} />
          </label>
          <button className="page-btn primary" style={{ alignSelf: "flex-end" }}
            disabled={savingStatus} onClick={() => handleSetStatus(false, cancelDate)}>
            {savingStatus ? "…" : "Potwierdź anulowanie"}
          </button>
          <button className="page-btn" style={{ alignSelf: "flex-end" }}
            onClick={() => setShowCancelForm(false)}>Anuluj</button>
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
              {(t("bookDetail.months") || []).map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
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

      {/* Tags */}
      <SubTagsEditor entryId={entry.id} />

      {company?.description && (
        <p className="account-sub-detail-desc">{company.description}</p>
      )}
    </section>
  );
}

// ─── SUBSCRIPTIONS SECTION ────────────────────────────────────────────────────
export function SubscriptionsSection() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const locale = LANG_LOCALE[lang] ?? "en-GB";
  const [userSubs,    setUserSubs]    = useState([]);
  const [companies,   setCompanies]   = useState([]);
  const [selected,    setSelected]    = useState(null); // { entry, company, sub }
  const [filterQuery, setFilterQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "active" | "cancelled"

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
  const filtered = userSubs.filter((entry) => {
    const co  = companies.find((c) => c.id === entry.companyId);
    const sub = co ? (co.subscriptions || []).find((s) => s.id === entry.subscriptionId) : null;
    if (statusFilter === "active"    && entry.active === false) return false;
    if (statusFilter === "cancelled" && entry.active !== false) return false;
    if (!q) return true;
    return (
      (sub?.name  ?? "").toLowerCase().includes(q) ||
      (co?.name   ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <section className="account-section">
      <h2 className="section-title account-section-title">{t("account.navSubscriptions")}</h2>

      {userSubs.length > 0 && (
        <div className="account-booklist-filters" style={{ marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
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
          <div style={{ display: "flex", gap: "0.35rem" }}>
            {[["all","Wszystkie"],["active","Aktywne"],["cancelled","Anulowane"]].map(([val, label]) => (
              <button key={val} className="page-btn" style={{ fontSize: "0.8rem", padding: "0.2rem 0.6rem",
                background: statusFilter === val ? "var(--accent)" : undefined,
                color: statusFilter === val ? "#fff" : undefined,
              }} onClick={() => setStatusFilter(val)}>{label}</button>
            ))}
          </div>
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
            const logoSrc = resolveLogoUrl(sub?.logoUrl || co?.logoUrl);
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
                  {renewalStr && entry.active !== false && <span className="account-sub-renewal">🔄 {renewalStr}</span>}
                  {entry.active === false && (
                    <span style={{ fontSize: "0.78rem", color: "#e05555", fontStyle: "italic" }}>
                      Anulowana{entry.cancellationDate ? ` · od ${entry.cancellationDate}` : ""}
                    </span>
                  )}
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
export function SettingsSection() {
  const { user, updateProfile, uploadAvatar, updatePrivacy, updateSocial } = useAuth();
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

  // ── Social / bio ──────────────────────────────────────────────────────────
  const [bioPublic,     setBioPublic]     = useState(user?.bioPublic     ?? "");
  const [goodreadsUrl,  setGoodreadsUrl]  = useState(user?.goodreadsUrl  ?? "");
  const [storygraphUrl, setStorygraphUrl] = useState(user?.storygraphUrl ?? "");
  const [instagramUrl,  setInstagramUrl]  = useState(user?.instagramUrl  ?? "");
  const [twitterUrl,    setTwitterUrl]    = useState(user?.twitterUrl    ?? "");
  const [socialSaving,  setSocialSaving]  = useState(false);
  const [socialSaved,   setSocialSaved]   = useState(false);
  const [socialErr,     setSocialErr]     = useState("");

  const handleSocialSave = async () => {
    setSocialSaving(true); setSocialErr("");
    try {
      await updateSocial({ bioPublic, goodreadsUrl, storygraphUrl, instagramUrl, twitterUrl });
      setSocialSaved(true); setTimeout(() => setSocialSaved(false), 3000);
    } catch (err) { setSocialErr(err.message); }
    finally { setSocialSaving(false); }
  };

  // ── Granular privacy ──────────────────────────────────────────────────────
  const [profilePrivacy,       setProfilePrivacy]       = useState(user?.profilePrivacy       ?? "PUBLIC");
  const [collectionPrivacy,    setCollectionPrivacy]    = useState(user?.collectionPrivacy    ?? "FRIENDS");
  const [isoPrivacy,           setIsoPrivacy]           = useState(user?.isoPrivacy           ?? "FRIENDS");
  const [interestedPrivacy,    setInterestedPrivacy]    = useState(user?.interestedPrivacy    ?? "FOLLOWERS");
  const [subscriptionsPrivacy, setSubscriptionsPrivacy] = useState(user?.subscriptionsPrivacy ?? "PRIVATE");
  const [favoritesPrivacy,     setFavoritesPrivacy]     = useState(user?.favoritesPrivacy     ?? "PUBLIC");
  const [messagingPrivate,     setMessagingPrivate]     = useState(user?.messagingPrivate     ?? false);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacySaved,  setPrivacySaved]  = useState(false);

  const handlePrivacySave = async () => {
    setPrivacySaving(true);
    try {
      await updatePrivacy({
        profilePrivacy, collectionPrivacy, isoPrivacy,
        interestedPrivacy, subscriptionsPrivacy, favoritesPrivacy,
        messagingPrivate,
      });
      setPrivacySaved(true); setTimeout(() => setPrivacySaved(false), 2500);
    } finally {
      setPrivacySaving(false);
    }
  };

  const PRIVACY_LEVELS = ["PUBLIC", "FOLLOWERS", "FRIENDS", "PRIVATE"];
  const privacyRows = [
    { key: "profilePrivacy",       icon: "👤", labelKey: "privacy.sectionProfile",       val: profilePrivacy,       set: setProfilePrivacy       },
    { key: "collectionPrivacy",    icon: "📚", labelKey: "privacy.sectionCollection",    val: collectionPrivacy,    set: setCollectionPrivacy    },
    { key: "isoPrivacy",           icon: "🔍", labelKey: "privacy.sectionIso",           val: isoPrivacy,           set: setIsoPrivacy           },
    { key: "interestedPrivacy",    icon: "⭐", labelKey: "privacy.sectionInterested",    val: interestedPrivacy,    set: setInterestedPrivacy    },
    { key: "subscriptionsPrivacy", icon: "📮", labelKey: "privacy.sectionSubscriptions", val: subscriptionsPrivacy, set: setSubscriptionsPrivacy },
    { key: "favoritesPrivacy",     icon: "❤️", labelKey: "privacy.sectionFavorites",    val: favoritesPrivacy,     set: setFavoritesPrivacy     },
  ];

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
      <h2 className="section-title account-section-title">{t("settings.title")}</h2>

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

      <div className="account-section-divider" />

      {/* ── Public profile / social links ── */}
      <div className="user-page-form">
        <h3 className="settings-section-heading">{t("settings.publicProfileTitle")}</h3>
        <label>
          {t("settings.bio")}
          <textarea
            rows={3}
            value={bioPublic}
            onChange={e => setBioPublic(e.target.value)}
            placeholder={t("settings.bioPlaceholder")}
            style={{ resize: "vertical" }}
          />
        </label>
        <label>{t("publicProfile.goodreads")}
          <input value={goodreadsUrl}  onChange={e => setGoodreadsUrl(e.target.value)}  placeholder="https://goodreads.com/user/show/..." />
        </label>
        <label>{t("publicProfile.storygraph")}
          <input value={storygraphUrl} onChange={e => setStorygraphUrl(e.target.value)} placeholder="https://app.thestorygraph.com/profile/..." />
        </label>
        <label>{t("publicProfile.instagram")}
          <input value={instagramUrl}  onChange={e => setInstagramUrl(e.target.value)}  placeholder="https://instagram.com/..." />
        </label>
        <label>{t("publicProfile.twitter")}
          <input value={twitterUrl}    onChange={e => setTwitterUrl(e.target.value)}    placeholder="https://x.com/..." />
        </label>
        {socialErr  && <p className="page-error">{socialErr}</p>}
        {socialSaved && <p className="page-success">{t("settings.saved")}</p>}
        <button className="page-btn primary" onClick={handleSocialSave} disabled={socialSaving}>
          {socialSaving ? t("settings.saving") : t("settings.saveBtn")}
        </button>
      </div>

      <div className="account-section-divider" />

      {/* ── Granular privacy ── */}
      <div className="user-page-form">
        <h3 className="settings-section-heading">{t("settings.privacyTitle")}</h3>
        <p className="field-hint" style={{ marginBottom: "1rem" }}>{t("privacy.hint")}</p>

        <div className="privacy-rows">
          {privacyRows.map(({ key, icon, labelKey, val, set }) => (
            <div key={key} className="privacy-row">
              <div className="privacy-row-label">
                <span className="privacy-row-icon">{icon}</span>
                <span>{t(labelKey)}</span>
              </div>
              <select
                className="privacy-select"
                value={val}
                onChange={e => set(e.target.value)}
                disabled={privacySaving}
              >
                {PRIVACY_LEVELS.map(lv => (
                  <option key={lv} value={lv}>{t(`privacy.level${lv.charAt(0)+lv.slice(1).toLowerCase()}`)}</option>
                ))}
              </select>
              <p className="privacy-row-desc">{t(`privacy.desc${val.charAt(0)+val.slice(1).toLowerCase()}`)}</p>
            </div>
          ))}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", marginTop: "1rem" }}>
          <input
            type="checkbox"
            checked={messagingPrivate}
            onChange={e => setMessagingPrivate(e.target.checked)}
            disabled={privacySaving}
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
          <span>{t("settings.messagingPrivate")}</span>
        </label>
        <span className="field-hint" style={{ marginTop: "0.25rem" }}>{t("settings.messagingPrivateHint")}</span>

        {privacySaved && <p className="page-success" style={{ marginTop: "0.5rem" }}>{t("settings.saved")}</p>}
        <button className="page-btn primary" onClick={handlePrivacySave} disabled={privacySaving} style={{ marginTop: "1rem" }}>
          {privacySaving ? t("settings.saving") : t("settings.saveBtn")}
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
      case "sold":          return <SoldBooksSection />;
      case "subscriptions": return <SubscriptionsSection />;
      case "spending":      return <SpendingStatsPage />;
      case "favorites":     return <FavoritesPage />;
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

