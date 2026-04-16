import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import { API } from "./api";
import "./FaqPage.css";

export default function StaticPage({ pageKey, titleKey, onBack }) {
  const { user } = useAuth();
  const { t }    = useI18n();
  const isAdmin  = user?.role === "admin";

  const [content,  setContent]  = useState("");
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [draft,    setDraft]    = useState("");
  const [saving,   setSaving]   = useState(false);
  const [saveOk,   setSaveOk]   = useState(false);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(API.PAGE(pageKey), { credentials: "include" })
      .then(r => r.json())
      .then(d => { setContent(d.content || ""); setLoading(false); })
      .catch(() => { setError(t("staticPage.loadError")); setLoading(false); });
  }, [pageKey]);

  const startEdit = () => { setDraft(content); setEditing(true); setSaveOk(false); };
  const cancelEdit = () => setEditing(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(API.ADMIN_PAGE(pageKey), {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      if (res.ok) {
        const d = await res.json();
        setContent(d.content);
        setEditing(false);
        setSaveOk(true);
        setTimeout(() => setSaveOk(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  const TITLE_ICONS = { privacy_policy: "🔒", terms_of_use: "📜" };
  const icon = TITLE_ICONS[pageKey] || "📄";

  return (
    <div className="static-page">
      <div className="static-page-inner">
        <div className="static-page-top">
          <button className="detail-back-btn" onClick={onBack}>{t("back")}</button>
          {isAdmin && !editing && (
            <button className="static-page-edit-btn" onClick={startEdit}>
              ✏ {t("staticPage.edit")}
            </button>
          )}
          {saveOk && <span className="static-page-save-ok">✓ {t("staticPage.saved")}</span>}
        </div>

        <h1 className="static-page-title">{icon} {t(titleKey)}</h1>

        {loading ? (
          <div className="status-container"><div className="spinner" /></div>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : editing ? (
          <div className="static-page-editor">
            <p className="static-page-editor-hint">{t("staticPage.htmlHint")}</p>
            <textarea
              className="static-page-textarea"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={24}
              spellCheck={false}
            />
            <div className="static-page-editor-actions">
              <button className="page-btn primary" onClick={save} disabled={saving}>
                {saving ? t("staticPage.saving") : t("staticPage.save")}
              </button>
              <button className="page-btn" onClick={cancelEdit} disabled={saving}>
                {t("staticPage.cancel")}
              </button>
            </div>
          </div>
        ) : content ? (
          <div
            className="static-page-content"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <p className="faq-empty">
            {t("staticPage.empty")}
            {isAdmin && (
              <> — <button className="faq-add-btn" style={{ display: "inline" }} onClick={startEdit}>
                {t("staticPage.addContent")}
              </button></>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
