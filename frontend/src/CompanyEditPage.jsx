import { useState } from "react";
import "./CompanyEditPage.css";
import { useI18n } from "./i18n";

function emptySub() {
  return {
    id: crypto.randomUUID(),
    name: "",
    logoUrl: "",
    basePrice: "",
    shipsInternationally: true,
    shippingCountries: [],
    type: "MONTHLY",
    genres: [],
    bookishMerch: false,
  };
}

function normalizeSub(sub) {
  if (typeof sub === "string") {
    return { id: crypto.randomUUID(), name: sub, logoUrl: "", basePrice: "", shipsInternationally: true, shippingCountries: [], type: "MONTHLY", genres: [], bookishMerch: false };
  }
  return {
    id: sub.id || crypto.randomUUID(),
    name: sub.name || "",
    logoUrl: sub.logoUrl || "",
    basePrice: sub.basePrice != null ? String(sub.basePrice) : "",
    shipsInternationally: sub.shipsInternationally !== false,
    shippingCountries: sub.shippingCountries ? [...sub.shippingCountries] : [],
    type: sub.type || "MONTHLY",
    genres: sub.genres ? [...sub.genres] : [],
    bookishMerch: !!sub.bookishMerch,
  };
}

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
    subscriptions: data.subscriptions ? data.subscriptions.map(normalizeSub) : [],
    managerUsernames: data.managerUsernames ? [...data.managerUsernames] : [],
  };
}

function SubCard({ sub, idx, t, onChange, onRemove }) {
  const [expanded, setExpanded] = useState(false);

  const setField = (key, value) => onChange(idx, { ...sub, [key]: value });

  const setCountry = (ci, val) => {
    const arr = [...sub.shippingCountries];
    arr[ci] = val;
    setField("shippingCountries", arr);
  };
  const addCountry = () => setField("shippingCountries", [...sub.shippingCountries, ""]);
  const removeCountry = (ci) => setField("shippingCountries", sub.shippingCountries.filter((_, i) => i !== ci));

  const setGenre = (gi, val) => {
    const arr = [...sub.genres];
    arr[gi] = val;
    setField("genres", arr);
  };
  const addGenre = () => setField("genres", [...sub.genres, ""]);
  const removeGenre = (gi) => setField("genres", sub.genres.filter((_, i) => i !== gi));

  return (
    <div className="sub-card">
      <div className="sub-card-header">
        <button className="sub-card-toggle" type="button" onClick={() => setExpanded((e) => !e)}>
          <span className="sub-card-name">{sub.name || <em style={{ color: "#547898" }}>{t("company.sub.name")}</em>}</span>
          <span className="sub-card-chevron">{expanded ? "▲" : "▼"}</span>
        </button>
        <button className="company-edit-remove-btn" type="button" onClick={() => onRemove(idx)}>&#x2715;</button>
      </div>
      {expanded && (
        <div className="sub-card-body">
          <label className="company-edit-label">
            {t("company.sub.name")} *
            <input className="company-edit-input" value={sub.name} onChange={(e) => setField("name", e.target.value)} />
          </label>
          <label className="company-edit-label">
            {t("company.sub.logo")}
            <input className="company-edit-input" value={sub.logoUrl} onChange={(e) => setField("logoUrl", e.target.value)} placeholder="https://..." />
          </label>
          <label className="company-edit-label">
            {t("company.sub.price")}
            <input className="company-edit-input" type="number" step="0.01" min="0" value={sub.basePrice} onChange={(e) => setField("basePrice", e.target.value)} />
          </label>
          <label className="company-edit-label">
            {t("company.sub.type")}
            <select className="company-edit-select" value={sub.type} onChange={(e) => setField("type", e.target.value)}>
              <option value="MONTHLY">{t("company.sub.typeMonthly")}</option>
              <option value="BI_MONTHLY">{t("company.sub.typeBiMonthly")}</option>
              <option value="QUARTERLY">{t("company.sub.typeQuarterly")}</option>
            </select>
          </label>
          <label className="company-edit-label company-edit-label--checkbox">
            <input type="checkbox" checked={sub.shipsInternationally} onChange={(e) => setField("shipsInternationally", e.target.checked)} />
            {t("company.sub.shipsIntl")}
          </label>
          {!sub.shipsInternationally && (
            <div className="sub-card-sublist">
              <span className="company-edit-label">{t("company.sub.shippingCountries")}</span>
              {sub.shippingCountries.map((c, ci) => (
                <div key={ci} className="company-edit-dynamic-row">
                  <input className="company-edit-input company-edit-url-input" value={c} onChange={(e) => setCountry(ci, e.target.value)} />
                  <button className="company-edit-remove-btn" type="button" onClick={() => removeCountry(ci)}>&#x2715;</button>
                </div>
              ))}
              <button className="company-edit-add-btn" type="button" onClick={addCountry}>{t("company.sub.addCountry")}</button>
            </div>
          )}
          <div className="sub-card-sublist">
            <span className="company-edit-label">{t("company.sub.genres")}</span>
            {sub.genres.map((g, gi) => (
              <div key={gi} className="company-edit-dynamic-row">
                <input className="company-edit-input company-edit-url-input" value={g} onChange={(e) => setGenre(gi, e.target.value)} />
                <button className="company-edit-remove-btn" type="button" onClick={() => removeGenre(gi)}>&#x2715;</button>
              </div>
            ))}
            <button className="company-edit-add-btn" type="button" onClick={addGenre}>{t("company.sub.addGenre")}</button>
          </div>
          <label className="company-edit-label company-edit-label--checkbox">
            <input type="checkbox" checked={sub.bookishMerch} onChange={(e) => setField("bookishMerch", e.target.checked)} />
            {t("company.sub.bookishMerch")}
          </label>
        </div>
      )}
    </div>
  );
}

export default function CompanyEditPage({ initialData, onSaved, onBack, user }) {
  const { t } = useI18n();
  const [form, setForm] = useState(() => toForm(initialData));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const onSubChange = (idx, updated) => setForm((f) => {
    const arr = [...f.subscriptions];
    arr[idx] = updated;
    return { ...f, subscriptions: arr };
  });
  const addSub = () => setForm((f) => ({ ...f, subscriptions: [...f.subscriptions, emptySub()] }));
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
      subscriptions: form.subscriptions
        .filter((s) => s.name && s.name.trim() !== "")
        .map((s) => ({
          id: s.id,
          name: s.name,
          logoUrl: s.logoUrl || null,
          basePrice: s.basePrice !== "" ? parseFloat(s.basePrice) : null,
          shipsInternationally: s.shipsInternationally,
          shippingCountries: s.shippingCountries.filter((c) => c.trim() !== ""),
          type: s.type,
          genres: s.genres.filter((g) => g.trim() !== ""),
          bookishMerch: s.bookishMerch,
        })),
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
            <SubCard key={sub.id} sub={sub} idx={idx} t={t} onChange={onSubChange} onRemove={removeSub} />
          ))}
          <button className="company-edit-add-btn" type="button" onClick={addSub}>
            {t("company.addSub")}
          </button>
        </div>

        <div className="company-edit-section">
          <h3 className="company-edit-section-title">{t("company.managers")}</h3>
          <p className="company-edit-section-note">{t("company.managersNote")}</p>
          {user?.username === "admin" ? (
            <>
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
            </>
          ) : (
            <ul className="company-edit-managers-readonly">
              {form.managerUsernames.length === 0
                ? <li className="company-edit-managers-empty">{t("company.managersEmpty")}</li>
                : form.managerUsernames.map((mgr, idx) => (
                    <li key={idx} className="company-edit-manager-item">&#128100; {mgr}</li>
                  ))
              }
            </ul>
          )}
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
