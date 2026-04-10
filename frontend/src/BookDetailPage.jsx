import { useState, useEffect } from "react";
import "./BookDetailPage.css";
import BookCarousel from "./BookCarousel";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";

export default function BookDetailPage({ bookTitle, onBack, onEdit, onNavigateNew, onCompanyClick }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [detail, setDetail] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [company, setCompany] = useState(null);

  useEffect(() => {
    if (!bookTitle) return;
    setLoading(true);
    setNotFound(false);
    setDetail(null);
    fetch(`http://localhost:8080/api/book-details/by-title?title=${encodeURIComponent(bookTitle)}`, {
      credentials: "include",
    })
      .then((res) => {
        if (res.status === 404) { setNotFound(true); setLoading(false); return null; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => { if (data) { setDetail(data); setLoading(false); } })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [bookTitle]);

  useEffect(() => {
    if (!detail?.bookBoxCompanyId) { setCompany(null); return; }
    fetch(`http://localhost:8080/api/companies/${detail.bookBoxCompanyId}`, { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setCompany(data))
      .catch(() => setCompany(null));
  }, [detail?.bookBoxCompanyId]);

  const handleDelete = async () => {
    if (!window.confirm(t("bookDetail.deleteConfirm"))) return;
    setDeleting(true);
    try {
      const res = await fetch(`http://localhost:8080/api/book-details/${detail.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) onBack();
    } finally {
      setDeleting(false);
    }
  };

  const formatSubscriptionDate = (month, year) => {
    if (!month || !year) return null;
    const months = t("bookDetail.months");
    const monthsArr = Array.isArray(months) ? months : [];
    const monthName = monthsArr[month - 1] || `${month}`;
    return `${monthName} ${year}`;
  };

  if (loading) {
    return (
      <div className="book-detail-page">
        <button className="detail-back-btn" onClick={onBack}>{t("back")}</button>
        <div className="status-container"><div className="spinner" /></div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="book-detail-page">
        <button className="detail-back-btn" onClick={onBack}>{t("back")}</button>
        <div className="detail-not-found">
          <h2 className="detail-title">{bookTitle}</h2>
          <p className="detail-no-details">{t("bookDetail.noDetails")}</p>
          {user && (
            <button className="detail-action-btn" onClick={onNavigateNew}>
              {t("bookDetail.addDetails")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const subDate = formatSubscriptionDate(detail.subscriptionMonth, detail.subscriptionYear);
  const hasSaleDates = detail.firstAccessDate || detail.earlyAccessDate || detail.generalSaleDate;

  return (
    <div className="book-detail-page">
      <div className="detail-actions-top">
        <button className="detail-back-btn" onClick={onBack}>{t("back")}</button>
        <div className="detail-actions-right">
          {user && (
            <button className="detail-action-btn" onClick={() => onEdit(detail)}>
              {t("bookDetail.editBtn")}
            </button>
          )}
          {user && user.username === "admin" && (
            <button className="detail-action-btn detail-delete-btn" onClick={handleDelete} disabled={deleting}>
              {t("bookDetail.deleteBtn")}
            </button>
          )}
        </div>
      </div>

      <div className="detail-layout">
        <div className="detail-carousel-col">
          <BookCarousel images={detail.imageUrls || []} />
        </div>

        <div className="detail-info-col">
          <h1 className="detail-title">{detail.title}</h1>
          {detail.author && <p className="detail-author">{detail.author}</p>}

          <div className="detail-fields">
            {detail.seriesName && (
              <div className="detail-field">
                <span className="detail-label">{t("bookDetail.series")}</span>
                <span className="detail-value">{detail.seriesName}</span>
              </div>
            )}
            {detail.volumeNumber && (
              <div className="detail-field">
                <span className="detail-label">{t("bookDetail.volume")}</span>
                <span className="detail-value">{detail.volumeNumber}</span>
              </div>
            )}
            {detail.subscriptionName && (
              <div className="detail-field">
                <span className="detail-label">{t("bookDetail.subscription")}</span>
                <span className="detail-value">{detail.subscriptionName}</span>
              </div>
            )}
            {detail.publisher && (
              <div className="detail-field">
                <span className="detail-label">{t("bookDetail.publisher")}</span>
                <span className="detail-value">{detail.publisher}</span>
              </div>
            )}
            {subDate && (
              <div className="detail-field">
                <span className="detail-label">{t("bookDetail.subscriptionDate")}</span>
                <span className="detail-value">{subDate}</span>
              </div>
            )}
            {detail.basePrice != null && (
              <div className="detail-field">
                <span className="detail-label">{t("bookDetail.price")}</span>
                <span className="detail-value">
                  {detail.basePrice} {detail.currency}
                </span>
              </div>
            )}
            {(company || detail.bookBoxCompanyCustomName) && (
              <div className="detail-field">
                <span className="detail-label">{t("bookDetail.company")}</span>
                <span className="detail-value">
                  {company ? (
                    <button
                      className="detail-company-link"
                      onClick={() => onCompanyClick && onCompanyClick(company)}
                    >
                      {company.name}
                    </button>
                  ) : (
                    detail.bookBoxCompanyCustomName
                  )}
                </span>
              </div>
            )}
          </div>

          {hasSaleDates && (
            <div className="detail-section">
              <h3 className="detail-section-title">{t("bookDetail.saleDates")}</h3>
              <table className="detail-dates-table">
                <tbody>
                  {detail.firstAccessDate && (
                    <tr>
                      <td className="detail-date-label">{t("bookDetail.firstAccess")}</td>
                      <td className="detail-date-value">{detail.firstAccessDate}</td>
                    </tr>
                  )}
                  {detail.earlyAccessDate && (
                    <tr>
                      <td className="detail-date-label">{t("bookDetail.earlyAccess")}</td>
                      <td className="detail-date-value">{detail.earlyAccessDate}</td>
                    </tr>
                  )}
                  {detail.generalSaleDate && (
                    <tr>
                      <td className="detail-date-label">{t("bookDetail.generalSale")}</td>
                      <td className="detail-date-value">{detail.generalSaleDate}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {detail.artists && detail.artists.length > 0 && (
            <div className="detail-section">
              <h3 className="detail-section-title">{t("bookDetail.artists")}</h3>
              <ul className="detail-artists-list">
                {detail.artists.map((a, idx) => (
                  <li key={idx} className="detail-artist-card">
                    <span className="detail-artist-name">{a.artistName}</span>
                    <span className="detail-artist-role">{a.contribution}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
