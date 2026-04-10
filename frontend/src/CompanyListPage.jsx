import { useState, useEffect } from "react";
import "./CompanyListPage.css";
import { useI18n } from "./i18n";

export default function CompanyListPage({ onCompanyClick, onNewCompany, user }) {
  const { t } = useI18n();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("http://localhost:8080/api/companies", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => { setCompanies(data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  return (
    <div className="company-list-page">
      <div className="company-list-header">
        <h2 className="company-list-title">{t("company.listTitle")}</h2>
        {user && (
          <button className="company-new-btn" onClick={onNewCompany}>
            {t("company.newBtn")}
          </button>
        )}
      </div>

      {loading && (
        <div className="status-container">
          <div className="spinner" />
        </div>
      )}
      {error && <p className="company-error">{error}</p>}
      {!loading && !error && companies.length === 0 && (
        <p className="company-empty">{t("company.noCompanies")}</p>
      )}

      <div className="company-grid">
        {companies.map((company) => (
          <article
            key={company.id}
            className="company-card"
            onClick={() => onCompanyClick(company)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onCompanyClick(company)}
          >
            <div className="company-card-logo">
              <img
                src={company.logoUrl}
                alt={company.name}
                onError={(e) => {
                  e.target.src = `https://placehold.co/200x100/060d18/00b4d0?text=${encodeURIComponent(company.name || "?")}`;
                }}
              />
            </div>
            <div className="company-card-info">
              <h3 className="company-card-name">{company.name}</h3>
              {company.location && (
                <p className="company-card-meta">{company.location}</p>
              )}
              {company.defaultCurrency && (
                <p className="company-card-meta">{company.defaultCurrency}</p>
              )}
              {company.subscriptions && company.subscriptions.length > 0 && (
                <p className="company-card-subs">
                  {company.subscriptions.length} {t("company.subscriptions")}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
