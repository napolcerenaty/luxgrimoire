import { useState, useEffect } from "react";
import "./CompanyListPage.css";
import { useI18n } from "./i18n";
import { API } from "./api";

function resolveLogoUrl(url) {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API.BASE}${url}`;
}

export default function CompanyListPage({ onCompanyClick, onNewCompany, onRequestData, user }) {
  const { t } = useI18n();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("http://localhost:8080/api/companies", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => { setCompanies(data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  const filtered = search.trim()
    ? companies.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()))
    : companies;

  return (
    <div className="company-list-page">
      <div className="company-list-header">
        <h2 className="section-title">{t("company.listTitle")}</h2>
      </div>

      <div className="company-list-toolbar">
        <input
          className="company-search-input"
          type="search"
          placeholder={t("company.searchPlaceholder")}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="company-request-btn" onClick={onRequestData}>
          {t("company.requestDataHint")}
        </button>
      </div>

      {loading && (
        <div className="status-container">
          <div className="spinner" />
        </div>
      )}
      {error && <p className="company-error">{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="company-empty">{t("company.noCompanies")}</p>
      )}

      <div className="company-grid">
        {filtered.map((company) => (
          <article
            key={company.id}
            className="company-card"
            onClick={() => onCompanyClick(company)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onCompanyClick(company)}
          >
            <div className="company-card-logo">
              {resolveLogoUrl(company.logoUrl) ? (
                <img
                  src={resolveLogoUrl(company.logoUrl)}
                  alt={company.name}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = `https://placehold.co/200x100/060d18/00b4d0?text=${encodeURIComponent(company.name || "?")}`;
                  }}
                />
              ) : (
                <img
                  src={`https://placehold.co/200x100/060d18/00b4d0?text=${encodeURIComponent(company.name || "?")}`}
                  alt={company.name}
                />
              )}
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
                  {company.subscriptions.map(s => typeof s === "string" ? s : s.name).join(", ")}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
