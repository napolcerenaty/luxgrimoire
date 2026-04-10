import { useState } from "react";
import "./CompanyPage.css";
import { useI18n } from "./i18n";

export default function CompanyPage({ company, onBack, onEdit, onDelete, user }) {
  const { t } = useI18n();
  const [deleting, setDeleting] = useState(false);

  const canManage = user && (user.username === "admin" || company?.managerUsernames?.includes(user.username));
  const canDelete = user && user.username === "admin";

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

  return (
    <div className="company-page">
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
