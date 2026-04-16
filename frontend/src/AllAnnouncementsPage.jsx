import { useState, useEffect } from "react";
import { useI18n } from "./i18n";
import { useAuth } from "./AuthContext";
import { API } from "./api";
import SaleReportModal from "./SaleReportModal";
import "./RecentAnnouncements.css";
import "./AllAnnouncementsPage.css";

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(dateStr, t) {
  const diff = new Date(dateStr) - new Date();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return null;
  if (days === 0) return t("announcements.today");
  if (days === 1) return t("announcements.tomorrow");
  return t("announcements.inDays", { days });
}

export default function AllAnnouncementsPage({ onBack }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [interestStatus, setInterestStatus] = useState({});
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    const url = user ? API.USER_SALES_UPCOMING : API.SALES_UPCOMING;
    fetch(url, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setSales(data);
        const statusMap = {};
        data.forEach(s => { if (s.userStatus) statusMap[s.id] = s.userStatus; });
        setInterestStatus(statusMap);
      })
      .catch(() => setSales([]))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!selected) { setSelectedDetail(null); return; }
    fetch(API.SALE_PUBLIC(selected.id), { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setSelectedDetail(data);
        if (data?.userStatus != null) {
          setInterestStatus(prev => ({ ...prev, [selected.id]: data.userStatus }));
        }
      })
      .catch(() => setSelectedDetail(null));
  }, [selected]);

  const handleInterest = async (saleId, e) => {
    if (e) e.stopPropagation();
    if (!user) return;
    const current = interestStatus[saleId];
    const newStatus = current === "INTERESTED" ? null : "INTERESTED";
    try {
      const res = await fetch(API.USER_SALE_INTEREST(saleId), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setInterestStatus(prev => ({ ...prev, [saleId]: newStatus }));
      }
    } catch {}
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="all-ann-page">
      <div className="all-ann-header">
        <button className="all-ann-back" onClick={onBack}>← {t("account.back")}</button>
        <div className="all-ann-header-text">
          <h1 className="all-ann-title">{t("announcements.allTitle")}</h1>
          <p className="all-ann-subtitle">{t("announcements.subtitle")}</p>
        </div>
      </div>

      {loading ? (
        <p className="announcements-empty">{t("announcements.loading")}</p>
      ) : sales.length === 0 ? (
        <p className="announcements-empty">{t("announcements.noAnnouncements")}</p>
      ) : (
        <div className="all-ann-grid">
          {sales.map((item) => {
            const countdown = daysUntil(item.generalSaleDate || item.saleDate, t);
            const status = interestStatus[item.id];
            return (
              <article
                key={item.id}
                className="announcement-card"
                onClick={() => setSelected(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setSelected(item)}
              >
                <div className="announcement-img-wrap">
                  <img
                    className="announcement-img"
                    src={item.imageUrl || "https://placehold.co/280x420/071428/38d4f0?text=No+Cover"}
                    alt={item.title}
                    onError={(e) => { e.target.src = "https://placehold.co/280x420/071428/38d4f0?text=No+Cover"; }}
                  />
                  {item.companyName && (
                    <div className="announcement-ribbon">{item.companyName}</div>
                  )}
                  {countdown && (
                    <div className="announcement-countdown">{countdown}</div>
                  )}
                  {status === "INTERESTED" && (
                    <div className="announcement-interested-badge" title={t("announcements.interested")}>♥</div>
                  )}
                  {status === "BOUGHT" && (
                    <div className="announcement-interested-badge announcement-bought-badge" title={t("announcements.bought")}>✓</div>
                  )}
                </div>
                <div className="announcement-info">
                  {item.editionCount > 1 && (
                    <p className="announcement-edition">{item.editionCount} {t("announcements.editions")}</p>
                  )}
                  <h3 className="announcement-title-text">{item.title}</h3>
                  <p className="announcement-date">
                    <span className="announcement-date-label">{t("announcements.onSale")}</span>
                    {formatDate(item.generalSaleDate || item.saleDate)}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="announcements-suggest" style={{ marginTop: "2rem" }}>
        <span>{t("announcements.suggestTitle")} </span>
        <button className="announcements-suggest-link" onClick={() => setShowReport(true)}>
          {t("announcements.suggestLink")}
        </button>
      </div>

      {/* Sale detail modal */}
      {selected && (
        <div className="ann-modal-overlay" onClick={() => setSelected(null)}>
          <div className="ann-modal" onClick={(e) => e.stopPropagation()}>
            <button className="ann-modal-close" onClick={() => setSelected(null)} aria-label={t("announcements.close")}>✕</button>
            <div className="ann-modal-body">
              <div className="ann-modal-cover-wrap">
                <img
                  className="ann-modal-cover"
                  src={selected.imageUrl || "https://placehold.co/280x420/071428/38d4f0?text=No+Cover"}
                  alt={selected.title}
                  onError={(e) => { e.target.src = "https://placehold.co/280x420/071428/38d4f0?text=No+Cover"; }}
                />
                {selected.companyName && <div className="ann-modal-ribbon">{selected.companyName}</div>}
              </div>
              <div className="ann-modal-info">
                <h2 className="ann-modal-title">{selected.title}</h2>
                <div className="ann-modal-divider" />
                <div className="ann-modal-meta">
                  {selected.companyName && (
                    <div className="ann-modal-meta-row">
                      <span className="ann-modal-meta-label">{t("announcements.publisher")}</span>
                      <span className="ann-modal-meta-value">{selected.companyName}</span>
                    </div>
                  )}
                  <div className="ann-modal-meta-row">
                    <span className="ann-modal-meta-label">{t("announcements.saleDate")}</span>
                    <span className="ann-modal-meta-value">{formatDate(selected.generalSaleDate || selected.saleDate)}</span>
                  </div>
                  {daysUntil(selected.generalSaleDate || selected.saleDate, t) && (
                    <div className="ann-modal-meta-row">
                      <span className="ann-modal-meta-label">{t("announcements.countdown")}</span>
                      <span className="ann-modal-meta-value ann-modal-countdown">
                        {daysUntil(selected.generalSaleDate || selected.saleDate, t)}
                      </span>
                    </div>
                  )}
                  {selected.basePrice && (
                    <div className="ann-modal-meta-row">
                      <span className="ann-modal-meta-label">{t("announcements.price")}</span>
                      <span className="ann-modal-meta-value">{selected.basePrice} {selected.currency || ""}</span>
                    </div>
                  )}
                </div>

                {selectedDetail?.editions?.length > 0 && (
                  <div className="ann-modal-editions">
                    <p className="ann-modal-editions-label">{t("announcements.editions")}</p>
                    <ul className="ann-modal-editions-list">
                      {selectedDetail.editions.map(ed => (
                        <li key={ed.id}>
                          {ed.bookTitle || ed.editionId}
                          {ed.editionName ? <em> — {ed.editionName}</em> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selected.description && (
                  <p className="ann-modal-note">{selected.description}</p>
                )}

                <div className="ann-modal-actions">
                  {interestStatus[selected.id] === "BOUGHT" ? (
                    <span className="ann-modal-bought-badge">✓ {t("announcements.bought")}</span>
                  ) : user ? (
                    <button
                      className={`ann-modal-interest-btn${interestStatus[selected.id] === "INTERESTED" ? " active" : ""}`}
                      onClick={(e) => handleInterest(selected.id, e)}
                    >
                      {interestStatus[selected.id] === "INTERESTED"
                        ? `♥ ${t("announcements.removeInterest")}`
                        : `♡ ${t("announcements.interested")}`}
                    </button>
                  ) : (
                    <p className="ann-modal-login-hint">{t("announcements.loginToInterest")}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showReport && <SaleReportModal onClose={() => setShowReport(false)} />}
    </div>
  );
}
