import { useState } from "react";
import "./CompanyEditPage.css";
import { useI18n } from "./i18n";

function emptyForm() {
  return {
    name: "",
    logoUrl: "",
    websiteUrl: "",
    description: "",
    location: "",
    defaultCurrency: "",
    subscriptions: [],
    managerUsernames: [],
  };
}

function toForm(data) {
  if (!data) return emptyForm();
  return {
    name: data.name || "",
    logoUrl: data.logoUrl || "",
    websiteUrl: data.websiteUrl || "",
    description: data.description || "",
    location: data.location || "",
    defaultCurrency: data.defaultCurrency || "",
    subscriptions: data.subscriptions ? [...data.subscriptions] : [],
    managerUsernames: data.managerUsernames ? [...data.managerUsernames] : [],
  };
}

export default function CompanyEditPage({ initialData, onSaved, onBack, user }) {
  const { t } = useI18n();
  const [form, setForm] = useState(() => toForm(initialData));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const setSub = (idx, value) => setForm((f) => {
    const arr = [...f.subscriptions];
    arr[idx] = value;
    return { ...f, subscriptions: arr };
  });
  const addSub = () => setForm((f) => ({ ...f, subscriptions: [...f.subscriptions, ""] }));
  const removeSub = (idx) => setForm((f) => ({ ...f, subscriptions: f.subscriptions.filter((_, i) => i !== idx) }));

  const setMgr = (idx, value) => setForm((f) => {
    const arr = [...f.managerUsernames];
    arr[idx] = value;
    return { ...f, managerUsernames: arr };
  });
  const addMgr = () => setForm((f) => ({ ...f, managerUsernames: [...f.managerUsernames, ""] }));
  const removeMgr = (idx) => setForm((f) => ({ ...f, managerUsernames: f.managerUsernames.filter((_, i) => i !== idx) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      name: form.name || null,
      logoUrl: form.logoUrl || null,
      websiteUrl: form.websiteUrl || null,
      description: form.description || null,
      location: form.location || null,
      defaultCurrency: form.defaultCurrency || null,
      subscriptions: form.subscriptions.filter((s) => s.trim() !== ""),
      managerUsernames: form.managerUsernames,
    };

    const isEdit = initialData && initialData.id;
    const url = isEdit
      ? `http://localhost:8080/api/companies/${initialData.id}`
      : "http://localhost:8080/api/companies";
    const method = isEdit ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const result = await res.json();
      onSaved(result);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="company-edit-page">
      <div className="company-edit-header">
        <button className="company-edit-back-btn" type="button" onClick={onBack}>{t("back")}</button>
        <h2 className="company-edit-heading">
          {initialData && initialData.id ? t("company.editBtn") : t("company.newBtn")}
        </h2>
      </div>

      {error && <p className="company-edit-error">{error}</p>}

      <form className="company-edit-form" onSubmit={handleSubmit}>
        <div className="company-edit-grid">
          <label className="company-edit-label">
            {t("company.name")} *
            <input
              className="company-edit-input"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </label>
          <label className="company-edit-label">
            {t("company.logo")}
            <input
              className="company-edit-input"
              value={form.logoUrl}
              onChange={(e) => set("logoUrl", e.target.value)}
              placeholder="https://..."
            />
          </label>
          <label className="company-edit-label">
            {t("company.website")}
            <input
              className="company-edit-input"
              value={form.websiteUrl}
              onChange={(e) => set("websiteUrl", e.target.value)}
              placeholder="https://..."
            />
          </label>
          <label className="company-edit-label">
            {t("company.location")}
            <input
              className="company-edit-input"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
            />
          </label>
          <label className="company-edit-label">
            {t("company.currency")}
            <input
              className="company-edit-input"
              value={form.defaultCurrency}
              onChange={(e) => set("defaultCurrency", e.target.value)}
              placeholder="USD"
            />
          </label>
          <label className="company-edit-label company-edit-label--full">
            {t("company.description")}
            <textarea
              className="company-edit-textarea"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
            />
          </label>
        </div>

        <div className="company-edit-section">
          <h3 className="company-edit-section-title">{t("company.subscriptions")}</h3>
          {form.subscriptions.map((sub, idx) => (
            <div key={idx} className="company-edit-dynamic-row">
              <input
                className="company-edit-input company-edit-url-input"
                value={sub}
                onChange={(e) => setSub(idx, e.target.value)}
              />
              <button className="company-edit-remove-btn" type="button" onClick={() => removeSub(idx)}>&#x2715;</button>
            </div>
          ))}
          <button className="company-edit-add-btn" type="button" onClick={addSub}>
            {t("company.addSub")}
          </button>
        </div>

        <div className="company-edit-section">
          <h3 className="company-edit-section-title">{t("company.managers")}</h3>
          <p className="company-edit-section-note">{t("company.managersNote")}</p>
          {form.managerUsernames.map((mgr, idx) => (
            <div key={idx} className="company-edit-dynamic-row">
              <input
                className="company-edit-input company-edit-url-input"
                value={mgr}
                placeholder={t("company.managerPlaceholder")}
                onChange={(e) => setMgr(idx, e.target.value)}
              />
              <button className="company-edit-remove-btn" type="button" onClick={() => removeMgr(idx)}>&#x2715;</button>
            </div>
          ))}
          <button className="company-edit-add-btn" type="button" onClick={addMgr}>
            {t("company.addManager")}
          </button>
        </div>

        <div className="company-edit-form-actions">
          <button className="company-edit-submit-btn" type="submit" disabled={saving}>
            {saving ? t("company.saving") : t("company.saveBtn")}
          </button>
          <button className="company-edit-cancel-btn" type="button" onClick={onBack} disabled={saving}>
            {t("company.cancelBtn")}
          </button>
        </div>
      </form>
    </div>
  );
}
