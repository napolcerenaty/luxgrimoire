import { useState } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import { API } from "./api";
import LoginModal from "./LoginModal";
import "./ReportModals.css";

const REQUEST_TYPES = ["book", "subscription", "company", "other"];

export default function DataRequestModal({ onClose }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("book");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  const handleImageAdd = async (e) => {
    const file = e.target.files[0];
    if (!file || images.length >= 3) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(API.UPLOAD_IMAGE, { method: "POST", credentials: "include", body: form });
      const data = await res.json();
      if (res.ok) setImages(prev => [...prev, { file, url: data.url }]);
      else setError(data.error || t("report.uploadError"));
    } catch {
      setError(t("report.uploadError"));
    }
    setUploading(false);
    e.target.value = "";
  };

  const removeImage = (idx) => setImages(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setError(t("report.titleRequired")); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(API.ADMIN_DATA_REQUESTS, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          type,
          description,
          imageUrls: images.map(i => i.url),
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
              <h2 className="report-modal-title">📋 {t("dataRequest.title")}</h2>
              <p className="report-reporter">{t("report.reporterLabel")}: <strong>{user.username}</strong></p>
              <form onSubmit={handleSubmit} className="modal-form">
                <label>
                  {t("report.titleLabel")} <span className="required">*</span>
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                    maxLength={200} placeholder={t("dataRequest.titlePlaceholder")} autoFocus />
                </label>
                <label>
                  {t("dataRequest.typeLabel")}
                  <select value={type} onChange={e => setType(e.target.value)}>
                    {REQUEST_TYPES.map(ty => (
                      <option key={ty} value={ty}>{t(`dataRequest.type_${ty}`)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("report.descriptionLabel")}
                  <textarea value={description} onChange={e => setDescription(e.target.value)}
                    rows={4} maxLength={2000} placeholder={t("dataRequest.descriptionPlaceholder")} />
                </label>

                <div className="report-images-section">
                  <span className="report-images-label">{t("report.imagesLabel")} ({images.length}/3)</span>
                  <div className="report-images-row">
                    {images.map((img, i) => (
                      <div key={i} className="report-image-thumb">
                        <img src={img.url.startsWith("http") ? img.url : `${API.BASE}${img.url}`} alt="" />
                        <button type="button" className="report-image-remove" onClick={() => removeImage(i)}>✕</button>
                      </div>
                    ))}
                    {images.length < 3 && (
                      <label className="report-image-add" title={t("report.addImage")}>
                        {uploading ? "…" : "+"}
                        <input type="file" accept="image/*" hidden onChange={handleImageAdd} disabled={uploading} />
                      </label>
                    )}
                  </div>
                </div>

                {error && <p className="modal-error">{error}</p>}
                <button type="submit" className="modal-btn primary" disabled={submitting || uploading}>
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
