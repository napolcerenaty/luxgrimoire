import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { API } from "./api";
import "./AccountPage.css";
import "./AdminPage.css";

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: "companies",     icon: "📦", label: "Book Boxy"          },
  { key: "users",         icon: "👥", label: "Użytkownicy"        },
  { key: "reports",       icon: "🐛", label: "Zgłoszenia błędów"  },
  { key: "data-requests", icon: "📋", label: "Requesty danych"    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StatusBadge({ value }) {
  return <span className={`admin-status-badge ${value}`}>{value}</span>;
}

function RoleBadge({ value }) {
  return <span className={`admin-role-badge ${value}`}>{value}</span>;
}

function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  return (
    <div className="admin-pagination">
      <button onClick={() => onPage(0)} disabled={page === 0}>«</button>
      <button onClick={() => onPage(page - 1)} disabled={page === 0}>‹</button>
      <span className="current-page">{page + 1} / {totalPages}</span>
      <button onClick={() => onPage(page + 1)} disabled={page >= totalPages - 1}>›</button>
      <button onClick={() => onPage(totalPages - 1)} disabled={page >= totalPages - 1}>»</button>
    </div>
  );
}

// ─── Data: Countries & Currencies ────────────────────────────────────────────
const COUNTRIES = [
  { code: "PL", name: "Polska" }, { code: "US", name: "USA" }, { code: "GB", name: "Wielka Brytania" },
  { code: "DE", name: "Niemcy" }, { code: "FR", name: "Francja" }, { code: "ES", name: "Hiszpania" },
  { code: "IT", name: "Włochy" }, { code: "NL", name: "Holandia" }, { code: "SE", name: "Szwecja" },
  { code: "NO", name: "Norwegia" }, { code: "DK", name: "Dania" }, { code: "FI", name: "Finlandia" },
  { code: "CZ", name: "Czechy" }, { code: "SK", name: "Słowacja" }, { code: "HU", name: "Węgry" },
  { code: "RO", name: "Rumunia" }, { code: "AT", name: "Austria" }, { code: "BE", name: "Belgia" },
  { code: "CH", name: "Szwajcaria" }, { code: "PT", name: "Portugalia" }, { code: "IE", name: "Irlandia" },
  { code: "CA", name: "Kanada" }, { code: "AU", name: "Australia" }, { code: "NZ", name: "Nowa Zelandia" },
  { code: "JP", name: "Japonia" }, { code: "KR", name: "Korea Pd." }, { code: "CN", name: "Chiny" },
  { code: "IN", name: "Indie" }, { code: "BR", name: "Brazylia" }, { code: "ZA", name: "RPA" },
];

const CURRENCIES = [
  { code: "PLN", name: "Złoty polski (PLN)" }, { code: "USD", name: "Dolar amerykański (USD)" },
  { code: "EUR", name: "Euro (EUR)" }, { code: "GBP", name: "Funt brytyjski (GBP)" },
  { code: "SEK", name: "Korona szwedzka (SEK)" }, { code: "NOK", name: "Korona norweska (NOK)" },
  { code: "DKK", name: "Korona duńska (DKK)" }, { code: "CZK", name: "Korona czeska (CZK)" },
  { code: "HUF", name: "Forint węgierski (HUF)" }, { code: "CHF", name: "Frank szwajcarski (CHF)" },
  { code: "CAD", name: "Dolar kanadyjski (CAD)" }, { code: "AUD", name: "Dolar australijski (AUD)" },
  { code: "JPY", name: "Jen japoński (JPY)" }, { code: "RON", name: "Lej rumuński (RON)" },
];

const SUB_TYPES = [
  { value: "MONTHLY",    label: "Miesięczna (MONTHLY)" },
  { value: "BI_MONTHLY", label: "Co dwa miesiące (BI_MONTHLY)" },
  { value: "QUARTERLY",  label: "Kwartalna (QUARTERLY)" },
];

// ─── ImageUpload ──────────────────────────────────────────────────────────────
function ImageUpload({ label, currentUrl, onChange }) {
  const preview = currentUrl
    ? (currentUrl.startsWith("http") || currentUrl.startsWith("blob:") ? currentUrl : `${API.BASE}${currentUrl}`)
    : null;
  return (
    <div className="admin-form-row">
      <label className="admin-form-label">{label}</label>
      <div className="admin-image-upload">
        {preview && (
          <img src={preview} alt="" className="admin-image-preview"
            onError={e => { e.target.style.display = "none"; }} />
        )}
        <label className="admin-image-upload-btn">
          {preview ? "Zmień zdjęcie" : "Wybierz zdjęcie"}
          <input type="file" accept="image/*" hidden onChange={onChange} />
        </label>
      </div>
    </div>
  );
}

// ─── SkipPolicyEditor ─────────────────────────────────────────────────────────
function SkipPolicyEditor({ value, onChange }) {
  const isLimited  = value.skipPolicyType === "LIMITED";
  const isDateReset = value.skipResetType  === "DATE";
  const set = field => e => onChange({ ...value, [field]: e.target.value });

  return (
    <div className="admin-skip-policy">
      <div className="admin-form-label" style={{ marginBottom: "0.4rem" }}>Skip Policy</div>
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        <label className="admin-form-check">
          <input type="radio" checked={!isLimited}
            onChange={() => onChange({ ...value, skipPolicyType: "UNLIMITED" })} />
          Nielimitowana
        </label>
        <label className="admin-form-check">
          <input type="radio" checked={isLimited}
            onChange={() => onChange({ ...value, skipPolicyType: "LIMITED" })} />
          Limitowana
        </label>
      </div>

      {isLimited && (
        <>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
            <label className="admin-form-check">
              <input type="radio" checked={!isDateReset}
                onChange={() => onChange({ ...value, skipResetType: "MONTHLY" })} />
              Reset miesięczny
            </label>
            <label className="admin-form-check">
              <input type="radio" checked={isDateReset}
                onChange={() => onChange({ ...value, skipResetType: "DATE" })} />
              Konkretna data resetu
            </label>
          </div>

          {isDateReset && (
            <div className="admin-form-row" style={{ marginTop: "0.5rem" }}>
              <label className="admin-form-label">Data resetu</label>
              <input type="date" className="admin-form-input" style={{ maxWidth: 180 }}
                value={value.skipResetDate || ""} onChange={set("skipResetDate")} />
            </div>
          )}

          <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
            <div className="admin-form-row" style={{ flex: 1 }}>
              <label className="admin-form-label">Ilość skipów</label>
              <input type="number" min="0" className="admin-form-input"
                value={value.skipCount ?? ""} onChange={set("skipCount")} />
            </div>
            <div className="admin-form-row" style={{ flex: 1 }}>
              <label className="admin-form-label">Maks. ciąg skipów</label>
              <input type="number" min="0" className="admin-form-input"
                value={value.maxConsecutiveSkips ?? ""} onChange={set("maxConsecutiveSkips")} />
            </div>
          </div>
        </>
      )}

      <div className="admin-form-row" style={{ marginTop: "0.5rem" }}>
        <label className="admin-form-label">Dodatkowe informacje</label>
        <textarea className="admin-form-textarea" rows={2}
          value={value.skipPolicyNotes || ""} onChange={set("skipPolicyNotes")}
          placeholder="Dodatkowe warunki, wyjątki…" />
      </div>
    </div>
  );
}

// ─── SubscriptionInlineForm ───────────────────────────────────────────────────
const EMPTY_SUB = {
  name: "", type: "MONTHLY", basePrice: "", renewalDay: "",
  isCombo: false, comboComponentIds: [],
  shipsInternationally: true, bookishMerch: false, genres: "",
  skipPolicyType: "UNLIMITED", skipResetType: "MONTHLY",
  skipResetDate: "", skipCount: "", maxConsecutiveSkips: "", skipPolicyNotes: "",
};

function SubscriptionInlineForm({ onAdd, onCancel, availableComponents = [] }) {
  const [form, setForm]               = useState(EMPTY_SUB);
  const [logoFile, setLogoFile]       = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);

  const set    = field => e  => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const toggle = field => () => setForm(prev => ({ ...prev, [field]: !prev[field] }));

  const handleLogoChange = e => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const toggleComponent = id =>
    setForm(prev => ({
      ...prev,
      comboComponentIds: prev.comboComponentIds.includes(id)
        ? prev.comboComponentIds.filter(x => x !== id)
        : [...prev.comboComponentIds, id],
    }));

  const handleAdd = e => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (form.isCombo && form.comboComponentIds.length < 2) {
      alert("Subskrypcja combo musi zawierać co najmniej 2 składowe.");
      return;
    }
    onAdd({
      name:                 form.name.trim(),
      type:                 form.type,
      basePrice:            form.basePrice ? parseFloat(form.basePrice) : null,
      estimatedShipping:    form.estimatedShipping ? parseFloat(form.estimatedShipping) : null,
      renewalDay:           form.renewalDay ? parseInt(form.renewalDay) : null,
      isCombo:              form.isCombo,
      comboComponentIds:    form.isCombo ? form.comboComponentIds : [],
      shipsInternationally: form.shipsInternationally,
      bookishMerch:         form.bookishMerch,
      genres:               form.genres.split(",").map(g => g.trim()).filter(Boolean),
      skipPolicyType:       form.skipPolicyType,
      skipResetType:        form.skipPolicyType === "LIMITED" ? form.skipResetType : null,
      skipResetDate:        form.skipPolicyType === "LIMITED" && form.skipResetType === "DATE" ? form.skipResetDate : null,
      skipCount:            form.skipPolicyType === "LIMITED" && form.skipCount ? parseInt(form.skipCount) : null,
      maxConsecutiveSkips:  form.skipPolicyType === "LIMITED" && form.maxConsecutiveSkips ? parseInt(form.maxConsecutiveSkips) : null,
      skipPolicyNotes:      form.skipPolicyNotes || null,
      _logoFile:            logoFile,
      _logoPreview:         logoPreview,
    });
  };

  const nonComboCandidates = availableComponents.filter(s => !s.isCombo && !s._tempId);

  return (
    <div className="admin-sub-inline-form">
      <form onSubmit={handleAdd}>

        {/* Combo toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginBottom: "0.5rem" }}>
          <label className="admin-form-check" style={{ fontSize: "0.97rem" }}>
            <input type="checkbox" checked={form.isCombo} onChange={toggle("isCombo")} />
            <strong>Subskrypcja Combo</strong>
          </label>
        </div>

        {/* Combo component selector */}
        {form.isCombo && (
          <div className="admin-skip-policy" style={{ marginBottom: "0.75rem" }}>
            <div className="admin-form-label" style={{ marginBottom: "0.4rem" }}>
              Składowe combo ({form.comboComponentIds.length} wybrano)
            </div>
            {nonComboCandidates.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-ghost)" }}>
                Brak dostępnych subskrypcji do łączenia. Zapisz najpierw subskrypcje bazowe.
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {nonComboCandidates.map(s => (
                  <label key={s.id} className="admin-form-check">
                    <input type="checkbox"
                      checked={form.comboComponentIds.includes(s.id)}
                      onChange={() => toggleComponent(s.id)} />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div className="admin-form-row" style={{ flex: 2, minWidth: 180 }}>
            <label className="admin-form-label">Nazwa *</label>
            <input className="admin-form-input" value={form.name} onChange={set("name")} required />
          </div>
          {!form.isCombo && (
            <div className="admin-form-row" style={{ flex: 1, minWidth: 160 }}>
              <label className="admin-form-label">Typ</label>
              <select className="admin-form-select" value={form.type} onChange={set("type")}>
                {SUB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          )}
          <div className="admin-form-row" style={{ flex: 1, minWidth: 120 }}>
            <label className="admin-form-label">Cena bazowa</label>
            <input type="number" step="0.01" min="0" className="admin-form-input"
              value={form.basePrice} onChange={set("basePrice")} placeholder="0.00" />
          </div>
          <div className="admin-form-row" style={{ flex: 1, minWidth: 100 }}>
            <label className="admin-form-label">Dzień odnowy</label>
            <input type="number" min="1" max="28" className="admin-form-input"
              value={form.renewalDay} onChange={set("renewalDay")} placeholder="1–28" />
          </div>
        </div>

        {!form.isCombo && (
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <div className="admin-form-row" style={{ flex: 1 }}>
              <label className="admin-form-label">Gatunki (przecinek)</label>
              <input className="admin-form-input" value={form.genres} onChange={set("genres")} placeholder="Fantasy, YA…" />
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", paddingTop: "1.3rem" }}>
              <label className="admin-form-check">
                <input type="checkbox" checked={form.shipsInternationally} onChange={toggle("shipsInternationally")} />
                Wysyłka int'l
              </label>
              <label className="admin-form-check">
                <input type="checkbox" checked={form.bookishMerch} onChange={toggle("bookishMerch")} />
                Merch
              </label>
            </div>
          </div>
        )}

        <ImageUpload label="Logo subskrypcji" currentUrl={logoPreview} onChange={handleLogoChange} />

        <SkipPolicyEditor value={form} onChange={v => setForm(prev => ({ ...prev, ...v }))} />

        <div className="admin-form-btns" style={{ marginTop: "0.75rem" }}>
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={onCancel}>Anuluj</button>
          <button type="submit" className="admin-btn admin-btn--primary admin-btn--sm">+ Dodaj subskrypcję</button>
        </div>
      </form>
    </div>
  );
}

// ─── CompanyFormPage ──────────────────────────────────────────────────────────
function CompanyFormPage({ company, onSaved, onBack }) {
  const isEdit = Boolean(company);
  const [form, setForm] = useState({
    name:            company?.name            || "",
    websiteUrl:      company?.websiteUrl      || "",
    description:     company?.description     || "",
    location:        company?.location        || "",
    defaultCurrency: company?.defaultCurrency || "",
  });
  const [logoFile,    setLogoFile]    = useState(null);
  const [logoPreview, setLogoPreview] = useState(company?.logoUrl || null);
  const [existingSubs,  setExistingSubs]  = useState(isEdit ? (company.subscriptions || []) : []);
  const [pendingSubs,   setPendingSubs]   = useState([]);
  const [showSubForm,   setShowSubForm]   = useState(false);
  const [submitting,    setSubmitting]    = useState(false);

  const set = field => e => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleLogoChange = e => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleAddPendingSub = sub => {
    setPendingSubs(prev => [...prev, { ...sub, _tempId: Date.now() }]);
    setShowSubForm(false);
  };

  const handleRemovePendingSub = tempId => setPendingSubs(prev => prev.filter(s => s._tempId !== tempId));

  const handleDeleteExistingSub = async sub => {
    if (!window.confirm(`Usunąć subskrypcję "${sub.name}"?`)) return;
    await fetch(API.ADMIN_COMPANY_SUB(company.id, sub.id), { method: "DELETE", credentials: "include" });
    setExistingSubs(prev => prev.filter(s => s.id !== sub.id));
  };

  const handleSave = async e => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const method = isEdit ? "PUT" : "POST";
      const url    = isEdit ? API.ADMIN_COMPANY(company.id) : API.ADMIN_COMPANIES;
      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) return;
      const saved = await r.json();
      const cid = saved.id;

      if (logoFile) {
        const fd = new FormData();
        fd.append("file", logoFile);
        await fetch(API.ADMIN_COMPANY_LOGO(cid), { method: "POST", credentials: "include", body: fd });
      }

      for (const sub of pendingSubs) {
        const { _tempId, _logoFile, _logoPreview, ...subData } = sub;
        const sr = await fetch(API.ADMIN_COMPANY_SUBS(cid), {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subData),
        });
        if (sr.ok && _logoFile) {
          const subSaved = await sr.json();
          const sfd = new FormData();
          sfd.append("file", _logoFile);
          await fetch(API.ADMIN_SUB_LOGO(cid, subSaved.id), { method: "POST", credentials: "include", body: sfd });
        }
      }

      onSaved(saved);
    } finally {
      setSubmitting(false);
    }
  };

  const logoDisplayUrl = logoPreview
    ? (logoPreview.startsWith("http") || logoPreview.startsWith("blob:") ? logoPreview : `${API.BASE}${logoPreview}`)
    : null;

  return (
    <section className="account-section">
      <div className="admin-section-header" style={{ marginBottom: "1.5rem" }}>
        <button type="button" className="admin-btn admin-btn--ghost" onClick={onBack}>← Lista</button>
        <h2 className="account-section-title" style={{ margin: 0 }}>
          {isEdit ? `Edycja: ${company.name}` : "Nowy Book Box"}
        </h2>
      </div>

      <form onSubmit={handleSave} className="admin-form-page">

        {/* ── Logo ── */}
        <div className="admin-form-row">
          <label className="admin-form-label">Logo</label>
          <div className="admin-image-upload">
            {logoDisplayUrl && (
              <img src={logoDisplayUrl} alt="" className="admin-image-preview"
                onError={e => { e.target.style.display = "none"; }} />
            )}
            <label className="admin-image-upload-btn">
              {logoDisplayUrl ? "Zmień logo" : "Wybierz logo"}
              <input type="file" accept="image/*" hidden onChange={handleLogoChange} />
            </label>
          </div>
        </div>

        {/* ── Scalar fields ── */}
        <div className="admin-form-row">
          <label className="admin-form-label">Nazwa *</label>
          <input className="admin-form-input" value={form.name} onChange={set("name")} required style={{ maxWidth: 420 }} />
        </div>

        <div className="admin-form-row">
          <label className="admin-form-label">Strona WWW</label>
          <input className="admin-form-input" value={form.websiteUrl} onChange={set("websiteUrl")}
            placeholder="https://…" style={{ maxWidth: 420 }} />
        </div>

        <div className="admin-form-row">
          <label className="admin-form-label">Opis</label>
          <textarea className="admin-form-textarea" value={form.description} onChange={set("description")} rows={3} />
        </div>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div className="admin-form-row" style={{ flex: 1, minWidth: 200 }}>
            <label className="admin-form-label">Kraj</label>
            <select className="admin-form-select" value={form.location} onChange={set("location")}>
              <option value="">— wybierz kraj —</option>
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="admin-form-row" style={{ flex: 1, minWidth: 200 }}>
            <label className="admin-form-label">Waluta</label>
            <select className="admin-form-select" value={form.defaultCurrency} onChange={set("defaultCurrency")}>
              <option value="">— wybierz walutę —</option>
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Subscriptions ── */}
        <div className="admin-subs-section" style={{ marginTop: "1.5rem" }}>
          <div className="admin-section-header">
            <h3 className="admin-subs-title">
              Subskrypcje ({existingSubs.length + pendingSubs.length})
            </h3>
            {!showSubForm && (
              <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm"
                onClick={() => setShowSubForm(true)}>
                + Dodaj subskrypcję
              </button>
            )}
          </div>

          {/* Existing subscriptions (edit mode) */}
          {existingSubs.length > 0 && (
            <div className="admin-table-wrap" style={{ marginBottom: "0.75rem" }}>
              <table className="admin-table">
                <thead>
                  <tr><th>Logo</th><th>Nazwa</th><th>Typ</th><th>Cena</th><th>Skip Policy</th><th></th></tr>
                </thead>
                <tbody>
                  {existingSubs.map(sub => {
                    const subLogo = sub.logoUrl
                      ? (sub.logoUrl.startsWith("http") ? sub.logoUrl : `${API.BASE}${sub.logoUrl}`)
                      : null;
                    return (
                      <tr key={sub.id}>
                        <td>
                          {subLogo
                            ? <img src={subLogo} alt="" className="admin-company-list-logo" onError={e => { e.target.style.display="none"; }} />
                            : <span className="admin-company-list-logo-ph">📦</span>}
                        </td>
                        <td><strong>{sub.name}</strong></td>
                        <td>{sub.type || "—"}</td>
                        <td>{sub.basePrice != null ? sub.basePrice : "—"}</td>
                        <td>
                          {sub.skipPolicyType === "LIMITED"
                            ? `Limited (${sub.skipResetType === "DATE" ? sub.skipResetDate : "miesięcznie"}, ${sub.skipCount ?? "?"} skip${sub.maxConsecutiveSkips != null ? `, max ${sub.maxConsecutiveSkips} z rzędu` : ""})`
                            : "Nielimitowana"}
                        </td>
                        <td>
                          <button type="button" className="admin-action-btn admin-action-btn--danger"
                            onClick={() => handleDeleteExistingSub(sub)}>🗑</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pending new subscriptions */}
          {pendingSubs.length > 0 && (
            <div className="admin-sub-pending-list">
              {pendingSubs.map(sub => (
                <div key={sub._tempId} className="admin-sub-pending-row">
                  {sub._logoPreview && (
                    <img src={sub._logoPreview} alt="" className="admin-company-list-logo" />
                  )}
                  <span className="admin-company-list-name">{sub.name}</span>
                  <span className="admin-chip">{sub.type}</span>
                  {sub.basePrice != null && <span className="admin-chip">{sub.basePrice}</span>}
                  <span className="admin-chip">{sub.skipPolicyType === "LIMITED" ? "Limitowana" : "Unlimited"}</span>
                  <button type="button" className="admin-action-btn admin-action-btn--danger"
                    onClick={() => handleRemovePendingSub(sub._tempId)}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Inline sub form */}
          {showSubForm && (
            <SubscriptionInlineForm
              onAdd={handleAddPendingSub}
              onCancel={() => setShowSubForm(false)}
              availableComponents={[
                ...existingSubs.filter(s => !s.isCombo),
                ...pendingSubs.filter(s => !s.isCombo),
              ]}
            />
          )}
        </div>

        {/* ── Save / Cancel ── */}
        <div className="admin-form-btns" style={{ marginTop: "2rem" }}>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={onBack}>Anuluj</button>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={submitting}>
            {submitting ? "Zapisywanie…" : isEdit ? "Zapisz zmiany" : "Utwórz Book Box"}
          </button>
        </div>
      </form>
    </section>
  );
}

// ─── Company Detail View ──────────────────────────────────────────────────────
function CompanyDetailView({ company, onBack, onEdit, onDelete }) {
  const logo = company.logoUrl
    ? (company.logoUrl.startsWith("http") ? company.logoUrl : `${API.BASE}${company.logoUrl}`)
    : null;

  return (
    <div className="admin-company-detail">
      <div className="admin-detail-header">
        <button className="admin-btn admin-btn--ghost" onClick={onBack}>← Lista</button>
        <div className="admin-detail-title">
          {logo && <img src={logo} alt="" className="admin-detail-logo" onError={e => { e.target.style.display = "none"; }} />}
          <h2 className="account-section-title" style={{ margin: 0 }}>{company.name}</h2>
        </div>
        <div className="admin-detail-actions">
          <button className="admin-btn admin-btn--secondary" onClick={() => onEdit(company)}>✎ Edytuj</button>
          <button className="admin-btn admin-btn--danger"    onClick={() => onDelete(company)}>🗑 Usuń</button>
        </div>
      </div>

      <div className="admin-company-info-block">
        {company.websiteUrl && (
          <a href={company.websiteUrl} target="_blank" rel="noopener noreferrer" className="admin-company-website">
            🌐 {company.websiteUrl}
          </a>
        )}
        {company.description && <p className="admin-company-desc">{company.description}</p>}
        <div className="admin-company-chips">
          {company.location        && <span className="admin-chip">📍 {company.location}</span>}
          {company.defaultCurrency && <span className="admin-chip">💰 {company.defaultCurrency}</span>}
        </div>
      </div>

      {company.subscriptions?.length > 0 && (
        <div className="admin-subs-section">
          <h3 className="admin-subs-title">Subskrypcje ({company.subscriptions.length})</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Nazwa</th><th>Typ</th><th>Cena</th><th>Dzień odnowy</th><th>Skip Policy</th></tr>
              </thead>
              <tbody>
                {company.subscriptions.map(sub => (
                  <tr key={sub.id}>
                    <td>
                      <strong>{sub.name}</strong>
                      {sub.isCombo && <span className="admin-combo-badge" style={{ marginLeft: "0.5rem" }}>COMBO</span>}
                      {sub.isCombo && sub.comboComponentIds?.length > 0 && (
                        <div style={{ fontSize: "0.82rem", color: "var(--text-ghost)", marginTop: "0.2rem" }}>
                          {sub.comboComponentIds
                            .map(cid => company.subscriptions.find(s => s.id === cid)?.name)
                            .filter(Boolean)
                            .join(" + ")}
                        </div>
                      )}
                    </td>
                    <td>{sub.isCombo ? "COMBO" : (sub.type || "—")}</td>
                    <td>{sub.basePrice != null ? `${sub.basePrice} ${company.defaultCurrency || ""}` : "—"}</td>
                    <td>{sub.renewalDay ?? "—"}</td>
                    <td>
                      {sub.skipPolicyType === "LIMITED"
                        ? `Limited · reset: ${sub.skipResetType === "DATE" ? sub.skipResetDate : "miesięcznie"} · ${sub.skipCount ?? "?"} skip${sub.maxConsecutiveSkips != null ? ` · max ${sub.maxConsecutiveSkips} z rzędu` : ""}`
                        : "Nielimitowana"}
                      {sub.skipPolicyNotes && <><br /><small style={{ color: "var(--text-ghost)" }}>{sub.skipPolicyNotes}</small></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SECTION: Book Boxy ───────────────────────────────────────────────────────
function CompaniesSection() {
  const [view,       setView]       = useState("list"); // "list" | "form" | "detail"
  const [companies,  setCompanies]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);   // company for detail/edit
  const [search,     setSearch]     = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchCompanies = useCallback(() => {
    setLoading(true);
    fetch(API.ADMIN_COMPANIES, { credentials: "include" })
      .then(r => r.json())
      .then(data => { setCompanies(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const handleDeleteCompany = async (company) => {
    if (!window.confirm(`Usunąć "${company.name}"? Tej operacji nie można cofnąć.`)) return;
    await fetch(API.ADMIN_COMPANY(company.id), { method: "DELETE", credentials: "include" });
    setView("list");
    fetchCompanies();
  };

  const filtered = companies.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── list view ────────────────────────────────────────────────────────────────
  if (view === "list") return (
    <section className="account-section">
      <div className="admin-section-header">
        <h2 className="account-section-title">📦 Book Boxy</h2>
        <button className="admin-btn admin-btn--primary admin-btn--sm"
          onClick={() => { setSelected(null); setView("form"); }}>
          + Dodaj Book Box
        </button>
      </div>

      <div className="admin-search-row" style={{ marginBottom: "1rem" }}>
        <input placeholder="Szukaj po nazwie…" value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") setSearch(searchInput.trim()); }} />
        <button onClick={() => setSearch(searchInput.trim())}>Szukaj</button>
        {search && <button onClick={() => { setSearch(""); setSearchInput(""); }}>✕ Wyczyść</button>}
      </div>

      {loading ? (
        <div className="status-container"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <p className="admin-empty">{search ? "Brak wyników." : "Brak book boxów w bazie."}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>Nazwa</th>
                <th>Kraj</th>
                <th>Waluta</th>
                <th>Subskrypcje</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="admin-company-row"
                    onClick={() => { setSelected(c); setView("detail"); }}
                    title="Kliknij aby zobaczyć szczegóły">
                  <td>
                    {c.logoUrl
                      ? <img src={c.logoUrl.startsWith("http") ? c.logoUrl : `${API.BASE}${c.logoUrl}`}
                          alt="" className="admin-company-list-logo"
                          onError={e => { e.target.style.display = "none"; }} />
                      : <span className="admin-company-list-logo-ph">📦</span>}
                  </td>
                  <td className="admin-company-list-name">{c.name}</td>
                  <td>{c.location || "—"}</td>
                  <td>{c.defaultCurrency || "—"}</td>
                  <td>{c.subscriptions?.length ?? 0}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: "0.35rem" }}>
                      <button className="admin-action-btn" title="Edytuj"
                        onClick={() => { setSelected(c); setView("form"); }}>✎</button>
                      <button className="admin-action-btn admin-action-btn--danger" title="Usuń"
                        onClick={() => handleDeleteCompany(c)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  // ── form view ────────────────────────────────────────────────────────────────
  if (view === "form") return (
    <CompanyFormPage
      company={selected}
      onSaved={() => { fetchCompanies(); setView("list"); }}
      onBack={() => setView(selected ? "detail" : "list")}
    />
  );

  // ── detail view ──────────────────────────────────────────────────────────────
  return (
    <section className="account-section">
      <CompanyDetailView
        company={selected}
        onBack={() => { setView("list"); fetchCompanies(); }}
        onEdit={(c) => { setSelected(c); setView("form"); }}
        onDelete={handleDeleteCompany}
      />
    </section>
  );
}

// ─── SECTION: Użytkownicy ────────────────────────────────────────────────────
function UsersSection() {
  const [emailQuery, setEmailQuery] = useState("");
  const [inputVal,   setInputVal]   = useState("");
  const [page,       setPage]       = useState(0);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);

  const load = useCallback((p, email) => {
    setLoading(true);
    const params = new URLSearchParams({ page: p, size: 20 });
    if (email) params.set("email", email);
    fetch(`${API.ADMIN_USERS}?${params}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(page, emailQuery); }, [page, emailQuery, load]);

  const handleSearch = () => {
    setPage(0);
    setEmailQuery(inputVal.trim());
  };

  const handleClear = () => {
    setInputVal("");
    setPage(0);
    setEmailQuery("");
  };

  return (
    <section className="account-section">
      <h2 className="account-section-title">👥 Użytkownicy</h2>

      <div className="admin-search-row">
        <input
          type="email"
          placeholder="Szukaj po e-mailu…"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
        />
        <button onClick={handleSearch}>Szukaj</button>
        {emailQuery && <button onClick={handleClear}>✕ Wyczyść</button>}
      </div>

      {loading ? (
        <div className="status-container"><div className="spinner" /></div>
      ) : !data ? null : data.content?.length === 0 ? (
        <p className="admin-empty">Brak użytkowników spełniających kryteria.</p>
      ) : (
        <>
          <p style={{ fontSize: "0.82rem", color: "var(--text-ghost)", marginBottom: "0.5rem", fontFamily: "'Crimson Text', serif" }}>
            Łącznie: {data.totalElements}
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nick</th>
                  <th>Imię i Nazwisko</th>
                  <th>E-mail</th>
                  <th>Rola</th>
                </tr>
              </thead>
              <tbody>
                {data.content.map(u => (
                  <tr key={u.username}>
                    <td>
                      {u.avatarUrl && (
                        <img src={`${API.BASE}${u.avatarUrl}`} alt=""
                          style={{ width: 24, height: 24, borderRadius: "50%", marginRight: 8, verticalAlign: "middle" }} />
                      )}
                      @{u.username}
                    </td>
                    <td>{[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}</td>
                    <td>{u.email || "—"}</td>
                    <td><RoleBadge value={u.role || "user"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onPage={p => setPage(p)} />
        </>
      )}
    </section>
  );
}

// ─── SECTION: Zgłoszenia błędów ──────────────────────────────────────────────
const REPORT_STATUSES = ["open", "in_progress", "resolved", "dismissed"];

function ReportsSection() {
  const [statusFilter, setStatusFilter] = useState("");
  const [page,         setPage]         = useState(0);
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [expanded,     setExpanded]     = useState(null);
  const [noteVal,      setNoteVal]      = useState("");
  const [updating,     setUpdating]     = useState(false);

  const load = useCallback((p, status) => {
    setLoading(true);
    const params = new URLSearchParams({ page: p, size: 20 });
    if (status) params.set("status", status);
    fetch(`${API.ADMIN_REPORTS}?${params}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(page, statusFilter); }, [page, statusFilter, load]);

  const toggleExpand = (id, note) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    setNoteVal(note || "");
  };

  const saveStatus = async (id, status) => {
    setUpdating(true);
    await fetch(API.ADMIN_REPORT(id), {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, adminNote: noteVal }),
    });
    setUpdating(false);
    setExpanded(null);
    load(page, statusFilter);
  };

  return (
    <section className="account-section">
      <h2 className="account-section-title">🐛 Zgłoszenia błędów</h2>

      <div className="admin-filter-row">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}>
          <option value="">— Wszystkie statusy —</option>
          {REPORT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="status-container"><div className="spinner" /></div>
      ) : !data ? null : data.content?.length === 0 ? (
        <p className="admin-empty">Brak zgłoszeń.</p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Użytkownik</th>
                  <th>Tytuł</th>
                  <th>Kategoria</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.content.map(r => (
                  <>
                    <tr key={r.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{new Date(r.createdAt).toLocaleDateString("pl-PL")}</td>
                      <td>{r.reporterUsername || "—"}</td>
                      <td>{r.title}</td>
                      <td>{r.category || "—"}</td>
                      <td><StatusBadge value={r.status} /></td>
                      <td>
                        <button className="admin-action-btn" onClick={() => toggleExpand(r.id, r.adminNote)}>
                          {expanded === r.id ? "✕" : "⚙"}
                        </button>
                      </td>
                    </tr>
                    {expanded === r.id && (
                      <tr key={`${r.id}-detail`} className="admin-table-detail-row">
                        <td colSpan={6}>
                          <p style={{ fontFamily: "'Crimson Text', serif", color: "var(--text-mid)", marginBottom: "0.6rem" }}>
                            <strong>Opis:</strong> {r.description || "—"}
                          </p>
                          <textarea
                            className="admin-note-input"
                            placeholder="Notatka admina…"
                            value={noteVal}
                            onChange={e => setNoteVal(e.target.value)}
                          />
                          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
                            {REPORT_STATUSES.map(s => (
                              <button key={s} className="admin-action-btn" disabled={updating}
                                onClick={() => saveStatus(r.id, s)}
                                style={r.status === s ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>
                                → {s}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onPage={p => setPage(p)} />
        </>
      )}
    </section>
  );
}

// ─── SECTION: Requesty danych ─────────────────────────────────────────────────
const REQUEST_TYPES    = ["export", "deletion", "correction", "other"];
const REQUEST_STATUSES = ["pending", "processing", "completed", "rejected"];

function DataRequestsSection() {
  const [statusFilter, setStatusFilter] = useState("");
  const [page,         setPage]         = useState(0);
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [expanded,     setExpanded]     = useState(null);
  const [noteVal,      setNoteVal]      = useState("");
  const [updating,     setUpdating]     = useState(false);

  const load = useCallback((p, status) => {
    setLoading(true);
    const params = new URLSearchParams({ page: p, size: 20 });
    if (status) params.set("status", status);
    fetch(`${API.ADMIN_DATA_REQUESTS}?${params}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(page, statusFilter); }, [page, statusFilter, load]);

  const toggleExpand = (id, note) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    setNoteVal(note || "");
  };

  const saveStatus = async (id, status) => {
    setUpdating(true);
    await fetch(API.ADMIN_DATA_REQUEST(id), {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, adminNote: noteVal }),
    });
    setUpdating(false);
    setExpanded(null);
    load(page, statusFilter);
  };

  return (
    <section className="account-section">
      <h2 className="account-section-title">📋 Requesty danych</h2>

      <div className="admin-filter-row">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}>
          <option value="">— Wszystkie statusy —</option>
          {REQUEST_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="status-container"><div className="spinner" /></div>
      ) : !data ? null : data.content?.length === 0 ? (
        <p className="admin-empty">Brak requestów.</p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Użytkownik</th>
                  <th>Typ</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.content.map(r => (
                  <>
                    <tr key={r.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{new Date(r.createdAt).toLocaleDateString("pl-PL")}</td>
                      <td>{r.requesterUsername || "—"}</td>
                      <td>{r.type}</td>
                      <td><StatusBadge value={r.status} /></td>
                      <td>
                        <button className="admin-action-btn" onClick={() => toggleExpand(r.id, r.adminNote)}>
                          {expanded === r.id ? "✕" : "⚙"}
                        </button>
                      </td>
                    </tr>
                    {expanded === r.id && (
                      <tr key={`${r.id}-detail`} className="admin-table-detail-row">
                        <td colSpan={5}>
                          <p style={{ fontFamily: "'Crimson Text', serif", color: "var(--text-mid)", marginBottom: "0.6rem" }}>
                            <strong>Opis:</strong> {r.description || "—"}
                          </p>
                          <textarea
                            className="admin-note-input"
                            placeholder="Notatka admina…"
                            value={noteVal}
                            onChange={e => setNoteVal(e.target.value)}
                          />
                          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
                            {REQUEST_STATUSES.map(s => (
                              <button key={s} className="admin-action-btn" disabled={updating}
                                onClick={() => saveStatus(r.id, s)}
                                style={r.status === s ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>
                                → {s}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onPage={p => setPage(p)} />
        </>
      )}
    </section>
  );
}

// ─── ADMIN PAGE ───────────────────────────────────────────────────────────────
export default function AdminPage({ onBack, initialSection = "companies" }) {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState(initialSection);

  if (!user || user.role !== "admin") {
    return (
      <div className="status-container" style={{ padding: "4rem 1rem", textAlign: "center" }}>
        <p style={{ fontFamily: "'Cinzel', serif", color: "var(--text-ghost)", fontSize: "1.1rem" }}>
          Brak dostępu. Ta sekcja jest dostępna tylko dla administratorów.
        </p>
        <button className="page-btn primary" style={{ marginTop: "1.5rem" }} onClick={onBack}>
          ← Wróć do strony
        </button>
      </div>
    );
  }

  const renderSection = () => {
    switch (activeSection) {
      case "companies":     return <CompaniesSection />;
      case "users":         return <UsersSection />;
      case "reports":       return <ReportsSection />;
      case "data-requests": return <DataRequestsSection />;
      default:              return null;
    }
  };

  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  const avatarSrc = user?.avatarUrl ? `${API.BASE}${user.avatarUrl}` : null;

  return (
    <div className="admin-page">

      {/* ── Sidebar ── */}
      <aside className="account-sidebar admin-sidebar">
        <div className="account-user-badge">
          <div className="account-avatar">
            {avatarSrc
              ? <img src={avatarSrc} alt={user.username} className="account-avatar-img" />
              : <span className="account-avatar-initials">{initials}</span>
            }
          </div>
          <div className="account-user-text">
            <p className="account-display-name">{user.firstName} {user.lastName}</p>
            <p className="account-username">@{user.username}</p>
          </div>
        </div>

        <nav className="account-nav">
          {NAV_ITEMS.map(({ key, icon, label }) => (
            <button
              key={key}
              className={`account-nav-item${activeSection === key ? " active" : ""}`}
              onClick={() => setActiveSection(key)}
            >
              <span className="account-nav-icon">{icon}</span>
              <span className="account-nav-label">{label}</span>
              <span className="account-nav-arrow">›</span>
            </button>
          ))}
        </nav>

        <button className="account-back-site-btn" onClick={onBack}>
          ← Wróć do strony
        </button>
      </aside>

      {/* ── Content ── */}
      <main className="admin-content">
        {renderSection()}
      </main>
    </div>
  );
}
