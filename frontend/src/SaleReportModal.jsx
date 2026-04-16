import { useState } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import { API } from "./api";
import LoginModal from "./LoginModal";
import "./ReportModals.css";

export default function SaleReportModal({ onClose }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) { setError(t("announcements.suggestUrlLabel") + " is required"); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(API.ADMIN_DATA_REQUESTS, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: url.trim(),
          type: "sale_announcement",
          description: description.trim(),
          imageUrls: [],
        }),
      });
      if (res.ok) {
        setSuccess(true);
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || t("report.submitError"));
      }
    } catch {
      setError(t("report.submitError"));
    }
    setSubmitting(false);
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-box report-modal" onClick={e => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>✕</button>

          {success ? (
            <div className="report-success">
              <div className="report-success-icon">✓</div>
              <h3>{t("report.successTitle")}</h3>
              <p>{t("report.successMessage")}</p>
              <button className="modal-btn primary" onClick={onClose}>{t("report.close")}</button>
            </div>
          ) : !user ? (
            <div className="report-login-gate">
              <div className="report-login-gate-icon">🔒</div>
              <h3 className="report-login-gate-title">{t("dataRequest.loginGateTitle")}</h3>
              <p className="report-login-gate-desc">{t("dataRequest.loginGateDesc")}</p>
              <button className="modal-btn primary" onClick={() => setShowLogin(true)}>
                {t("user.login")}
              </button>
            </div>
          ) : (
            <>
              <h2 className="report-modal-title">🛒 {t("announcements.suggestModalTitle")}</h2>
              <p className="report-reporter">{t("report.reporterLabel")}: <strong>{user.username}</strong></p>
              <form onSubmit={handleSubmit} className="modal-form">
                <label>
                  {t("announcements.suggestUrlLabel")} <span className="required">*</span>
                  <input
                    type="url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    maxLength={500}
                    placeholder={t("announcements.suggestUrlPlaceholder")}
                    autoFocus
                  />
                </label>
                <label>
                  {t("announcements.suggestDescLabel")}
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder="e.g. FairyLoot May 2026 trilogy sale..."
                  />
                </label>
                {error && <p className="modal-error">{error}</p>}
                <button type="submit" className="modal-btn primary" disabled={submitting}>
                  {submitting ? t("report.submitting") : t("report.submit")}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
}
