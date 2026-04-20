import { useState, useEffect } from "react";
import { useI18n } from "./i18n";
import { useAuth } from "./AuthContext";
import { API } from "./api";
import "./SubscriptionDetailPage.css";

const resolveLogoUrl = (url) => {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API.BASE}${url}`;
};

const LOCALE_MAP = { pl: "pl-PL", en: "en-GB", de: "de-DE", fr: "fr-FR", es: "es-ES" };

function nextRenewal(entry, sub) {
  const renewalDay = entry?.renewalDay ?? sub?.renewalDay;
  if (!renewalDay) return null;
  const type = sub?.type || "MONTHLY";
  const startingMonth = entry?.startingMonth ?? 1;
  const now = new Date();
  if (type === "MONTHLY") {
    const candidate = new Date(now.getFullYear(), now.getMonth(), renewalDay);
    if (candidate > now) return candidate;
    return new Date(now.getFullYear(), now.getMonth() + 1, renewalDay);
  }
  const step = type === "BI_MONTHLY" ? 2 : 3;
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

export default function SubscriptionDetailPage({ companyId, subscriptionId, onBack, onCompanyClick, onBookClick }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();

  const [company, setCompany] = useState(null);
  const [sub, setSub] = useState(null);
  const [userEntry, setUserEntry] = useState(null);
  const [bookDataMap, setBookDataMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredMonth, setHoveredMonth] = useState(null); // kept for potential future use
  const today = new Date().toISOString().slice(0, 10);
  const [subscribeModal, setSubscribeModal] = useState(false);
  const [subForm, setSubForm] = useState({ startDate: today, shippingCost: "", taxesAndFees: "", startingMonth: "", renewalDay: "", prepayOptionId: null });
  const [subAdded, setSubAdded] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    fetch(API.COMPANY(companyId), { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        setCompany(data);
        const found = (data.subscriptions || []).find(
          (s) => (typeof s === "object" ? s.id : null) === subscriptionId
        );
        // If this subscription is a variant, inject the parent's months
        if (found && found.parentSubscriptionId) {
          const parent = (data.subscriptions || []).find(s => s.id === found.parentSubscriptionId);
          if (parent) {
            found._resolvedMonths = parent.months;
            found._parentName = parent.name;
          }
        }
        setSub(found || null);
        setLoading(false);
      })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [companyId, subscriptionId]);

  useEffect(() => {
    if (!user) { setUserEntry(null); return; }
    fetch(API.USER_SUBSCRIPTIONS, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((entries) => {
        const found = entries.find(
          (e) => e.subscriptionId === subscriptionId && e.companyId === companyId
        );
        setUserEntry(found || null);
      })
      .catch(() => setUserEntry(null));
  }, [user, subscriptionId, companyId]);

  useEffect(() => {
    const effectiveMonths = sub?._resolvedMonths ?? sub?.months;
    if (!effectiveMonths) return;
    // Collect all unique bookIds from both legacy bookId and new books array
    const bookIdSet = new Set();
    effectiveMonths.forEach((m) => {
      if (m.bookId) bookIdSet.add(m.bookId);
      if (Array.isArray(m.books)) m.books.forEach(b => { if (b.bookId) bookIdSet.add(b.bookId); });
    });
    const bookIds = [...bookIdSet];
    if (bookIds.length === 0) return;
    Promise.all(
      bookIds.map((id) =>
        fetch(API.BOOK(id), { credentials: "include" })
          .then((r) => r.ok ? r.json() : null)
          .then((data) => data ? [id, data] : null)
          .catch(() => null)
      )
    ).then((results) => {
      const map = {};
      results.forEach((r) => { if (r) map[r[0]] = r[1]; });
      setBookDataMap(map);
    });
  }, [sub]);

  const doAddSub = async (formData) => {
    if (!sub || !company) return;
    let billingPeriod = null;
    if (formData.prepayOptionId && sub.prepayOptions) {
      const opt = sub.prepayOptions.find(o => o.id === formData.prepayOptionId);
      if (opt) {
        const [year, month] = (formData.startDate || today).split("-").map(Number);
        billingPeriod = { billedAt: formData.startDate || today, amountPaid: opt.price, monthsCovered: opt.months, coveredFromMonth: month, coveredFromYear: year, prepayOptionId: opt.id };
      }
    } else {
      const [year, month] = (formData.startDate || today).split("-").map(Number);
      if (sub.basePrice) billingPeriod = { billedAt: formData.startDate || today, amountPaid: sub.basePrice, monthsCovered: 1, coveredFromMonth: month, coveredFromYear: year };
    }
    const body = {
      companyId: company.id, subscriptionId: sub.id,
      startDate: formData.startDate || null,
      shippingCost: formData.shippingCost !== "" ? parseFloat(formData.shippingCost) : null,
      taxesAndFees: formData.taxesAndFees !== "" ? parseFloat(formData.taxesAndFees) : null,
      startingMonth: formData.startingMonth !== "" ? parseInt(formData.startingMonth) : null,
      renewalDay: formData.renewalDay !== "" ? parseInt(formData.renewalDay) : null,
      ...(billingPeriod ? { billingPeriod } : {}),
    };
    const res = await fetch("http://localhost:8080/api/user/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
    if (res.ok) {
      const data = await res.json();
      setUserEntry(data.entry);
      setSubAdded(true);
      setTimeout(() => setSubAdded(false), 3000);
    }
    setSubscribeModal(false);
  };

  if (loading) return (
    <div className="sub-detail-page">
      <div className="status-container"><div className="spinner" /></div>
    </div>
  );
  if (error) return (
    <div className="sub-detail-page">
      <button className="sub-detail-back-btn" onClick={onBack}>← {t("back")}</button>
      <p className="sub-detail-error">{error}</p>
    </div>
  );
  if (!company || !sub) return (
    <div className="sub-detail-page">
      <button className="sub-detail-back-btn" onClick={onBack}>← {t("back")}</button>
      <p className="sub-detail-error">Nie znaleziono subskrypcji.</p>
    </div>
  );

  const logoUrl = resolveLogoUrl(sub.logoUrl || company.logoUrl);
  const locale = LOCALE_MAP[lang] || "pl-PL";
  const effectiveMonths = sub._resolvedMonths ?? sub.months ?? [];
  const getMonthName = (monthNum) => {
    try {
      return new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2000, monthNum - 1, 1));
    } catch {
      return monthNum;
    }
  };

  const typeLabel = sub.type === "BI_MONTHLY"
    ? t("company.sub.typeBiMonthly")
    : sub.type === "QUARTERLY"
      ? t("company.sub.typeQuarterly")
      : sub.type === "MONTHLY"
        ? t("company.sub.typeMonthly")
        : sub.type || "";

  const renewalDate = nextRenewal(userEntry, sub);
  const baseCost = sub.basePrice != null ? Number(sub.basePrice) : null;
  const shipping = user && userEntry?.shippingCost != null ? Number(userEntry.shippingCost) : null;
  const taxes = user && userEntry?.taxesAndFees != null ? Number(userEntry.taxesAndFees) : null;
  const showTotal = user && userEntry && (shipping != null || taxes != null);
  const total = (baseCost ?? 0) + (shipping ?? 0) + (taxes ?? 0);

  const needsStartingMonth = sub && (sub.type === "BI_MONTHLY" || sub.type === "QUARTERLY");
  const needsRenewalDay = sub?.renewalDayUserSet === true;

  return (
    <div className="sub-detail-page">
      {subscribeModal && (
        <div className="uc-confirm-overlay">
          <div className="uc-confirm-dialog">
            <p style={{ fontWeight: 600, marginBottom: "0.75rem" }}>{sub.name}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <label style={{ fontSize: "0.9rem" }}>
                Data startu
                <input type="date" className="admin-form-input" style={{ display: "block", marginTop: "0.25rem" }}
                  value={subForm.startDate} onChange={(e) => setSubForm(f => ({ ...f, startDate: e.target.value }))} />
              </label>
              <label style={{ fontSize: "0.9rem" }}>
                Koszt wysyłki (opcjonalnie)
                <input type="number" step="0.01" min="0" className="admin-form-input" style={{ display: "block", marginTop: "0.25rem" }}
                  value={subForm.shippingCost} onChange={(e) => setSubForm(f => ({ ...f, shippingCost: e.target.value }))} placeholder="0.00" />
              </label>
              <label style={{ fontSize: "0.9rem" }}>
                Podatki/opłaty (opcjonalnie)
                <input type="number" step="0.01" min="0" className="admin-form-input" style={{ display: "block", marginTop: "0.25rem" }}
                  value={subForm.taxesAndFees} onChange={(e) => setSubForm(f => ({ ...f, taxesAndFees: e.target.value }))} placeholder="0.00" />
              </label>
              {needsStartingMonth && (
                <label style={{ fontSize: "0.9rem" }}>
                  Miesiąc startowy
                  <select className="admin-form-select" style={{ display: "block", marginTop: "0.25rem" }}
                    value={subForm.startingMonth} onChange={(e) => setSubForm(f => ({ ...f, startingMonth: e.target.value }))}>
                    <option value="">— wybierz —</option>
                    {(t("bookDetail.months") || []).map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
                  </select>
                </label>
              )}
              {needsRenewalDay && (
                <label style={{ fontSize: "0.9rem" }}>
                  Dzień odnowy (1–31)
                  <input type="number" min="1" max="31" className="admin-form-input" style={{ display: "block", marginTop: "0.25rem" }}
                    value={subForm.renewalDay} onChange={(e) => setSubForm(f => ({ ...f, renewalDay: e.target.value }))} placeholder="np. 15" />
                </label>
              )}
              {sub.prepayOptions?.length > 0 && (
                <div style={{ fontSize: "0.9rem" }}>
                  <div style={{ marginBottom: "0.3rem", fontWeight: 500 }}>Opcja płatności</div>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                    <input type="radio" name="prepayOption" value="" checked={!subForm.prepayOptionId} onChange={() => setSubForm(f => ({ ...f, prepayOptionId: null }))} />
                    Płatność miesięczna ({sub.basePrice ?? "—"})
                  </label>
                  {sub.prepayOptions.map(opt => (
                    <label key={opt.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                      <input type="radio" name="prepayOption" value={opt.id} checked={subForm.prepayOptionId === opt.id} onChange={() => setSubForm(f => ({ ...f, prepayOptionId: opt.id }))} />
                      {opt.label || `${opt.months} mies.`} — {opt.price} ({(opt.price / opt.months).toFixed(2)}/mies.)
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="uc-confirm-btns">
              <button className="uc-confirm-yes" onClick={() => doAddSub(subForm)}>{t("userCollection.confirmYes")}</button>
              <button className="uc-confirm-no" onClick={() => setSubscribeModal(false)}>{t("userCollection.confirmNo")}</button>
            </div>
          </div>
        </div>
      )}
      <button className="sub-detail-back-btn" onClick={onBack}>← {t("back")}</button>
      <button className="detail-action-btn" style={{ marginBottom: "0.5rem" }} title={t("share.copyLink")}
        onClick={() => {
          const url = `${window.location.origin}${window.location.pathname}?v=sub&id=${subscriptionId}&cid=${companyId}`;
          navigator.clipboard?.writeText(url).then(() => alert(t("share.copied"))).catch(() => prompt(t("share.copyLink"), url));
        }}>🔗 {t("share.copyLink")}
      </button>
      <div className="sub-detail-header">
        {/* Logo */}
        <div className="sub-detail-logo-container">
          {logoUrl ? (
            <img
              className="sub-detail-logo"
              src={logoUrl}
              alt={sub.name}
              onError={(e) => { e.target.style.display = "none"; }}
            />
          ) : (
            <div className="sub-detail-logo-placeholder">{sub.name?.[0]?.toUpperCase()}</div>
          )}
        </div>

        {/* Info */}
        <div className="sub-detail-info">
          {company && (
            <button className="sub-detail-company-link" onClick={() => onCompanyClick && onCompanyClick(company)}>
              {company.name}
            </button>
          )}
          <h1 className="sub-detail-name">{sub.name}</h1>

          <div className="sub-detail-tags">
            {sub.type && <span className="company-page-sub-tag">{typeLabel}</span>}
            {sub.bookishMerch && <span className="company-page-sub-tag">📦 Merch</span>}
            {sub.shipsInternationally
              ? <span className="company-page-sub-tag">🌍 {t("company.sub.shipsIntl")}</span>
              : sub.shippingCountries?.length > 0 && (
                  <span className="company-page-sub-tag">🚚 {sub.shippingCountries.join(", ")}</span>
                )
            }
          </div>

          {sub.genres?.length > 0 && (
            <div className="sub-detail-genres">
              {sub.genres.map((g, i) => (
                <span key={i} className="company-page-sub-genre">{g}</span>
              ))}
            </div>
          )}

          {sub.description && (
            <p className="sub-detail-description">{sub.description}</p>
          )}

          {/* Pricing */}
          {(baseCost != null || showTotal) && (
            <div className="sub-detail-pricing">
              {baseCost != null && (
                <div className="sub-detail-price-row">
                  <span>Cena bazowa</span>
                  <span>{baseCost} {company.defaultCurrency || ""}</span>
                </div>
              )}
              {shipping != null && (
                <div className="sub-detail-price-row">
                  <span>Wysyłka</span>
                  <span>{shipping} {company.defaultCurrency || ""}</span>
                </div>
              )}
              {taxes != null && (
                <div className="sub-detail-price-row">
                  <span>Podatki/opłaty</span>
                  <span>{taxes} {company.defaultCurrency || ""}</span>
                </div>
              )}
              {showTotal && (
                <div className="sub-detail-price-row sub-detail-price-total">
                  <span>Łączny koszt</span>
                  <span>{total.toFixed(2)} {company.defaultCurrency || ""}</span>
                </div>
              )}
            </div>
          )}

          {/* User info */}
          {user && userEntry && (
            <div className="sub-detail-user-info">
              {renewalDate && (
                <div className="sub-detail-renewal">
                  <span className="sub-detail-user-label">Następne odnowienie:</span>
                  <span>{renewalDate.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}</span>
                </div>
              )}
              {sub.skipPolicyType === "LIMITED" && sub.skipCount != null && (
                <div className="sub-detail-skips">
                  <span className="sub-detail-user-label">Dostępne skipy:</span>
                  <span>{sub.skipCount}</span>
                </div>
              )}
            </div>
          )}

          {/* Add to collection */}
          {user && !userEntry && (
            <button
              className="sub-detail-add-btn"
              onClick={() => { setSubForm({ startDate: today, shippingCost: "", taxesAndFees: "", startingMonth: "", renewalDay: "", prepayOptionId: null }); setSubscribeModal(true); }}
            >
              + {t("userCollection.subscribe")}
            </button>
          )}
          {user && userEntry && subAdded && (
            <p className="sub-detail-added-msg">✓ Dodano do kolekcji</p>
          )}
        </div>
      </div>

      {/* Month themes */}
      {effectiveMonths.length > 0 && (
        <div className="sub-detail-months-section">
          <h2 className="section-title">{t("company.monthThemes") || "Monthly themes"}</h2>
          {sub._parentName && (
            <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              📅 Months shared with <strong>{sub._parentName}</strong>
            </p>
          )}
          <div className="sub-detail-months-grid">
            {[...effectiveMonths].sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month).map((mo, idx) => {
              const moName = getMonthName(mo.month);

              // Collect all books for this month (multi-book or legacy)
              const monthBooks = (Array.isArray(mo.books) && mo.books.length > 0)
                ? mo.books.map(b => bookDataMap[b.bookId]).filter(Boolean)
                : (mo.bookId && bookDataMap[mo.bookId] ? [bookDataMap[mo.bookId]] : []);

              const primaryBook = monthBooks[0] || null;
              const hasBook = !!primaryBook;
              const bookCoverUrl = hasBook
                ? (primaryBook.coverUrl || primaryBook.editions?.[0]?.imageUrls?.[0] || null)
                : null;
              const primaryBookId = hasBook
                ? (Array.isArray(mo.books) && mo.books.length > 0 ? mo.books[0].bookId : mo.bookId)
                : null;

              return (
                <div
                  key={mo.id || idx}
                  className={`sub-month-card${hasBook ? " sub-month-card--has-book" : ""}`}
                  onClick={() => {
                    if (hasBook && onBookClick) onBookClick(primaryBookId, {
                      month: mo.month,
                      year: mo.year,
                      renewalDay: userEntry?.renewalDay ?? sub?.renewalDay ?? null,
                    });
                  }}
                >
                  {/* Base month image — defines card proportions */}
                  {mo.imageUrl && (
                    <img
                      className="sub-month-card-img"
                      src={mo.imageUrl}
                      alt={mo.theme || `${moName} ${mo.year}`}
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  )}
                  {/* Book cover — fades in on hover via CSS */}
                  {bookCoverUrl && (
                    <img
                      className="sub-month-card-book-img"
                      src={bookCoverUrl}
                      alt={primaryBook.title || ""}
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  )}
                  <div className="sub-month-card-overlay" />
                  <div className="sub-month-card-content">
                    <div className="sub-month-card-info">
                      <div className="sub-month-card-date">{moName} {mo.year}</div>
                      {mo.theme && <div className="sub-month-card-theme">{mo.theme}</div>}
                    </div>
                  </div>
                  {hasBook && (
                    <div className="sub-month-card-book-info">
                      {monthBooks.map((bk, bi) => (
                        <div key={bi}>
                          <div className="sub-month-card-theme">{bk.title}</div>
                          {bk.author && <div className="sub-month-card-author">{bk.author}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
