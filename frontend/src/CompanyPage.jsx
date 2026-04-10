import { useState } from "react";
import "./CompanyPage.css";
import { useI18n } from "./i18n";

export default function CompanyPage({ company, onBack, onEdit, onDelete, user }) {
  const { t } = useI18n();
  const [deleting, setDeleting] = useState(false);

  const canManage = user && (user.username === "admin" || company?.managerUsernames?.includes(user.username));

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
            <button
              className="company-action-btn company-delete-btn"
              onClick={handleDelete}
              disabled={deleting}
            >
              {t("company.deleteBtn")}
            </button>
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
            <ul className="company-page-subs-list">
              {company.subscriptions.map((sub, idx) => (
                <li key={idx} className="company-page-sub-item">{sub}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
