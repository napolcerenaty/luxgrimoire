import { useState, useEffect } from "react";
import "./CompanyPage.css";
import { useI18n } from "./i18n";

export default function CompanyPage({ company, onBack, onEdit, onDelete, user }) {
  const { t } = useI18n();
  const [deleting, setDeleting] = useState(false);

  // ── user subscriptions state ──
  const [userSubs, setUserSubs] = useState([]);
  const [subAddedId, setSubAddedId] = useState(null); // subscriptionId that just got added
  const [confirmSubDupe, setConfirmSubDupe] = useState(null); // { sub, count }
  const [subscribeModal, setSubscribeModal] = useState(null); // { sub, isDupe }

  // subscribe form state
  const today = new Date().toISOString().slice(0, 10);
  const [subForm, setSubForm] = useState({ startDate: today, shippingCost: "", taxesAndFees: "", startingMonth: "", renewalDay: "" });

  const canManage = user && (user.role === "admin" || company?.managerUsernames?.includes(user.username));
  const canDelete = user && user.role === "admin";

  useEffect(() => {
    if (!user) { setUserSubs([]); return; }
    fetch("http://localhost:8080/api/user/subscriptions", { credentials: "include" })
      .then((res) => res.ok ? res.json() : [])
      .then(setUserSubs)
      .catch(() => setUserSubs([]));
  }, [user]);

  const doAddSub = async (sub, formData) => {
    const body = {
      companyId: company.id,
      subscriptionId: sub.id,
      startDate: formData.startDate || null,
      shippingCost: formData.shippingCost !== "" ? parseFloat(formData.shippingCost) : null,
      taxesAndFees: formData.taxesAndFees !== "" ? parseFloat(formData.taxesAndFees) : null,
      startingMonth: formData.startingMonth !== "" ? parseInt(formData.startingMonth) : null,
      renewalDay:    formData.renewalDay    !== "" ? parseInt(formData.renewalDay)    : null,
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
    const count = userSubs.filter((e) => e.subscriptionId === sub.id && e.companyId === company.id).length;
    const resetForm = { startDate: today, shippingCost: "", taxesAndFees: "", startingMonth: "", renewalDay: "" };
    setSubForm(resetForm);
    setSubscribeModal({ sub, isDupe: count > 0, count });
  };

  const handleDelete = async () => {
    if (!window.confirm(t("company.deleteConfirm"))) return;
    setDeleting(true);
    try {
      const res = await fetch(`http://localhost:8080/api/companies/${company.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) onDelete();
    } finally {
      setDeleting(false);
    }
  };

  if (!company) return null;

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
                Data startu
                <input
                  type="date"
                  className="admin-form-input"
                  style={{ display: "block", marginTop: "0.25rem" }}
                  value={subForm.startDate}
                  onChange={(e) => setSubForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </label>
              <label style={{ fontSize: "0.9rem" }}>
                Koszt wysyłki (opcjonalnie)
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
                Podatki/opłaty (opcjonalnie)
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
                  Miesiąc startowy
                  <select
                    className="admin-form-select"
                    style={{ display: "block", marginTop: "0.25rem" }}
                    value={subForm.startingMonth}
                    onChange={(e) => setSubForm((f) => ({ ...f, startingMonth: e.target.value }))}
                  >
                    <option value="">— wybierz —</option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </label>
              )}
              {needsRenewalDay && (
                <label style={{ fontSize: "0.9rem" }}>
                  Dzień odnowy (1–28)
                  <input
                    type="number"
                    min="1"
                    max="28"
                    className="admin-form-input"
                    style={{ display: "block", marginTop: "0.25rem" }}
                    value={subForm.renewalDay}
                    onChange={(e) => setSubForm((f) => ({ ...f, renewalDay: e.target.value }))}
                    placeholder="np. 15"
                  />
                </label>
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
        {canManage && (
          <div className="company-page-actions-right">
            <button className="company-action-btn" onClick={() => onEdit(company)}>
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
        {company.logoUrl && (
          <div className="company-page-logo">
            <img
              src={company.logoUrl}
              alt={company.name}
              onError={(e) => {
                e.target.src = `https://placehold.co/200x100/060d18/00b4d0?text=${encodeURIComponent(company.name || "?")}`;
              }}
            />
          </div>
        )}

        <h1 className="company-page-name">{company.name}</h1>

        {company.websiteUrl && (
          <a
            className="company-page-website"
            href={company.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {company.websiteUrl}
          </a>
        )}

        {company.description && (
          <p className="company-page-description">{company.description}</p>
        )}

        <div className="company-page-fields">
          {company.location && (
            <div className="company-page-field">
              <span className="company-page-label">{t("company.location")}</span>
              <span className="company-page-value">{company.location}</span>
            </div>
          )}
          {company.defaultCurrency && (
            <div className="company-page-field">
              <span className="company-page-label">{t("company.currency")}</span>
              <span className="company-page-value">{company.defaultCurrency}</span>
            </div>
          )}
        </div>

        {company.subscriptions && company.subscriptions.length > 0 && (
          <div className="company-page-section">
            <h3 className="company-page-section-title">{t("company.subscriptions")}</h3>
            <div className="company-page-subs-grid">
              {company.subscriptions.map((sub, idx) => {
                const subObj = typeof sub === "string" ? { name: sub } : sub;
                const typeLabel = subObj.type === "BI_MONTHLY"
                  ? t("company.sub.typeBiMonthly")
                  : subObj.type === "QUARTERLY"
                    ? t("company.sub.typeQuarterly")
                    : subObj.type === "MONTHLY"
                      ? t("company.sub.typeMonthly")
                      : subObj.type || "";
                return (
                  <div key={subObj.id || idx} className="company-page-sub-card">
                    {subObj.logoUrl && (
                      <img className="company-page-sub-logo" src={subObj.logoUrl} alt={subObj.name}
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
                      {subObj.basePrice != null && subObj.basePrice !== "" && (
                        <p className="company-page-sub-price">
                          {subObj.basePrice} {company.defaultCurrency || ""}
                        </p>
                      )}
                      {user && subObj.id && (
                        <button
                          className={`uc-subscribe-btn${subAddedId === subObj.id ? " uc-subscribe-btn--added" : ""}`}
                          onClick={() => handleSubscribe(subObj)}
                        >
                          {subAddedId === subObj.id
                            ? t("userCollection.subAdded")
                            : t("userCollection.subscribe")}
                        </button>
                      )}
                      {subObj.months && subObj.months.length > 0 && (
                        <div className="company-page-sub-months">
                          <span className="company-page-sub-months-title">{t("company.sub.months")}</span>
                          <div className="company-page-sub-months-list">
                            {subObj.months.map((mo, mi) => {
                              const mName = (Array.isArray(t("bookDetail.months")) ? t("bookDetail.months")[mo.month - 1] : mo.month) + " " + mo.year;
                              return (
                                <div key={mo.id || mi} className={`company-page-sub-month${mo.bookId ? " has-book" : ""}`}>
                                  {mo.imageUrl && (
                                    <img className="company-page-sub-month-img" src={mo.imageUrl} alt={mo.theme || mName}
                                      onError={(e) => { e.target.style.display = "none"; }} />
                                  )}
                                  <div className="company-page-sub-month-info">
                                    <span className="company-page-sub-month-date">{mName}</span>
                                    {mo.theme && <span className="company-page-sub-month-theme">{mo.theme}</span>}
                                    {mo.bookId && <span className="company-page-sub-month-book-badge">📖</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
