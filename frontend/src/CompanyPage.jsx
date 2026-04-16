import { useState, useEffect } from "react";
import "./CompanyPage.css";
import { useI18n } from "./i18n";
import { API } from "./api";
import HeartButton from "./HeartButton";
import SaleBuyModal from "./SaleBuyModal";

const resolveLogoUrl = (url) => {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API.BASE}${url}`;
};

export default function CompanyPage({ company, onBack, onEdit, onDelete, user, onSubscriptionClick, adminView }) {
  const { t } = useI18n();
  const [deleting, setDeleting] = useState(false);
  const [fullCompany, setFullCompany] = useState(company);

  useEffect(() => { setFullCompany(company); }, [company]);

  useEffect(() => {
    if (!company?.subscriptions && company?.id) {
      fetch(`http://localhost:8080/api/companies/${company.id}`, { credentials: "include" })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setFullCompany(data); })
        .catch(() => {});
    }
  }, [company?.id]);

  // ── user subscriptions state ──
  const [userSubs, setUserSubs] = useState([]);
  const [subAddedId, setSubAddedId] = useState(null); // subscriptionId that just got added
  const [confirmSubDupe, setConfirmSubDupe] = useState(null); // { sub, count }
  const [subscribeModal, setSubscribeModal] = useState(null); // { sub, isDupe }

  // subscribe form state
  const today = new Date().toISOString().slice(0, 10);
  const [subForm, setSubForm] = useState({ startDate: today, shippingCost: "", taxesAndFees: "", startingMonth: "", renewalDay: "", prepayOptionId: null });

  const canManage = user && (user.role === "admin" || fullCompany?.managerUsernames?.includes(user.username));
  const canDelete = user && user.role === "admin";

  // ── Upcoming sales state ──
  const [upcomingSales, setUpcomingSales] = useState([]);
  const [saleInterests, setSaleInterests] = useState({}); // saleId -> status
  const [buyModalSale, setBuyModalSale] = useState(null);

  useEffect(() => {
    if (!company?.id) return;
    const endpoint = user ? API.USER_SALES_UPCOMING : API.SALES_UPCOMING;
    fetch(endpoint, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        const filtered = data.filter((s) => s.companyId === company.id);
        setUpcomingSales(filtered);
        if (user) {
          const map = {};
          filtered.forEach((s) => { map[s.id] = s.userStatus || null; });
          setSaleInterests(map);
        }
      })
      .catch(() => {});
  }, [company?.id, user]);

  const handleSaleInterest = async (saleId) => {
    if (!user) return;
    const current = saleInterests[saleId];
    const next = current === "INTERESTED" ? null : "INTERESTED";
    try {
      const res = await fetch(API.USER_SALE_INTEREST(saleId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        setSaleInterests((prev) => ({ ...prev, [saleId]: next }));
      }
    } catch {}
  };

  useEffect(() => {
    if (!user) { setUserSubs([]); return; }
    fetch("http://localhost:8080/api/user/subscriptions", { credentials: "include" })
      .then((res) => res.ok ? res.json() : [])
      .then(setUserSubs)
      .catch(() => setUserSubs([]));
  }, [user]);

  const doAddSub = async (sub, formData) => {
    const now = new Date();
    // Determine billing period data
    let billingPeriod = null;
    if (formData.prepayOptionId && sub.prepayOptions) {
      const opt = sub.prepayOptions.find(o => o.id === formData.prepayOptionId);
      if (opt) {
        const startDate = formData.startDate || today;
        const [year, month] = startDate.split("-").map(Number);
        billingPeriod = {
          billedAt: startDate,
          amountPaid: opt.price,
          monthsCovered: opt.months,
          coveredFromMonth: month,
          coveredFromYear: year,
          prepayOptionId: opt.id,
        };
      }
    } else {
      // Regular monthly billing period
      const startDate = formData.startDate || today;
      const [year, month] = startDate.split("-").map(Number);
      const basePrice = sub.basePrice;
      if (basePrice) {
        billingPeriod = {
          billedAt: startDate,
          amountPaid: basePrice,
          monthsCovered: 1,
          coveredFromMonth: month,
          coveredFromYear: year,
        };
      }
    }
    const body = {
      companyId: fullCompany.id,
      subscriptionId: sub.id,
      startDate: formData.startDate || null,
      shippingCost: formData.shippingCost !== "" ? parseFloat(formData.shippingCost) : null,
      taxesAndFees: formData.taxesAndFees !== "" ? parseFloat(formData.taxesAndFees) : null,
      startingMonth: formData.startingMonth !== "" ? parseInt(formData.startingMonth) : null,
      renewalDay:    formData.renewalDay    !== "" ? parseInt(formData.renewalDay)    : null,
      ...(billingPeriod ? { billingPeriod } : {}),
    };
    const res = await fetch("http://localhost:8080/api/user/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      setUserSubs((prev) => [...prev, data.entry]);
      setSubAddedId(sub.id);
      setTimeout(() => setSubAddedId(null), 3000);
    }
    setSubscribeModal(null);
    setConfirmSubDupe(null);
  };

  const handleSubscribe = (sub) => {
    if (!user) return;
    const count = userSubs.filter((e) => e.subscriptionId === sub.id && e.companyId === fullCompany.id).length;
    const resetForm = { startDate: today, shippingCost: "", taxesAndFees: "", startingMonth: "", renewalDay: "", prepayOptionId: null };
    setSubForm(resetForm);
    setSubscribeModal({ sub, isDupe: count > 0, count });
  };

  const handleDelete = async () => {
    if (!window.confirm(t("company.deleteConfirm"))) return;
    setDeleting(true);
    try {
      const res = await fetch(`http://localhost:8080/api/companies/${fullCompany.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) onDelete();
    } finally {
      setDeleting(false);
    }
  };

    if (!fullCompany) return null;

  const needsStartingMonth = subscribeModal?.sub &&
    (subscribeModal.sub.type === "BI_MONTHLY" || subscribeModal.sub.type === "QUARTERLY");
  const needsRenewalDay = subscribeModal?.sub?.renewalDayUserSet === true;

  return (
    <div className="company-page">
      {/* subscribe modal */}
      {subscribeModal && (
        <div className="uc-confirm-overlay">
          <div className="uc-confirm-dialog">
            {subscribeModal.isDupe && (
              <p>{t("userCollection.alreadySub", { count: subscribeModal.count })}</p>
            )}
            <p style={{ fontWeight: 600, marginBottom: "0.75rem" }}>{subscribeModal.sub.name}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <label style={{ fontSize: "0.9rem" }}>
                {t("company.sub.formStartDate")}
                <input
                  type="date"
                  className="admin-form-input"
                  style={{ display: "block", marginTop: "0.25rem" }}
                  value={subForm.startDate}
                  onChange={(e) => setSubForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </label>
              <label style={{ fontSize: "0.9rem" }}>
                {t("company.sub.formShipping")}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="admin-form-input"
                  style={{ display: "block", marginTop: "0.25rem" }}
                  value={subForm.shippingCost}
                  onChange={(e) => setSubForm((f) => ({ ...f, shippingCost: e.target.value }))}
                  placeholder="0.00"
                />
              </label>
              <label style={{ fontSize: "0.9rem" }}>
                {t("company.sub.formTaxes")}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="admin-form-input"
                  style={{ display: "block", marginTop: "0.25rem" }}
                  value={subForm.taxesAndFees}
                  onChange={(e) => setSubForm((f) => ({ ...f, taxesAndFees: e.target.value }))}
                  placeholder="0.00"
                />
              </label>
              {needsStartingMonth && (
                <label style={{ fontSize: "0.9rem" }}>
                  {t("company.sub.formStartMonth")}
                  <select
                    className="admin-form-select"
                    style={{ display: "block", marginTop: "0.25rem" }}
                    value={subForm.startingMonth}
                    onChange={(e) => setSubForm((f) => ({ ...f, startingMonth: e.target.value }))}
                  >
                    <option value="">{t("company.sub.formSelect")}</option>
                    {(t("bookDetail.months") || []).map((name, i) => (
                      <option key={i + 1} value={i + 1}>{name}</option>
                    ))}
                  </select>
                </label>
              )}
              {needsRenewalDay && (
                <label style={{ fontSize: "0.9rem" }}>
                  {t("company.sub.formRenewalDay")}
                  <input
                    type="number"
                    min="1"
                    max="31"
                    className="admin-form-input"
                    style={{ display: "block", marginTop: "0.25rem" }}
                    value={subForm.renewalDay}
                    onChange={(e) => setSubForm((f) => ({ ...f, renewalDay: e.target.value }))}
                    placeholder="np. 15"
                  />
                </label>
              )}
              {/* Prepay options */}
              {subscribeModal.sub.prepayOptions && subscribeModal.sub.prepayOptions.length > 0 && (
                <div style={{ fontSize: "0.9rem" }}>
                  <div style={{ marginBottom: "0.3rem", fontWeight: 500 }}>{t("company.sub.formPaymentOption")}</div>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                    <input type="radio" name="prepayOption" value=""
                      checked={!subForm.prepayOptionId}
                      onChange={() => setSubForm(f => ({ ...f, prepayOptionId: null }))} />
                    {t("company.sub.formMonthly")} ({subscribeModal.sub.basePrice ?? "—"})
                  </label>
                  {subscribeModal.sub.prepayOptions.map(opt => (
                    <label key={opt.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                      <input type="radio" name="prepayOption" value={opt.id}
                        checked={subForm.prepayOptionId === opt.id}
                        onChange={() => setSubForm(f => ({ ...f, prepayOptionId: opt.id }))} />
                      {opt.label || t("company.sub.formMonths")(opt.months)} — {opt.price} ({((opt.price / opt.months)).toFixed(2)}{t("company.sub.formPerMonth")})
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="uc-confirm-btns">
              <button className="uc-confirm-yes" onClick={() => doAddSub(subscribeModal.sub, subForm)}>
                {t("userCollection.confirmYes")}
              </button>
              <button className="uc-confirm-no" onClick={() => setSubscribeModal(null)}>
                {t("userCollection.confirmNo")}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="company-page-actions-top">
        <button className="company-back-btn" onClick={onBack}>{t("back")}</button>
        {adminView && canManage && (
          <div className="company-page-actions-right">
            <button className="company-action-btn" onClick={() => onEdit(fullCompany)}>
              {t("company.editBtn")}
            </button>
            {canDelete && (
              <button
                className="company-action-btn company-delete-btn"
                onClick={handleDelete}
                disabled={deleting}
              >
                {t("company.deleteBtn")}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="company-page-content">
        {fullCompany.logoUrl && (
          <div className="company-page-logo">
            <img
              src={resolveLogoUrl(fullCompany.logoUrl)}
              alt={fullCompany.name}
              onError={(e) => {
                e.target.src = `https://placehold.co/200x100/060d18/00b4d0?text=${encodeURIComponent(fullCompany.name || "?")}`;
              }}
            />
          </div>
        )}

        <h1 className="company-page-name">{fullCompany.name}</h1>
        <HeartButton type="companies" id={fullCompany.id} />

        {fullCompany.websiteUrl && (
          <a
            className="company-page-website"
            href={fullCompany.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {fullCompany.websiteUrl}
          </a>
        )}

        {/* Social media links */}
        {["instagram","threads","tiktok","facebook","x","bluesky"].some(k => fullCompany[k]) && (
          <div className="company-page-social-links">
            {[
              { key: "instagram", label: "Instagram", icon: "📷" },
              { key: "threads",   label: "Threads",   icon: "🧵" },
              { key: "tiktok",    label: "TikTok",    icon: "🎵" },
              { key: "facebook",  label: "Facebook",  icon: "📘" },
              { key: "x",         label: "X",         icon: "✕"  },
              { key: "bluesky",   label: "Bluesky",   icon: "🦋" },
            ].filter(p => fullCompany[p.key]).map(p => (
              <a key={p.key} href={fullCompany[p.key]} target="_blank" rel="noopener noreferrer"
                className="company-page-social-link" title={p.label}>
                <span>{p.icon}</span> {p.label}
              </a>
            ))}
          </div>
        )}

        {fullCompany.description && (
          <p className="company-page-description">{fullCompany.description}</p>
        )}

        <div className="company-page-fields">
          {fullCompany.location && (
            <div className="company-page-field">
              <span className="company-page-label">{t("company.location")}</span>
              <span className="company-page-value">{fullCompany.location}</span>
            </div>
          )}
          {fullCompany.defaultCurrency && (
            <div className="company-page-field">
              <span className="company-page-label">{t("company.currency")}</span>
              <span className="company-page-value">{fullCompany.defaultCurrency}</span>
            </div>
          )}
        </div>

        {fullCompany.subscriptions && fullCompany.subscriptions.length > 0 && (
          <div className="company-page-section">
            <h3 className="section-title">{t("company.subscriptions")}</h3>
            <div className="company-page-subs-grid">
              {fullCompany.subscriptions.map((sub, idx) => {
                const subObj = typeof sub === "string" ? { name: sub } : sub;
                const typeLabel = subObj.type === "BI_MONTHLY"
                  ? t("company.sub.typeBiMonthly")
                  : subObj.type === "QUARTERLY"
                    ? t("company.sub.typeQuarterly")
                    : subObj.type === "MONTHLY"
                      ? t("company.sub.typeMonthly")
                      : subObj.type || "";
                return (
                  <div key={subObj.id || idx} className={`company-page-sub-card${onSubscriptionClick && subObj.id ? " company-page-sub-card--clickable" : ""}`}
                    onClick={() => onSubscriptionClick && subObj.id && onSubscriptionClick({ companyId: fullCompany.id, subscriptionId: subObj.id })}>
                    {subObj.logoUrl && (
                      <img className="company-page-sub-logo" src={resolveLogoUrl(subObj.logoUrl)} alt={subObj.name}
                        onError={(e) => { e.target.style.display = "none"; }} />
                    )}
                    <div className="company-page-sub-body">
                      <h4 className="company-page-sub-name">{subObj.name}</h4>
                      <div className="company-page-sub-meta">
                        {subObj.type && <span className="company-page-sub-tag">{typeLabel}</span>}
                        {subObj.bookishMerch && <span className="company-page-sub-tag">📦 Merch</span>}
                        {subObj.shipsInternationally
                          ? <span className="company-page-sub-tag">🌍 {t("company.sub.shipsIntl")}</span>
                          : subObj.shippingCountries && subObj.shippingCountries.length > 0 && (
                              <span className="company-page-sub-tag">🚚 {subObj.shippingCountries.join(", ")}</span>
                            )
                        }
                      </div>
                      {subObj.genres && subObj.genres.length > 0 && (
                        <div className="company-page-sub-genres">
                          {subObj.genres.map((g, gi) => (
                            <span key={gi} className="company-page-sub-genre">{g}</span>
                          ))}
                        </div>
                      )}
                      {subObj.description && (
                        <p style={{ fontSize: "0.9rem", color: "var(--text-ghost)", margin: "0.4rem 0 0", lineHeight: 1.5 }}>
                          {subObj.description}
                        </p>
                      )}
                      {subObj.basePrice != null && subObj.basePrice !== "" && (
                        <p className="company-page-sub-price">
                          {subObj.basePrice} {fullCompany.defaultCurrency || ""}
                        </p>
                      )}
                      {user && subObj.id && (
                        <button
                          className={`uc-subscribe-btn${subAddedId === subObj.id ? " uc-subscribe-btn--added" : ""}`}
                          onClick={(e) => { e.stopPropagation(); handleSubscribe(subObj); }}
                        >
                          {subAddedId === subObj.id
                            ? t("userCollection.subAdded")
                            : t("userCollection.subscribe")}
                        </button>
                      )}
                      {/* Months shown only on SubscriptionDetailPage, not here */}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Upcoming Sales ── */}
      {upcomingSales.length > 0 && (
        <div className="company-page-section" style={{ marginTop: "1.5rem" }}>
          <h3 className="section-title">🛒 Upcoming Sales</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {upcomingSales.map((sale) => {
              const interest = saleInterests[sale.id];
              const isBought = interest === "BOUGHT";
              return (
                <div key={sale.id} style={{
                  border: "1px solid var(--border, #e5e7eb)",
                  borderRadius: 8,
                  padding: "1rem",
                  background: "var(--card-bg, #fff)",
                }}>
                  {sale.imageUrl && (
                    <img src={sale.imageUrl} alt={sale.title}
                      style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 6, marginBottom: "0.75rem" }}
                      onError={(e) => { e.target.style.display = "none"; }} />
                  )}
                  <h4 style={{ margin: "0 0 0.25rem" }}>{sale.title}</h4>
                  <p style={{ margin: "0 0 0.5rem", color: "var(--text-muted, #666)", fontSize: "0.9rem" }}>
                    Sale date: <strong>{sale.generalSaleDate || sale.saleDate}</strong>
                    {sale.basePrice && (
                      <> · <strong>{parseFloat(sale.basePrice).toLocaleString("en-GB", { style: "currency", currency: sale.currency || "GBP" })}</strong></>
                    )}
                  </p>
                  {sale.description && (
                    <p style={{ margin: "0 0 0.75rem", fontSize: "0.88rem", color: "var(--text-ghost)" }}>{sale.description}</p>
                  )}
                  {user && (
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {!isBought && (
                        <button
                          onClick={() => handleSaleInterest(sale.id)}
                          style={{
                            padding: "0.35rem 0.85rem",
                            background: interest === "INTERESTED" ? "#7c3aed" : "var(--bg-secondary, #f3f4f6)",
                            color: interest === "INTERESTED" ? "#fff" : "inherit",
                            border: "1px solid var(--border, #e5e7eb)",
                            borderRadius: 5,
                            cursor: "pointer",
                            fontSize: "0.88rem",
                            fontWeight: 500,
                          }}
                        >
                          {interest === "INTERESTED" ? "⭐ Interested" : "☆ Interested"}
                        </button>
                      )}
                      {isBought ? (
                        <span style={{ color: "#16a34a", fontWeight: 600 }}>✅ Bought</span>
                      ) : (
                        <button
                          onClick={() => setBuyModalSale(sale)}
                          style={{
                            padding: "0.35rem 0.85rem",
                            background: "#7c3aed",
                            color: "#fff",
                            border: "none",
                            borderRadius: 5,
                            cursor: "pointer",
                            fontSize: "0.88rem",
                            fontWeight: 500,
                          }}
                        >
                          🛒 Buy
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {buyModalSale && (
        <SaleBuyModal
          sale={buyModalSale}
          onClose={() => setBuyModalSale(null)}
          onBought={(saleId) => {
            setSaleInterests((prev) => ({ ...prev, [saleId]: "BOUGHT" }));
            setTimeout(() => setBuyModalSale(null), 1500);
          }}
        />
      )}
    </div>
  );
}
