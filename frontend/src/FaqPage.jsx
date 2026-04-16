import { useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import { API } from "./api";
import "./FaqPage.css";

// ── Language definitions ──────────────────────────────────────────────────────
const LANGS = [
  { code: "pl", flag: "🇵🇱", label: "PL" },
  { code: "en", flag: "🇬🇧", label: "EN" },
  { code: "de", flag: "🇩🇪", label: "DE" },
  { code: "fr", flag: "🇫🇷", label: "FR" },
  { code: "es", flag: "🇪🇸", label: "ES" },
];

/** Resolve the best text from an i18n map, with fallback chain */
function resolveText(i18nMap, lang, fallback) {
  if (!i18nMap) return fallback || "";
  return i18nMap[lang]
    || i18nMap["en"]
    || i18nMap["pl"]
    || Object.values(i18nMap).find(v => v)
    || fallback
    || "";
}

// ── I18n editable field (with language tabs) ─────────────────────────────────
function I18nEdit({ map, onSave, multiline = false, placeholder = "", displayLang }) {
  const [editing,  setEditing]  = useState(false);
  const [activeLang, setActiveLang] = useState(LANGS[0].code);
  const [draft,    setDraft]    = useState({});
  const ref = useRef(null);

  useEffect(() => {
    if (editing && ref.current) ref.current.focus();
  }, [editing, activeLang]);

  const open = () => {
    setDraft({ ...(map || {}) });
    setActiveLang(LANGS[0].code);
    setEditing(true);
  };
  const cancel = () => setEditing(false);
  const commit = () => {
    onSave(draft);
    setEditing(false);
  };

  const display = resolveText(map, displayLang, "");

  if (!editing) return (
    <span className="faq-inline-view" onClick={open}>
      {display || <em className="faq-placeholder">{placeholder}</em>}
      <span className="faq-edit-hint">✏</span>
    </span>
  );

  return (
    <div className="faq-i18n-edit-wrap">
      <div className="faq-i18n-tabs">
        {LANGS.map(l => (
          <button
            key={l.code}
            type="button"
            className={`faq-i18n-tab${activeLang === l.code ? " active" : ""}${draft[l.code] ? " filled" : ""}`}
            onClick={() => setActiveLang(l.code)}
          >
            {l.flag} {l.label}
          </button>
        ))}
      </div>
      {multiline ? (
        <textarea
          ref={ref}
          className="faq-inline-textarea"
          rows={4}
          value={draft[activeLang] || ""}
          placeholder={placeholder}
          onChange={e => setDraft(d => ({ ...d, [activeLang]: e.target.value }))}
          onKeyDown={e => { if (e.key === "Escape") cancel(); }}
        />
      ) : (
        <input
          ref={ref}
          className="faq-inline-input"
          type="text"
          value={draft[activeLang] || ""}
          placeholder={placeholder}
          onChange={e => setDraft(d => ({ ...d, [activeLang]: e.target.value }))}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
        />
      )}
      <div className="faq-inline-actions">
        <button type="button" className="faq-action-save" onClick={commit}>✓</button>
        <button type="button" className="faq-action-cancel" onClick={cancel}>✕</button>
      </div>
    </div>
  );
}

// ── New item / category form ──────────────────────────────────────────────────
function AddItemForm({ onAdd, onCancel, t }) {
  const [activeLang, setActiveLang] = useState(LANGS[0].code);
  const [qMap, setQMap] = useState({});
  const [aMap, setAMap] = useState({});

  const submit = (e) => {
    e.preventDefault();
    const hasQ = Object.values(qMap).some(v => v?.trim());
    if (!hasQ) return;
    onAdd(qMap, aMap);
  };

  return (
    <form className="faq-add-item-form" onSubmit={submit}>
      <div className="faq-i18n-tabs">
        {LANGS.map(l => (
          <button key={l.code} type="button"
            className={`faq-i18n-tab${activeLang === l.code ? " active" : ""}${qMap[l.code] ? " filled" : ""}`}
            onClick={() => setActiveLang(l.code)}>
            {l.flag} {l.label}
          </button>
        ))}
      </div>
      <input className="faq-inline-input" type="text" autoFocus
        placeholder={t("faq.questionPlaceholder")}
        value={qMap[activeLang] || ""}
        onChange={e => setQMap(m => ({ ...m, [activeLang]: e.target.value }))} />
      <textarea className="faq-inline-textarea" rows={3}
        placeholder={t("faq.answerPlaceholder")}
        value={aMap[activeLang] || ""}
        onChange={e => setAMap(m => ({ ...m, [activeLang]: e.target.value }))} />
      <div className="faq-inline-actions">
        <button type="submit" className="faq-action-save">{t("faq.add")}</button>
        <button type="button" className="faq-action-cancel" onClick={onCancel}>✕</button>
      </div>
    </form>
  );
}

function AddCategoryForm({ onAdd, onCancel, t }) {
  const [activeLang, setActiveLang] = useState(LANGS[0].code);
  const [titleMap, setTitleMap] = useState({});

  const submit = (e) => {
    e.preventDefault();
    const hasTitle = Object.values(titleMap).some(v => v?.trim());
    if (!hasTitle) return;
    onAdd(titleMap);
  };

  return (
    <form className="faq-add-category-form" onSubmit={submit}>
      <div className="faq-i18n-tabs">
        {LANGS.map(l => (
          <button key={l.code} type="button"
            className={`faq-i18n-tab${activeLang === l.code ? " active" : ""}${titleMap[l.code] ? " filled" : ""}`}
            onClick={() => setActiveLang(l.code)}>
            {l.flag} {l.label}
          </button>
        ))}
      </div>
      <input className="faq-inline-input" type="text" autoFocus
        placeholder={t("faq.categoryPlaceholder")}
        value={titleMap[activeLang] || ""}
        onChange={e => setTitleMap(m => ({ ...m, [activeLang]: e.target.value }))}
        onKeyDown={e => { if (e.key === "Escape") onCancel(); }} />
      <div className="faq-inline-actions">
        <button type="submit" className="faq-action-save">{t("faq.add")}</button>
        <button type="button" className="faq-action-cancel" onClick={onCancel}>✕</button>
      </div>
    </form>
  );
}

// ── FAQ Item row ──────────────────────────────────────────────────────────────
function FaqItemRow({ item, isAdmin, onUpdateQuestion, onUpdateAnswer, onDelete, displayLang }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  const questionText = resolveText(item.questionI18n, displayLang, item.question);
  const answerText   = resolveText(item.answerI18n,   displayLang, item.answer);

  return (
    <div className={`faq-item${open ? " faq-item--open" : ""}`}>
      <div className="faq-item-header" onClick={() => !isAdmin && setOpen(o => !o)}>
        <div className="faq-item-q-wrap">
          {isAdmin ? (
            <I18nEdit
              map={item.questionI18n || {}}
              displayLang={displayLang}
              placeholder={t("faq.questionPlaceholder")}
              onSave={onUpdateQuestion}
            />
          ) : (
            <span className="faq-item-q">{questionText}</span>
          )}
        </div>
        <div className="faq-item-header-right">
          {isAdmin && (
            <button className="faq-admin-delete" title={t("faq.deleteItem")}
              onClick={e => { e.stopPropagation(); onDelete(); }}>🗑</button>
          )}
          {!isAdmin && <span className="faq-chevron">{open ? "▲" : "▼"}</span>}
          {isAdmin && (
            <button className="faq-chevron-btn" title={t("faq.toggleAnswer")}
              onClick={() => setOpen(o => !o)}>{open ? "▲" : "▼"}</button>
          )}
        </div>
      </div>
      {open && (
        <div className="faq-item-body">
          {isAdmin ? (
            <I18nEdit
              map={item.answerI18n || {}}
              displayLang={displayLang}
              placeholder={t("faq.answerPlaceholder")}
              multiline
              onSave={onUpdateAnswer}
            />
          ) : (
            <p className="faq-item-a">{answerText}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main FAQ Page ─────────────────────────────────────────────────────────────
export default function FaqPage({ onBack }) {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const isAdmin  = user?.role === "admin";

  const [categories,   setCategories]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [addingItemTo, setAddingItemTo] = useState(null);
  const [addingCat,    setAddingCat]    = useState(false);

  const load = () => {
    setLoading(true);
    fetch(API.FAQ, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setCategories(d); setLoading(false); })
      .catch(() => { setError(t("faq.loadError")); setLoading(false); });
  };

  useEffect(load, []);

  // ── Category actions ────────────────────────────────────────────────────────
  const handleAddCategory = async (titleI18n) => {
    const title = titleI18n.pl || titleI18n.en || Object.values(titleI18n).find(v => v) || "";
    await fetch(API.ADMIN_FAQ_CATEGORIES, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, titleI18n }),
    });
    setAddingCat(false);
    load();
  };

  const handleUpdateCategory = async (id, titleI18n) => {
    const title = titleI18n.pl || titleI18n.en || Object.values(titleI18n).find(v => v) || "";
    await fetch(API.ADMIN_FAQ_CATEGORY(id), {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, titleI18n }),
    });
    load();
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm(t("faq.confirmDeleteCategory"))) return;
    await fetch(API.ADMIN_FAQ_CATEGORY(id), { method: "DELETE", credentials: "include" });
    load();
  };

  // ── Item actions ────────────────────────────────────────────────────────────
  const handleAddItem = async (catId, questionI18n, answerI18n) => {
    const question = questionI18n.pl || questionI18n.en || Object.values(questionI18n).find(v => v) || "";
    const answer   = answerI18n.pl   || answerI18n.en   || Object.values(answerI18n).find(v => v)   || "";
    await fetch(API.ADMIN_FAQ_ITEMS(catId), {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer, questionI18n, answerI18n }),
    });
    setAddingItemTo(null);
    load();
  };

  const handleUpdateItem = async (id, patch) => {
    await fetch(API.ADMIN_FAQ_ITEM(id), {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    load();
  };

  const handleDeleteItem = async (id) => {
    if (!window.confirm(t("faq.confirmDeleteItem"))) return;
    await fetch(API.ADMIN_FAQ_ITEM(id), { method: "DELETE", credentials: "include" });
    load();
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="static-page faq-page">
      <div className="static-page-inner">
        <div className="static-page-top">
          <button className="detail-back-btn" onClick={onBack}>{t("back")}</button>
          {isAdmin && (
            <span className="faq-admin-badge">{t("faq.adminMode")}</span>
          )}
        </div>

        <h1 className="static-page-title">❓ {t("faq.title")}</h1>

        {loading ? (
          <div className="status-container"><div className="spinner" /></div>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : (
          <>
            {categories.length === 0 && !isAdmin && (
              <p className="faq-empty">{t("faq.empty")}</p>
            )}

            {categories.map(cat => {
              const catTitle = resolveText(cat.titleI18n, lang, cat.title);
              return (
                <section key={cat.id} className="faq-category">
                  <div className="faq-category-header">
                    {isAdmin ? (
                      <>
                        <I18nEdit
                          map={cat.titleI18n || {}}
                          displayLang={lang}
                          placeholder={t("faq.categoryPlaceholder")}
                          onSave={titleI18n => handleUpdateCategory(cat.id, titleI18n)}
                        />
                        <button className="faq-admin-delete faq-admin-delete--cat"
                          title={t("faq.deleteCategory")}
                          onClick={() => handleDeleteCategory(cat.id)}>🗑</button>
                      </>
                    ) : (
                      <h2 className="faq-category-title">{catTitle}</h2>
                    )}
                  </div>

                  <div className="faq-items">
                    {cat.items.map(item => (
                      <FaqItemRow
                        key={item.id}
                        item={item}
                        isAdmin={isAdmin}
                        displayLang={lang}
                        onUpdateQuestion={qMap => handleUpdateItem(item.id, {
                          question: qMap.pl || qMap.en || Object.values(qMap).find(v => v) || "",
                          questionI18n: qMap,
                        })}
                        onUpdateAnswer={aMap => handleUpdateItem(item.id, {
                          answer: aMap.pl || aMap.en || Object.values(aMap).find(v => v) || "",
                          answerI18n: aMap,
                        })}
                        onDelete={() => handleDeleteItem(item.id)}
                      />
                    ))}

                    {isAdmin && addingItemTo === cat.id && (
                      <AddItemForm t={t}
                        onAdd={(qMap, aMap) => handleAddItem(cat.id, qMap, aMap)}
                        onCancel={() => setAddingItemTo(null)} />
                    )}

                    {isAdmin && addingItemTo !== cat.id && (
                      <button className="faq-add-btn"
                        onClick={() => setAddingItemTo(cat.id)}>
                        + {t("faq.addQuestion")}
                      </button>
                    )}
                  </div>
                </section>
              );
            })}

            {isAdmin && (
              <div className="faq-add-category-wrap">
                {addingCat ? (
                  <AddCategoryForm t={t}
                    onAdd={handleAddCategory}
                    onCancel={() => setAddingCat(false)} />
                ) : (
                  <button className="faq-add-category-btn"
                    onClick={() => setAddingCat(true)}>
                    + {t("faq.addCategory")}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
