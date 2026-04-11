import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import { API } from "./api";
import "./AccountPage.css";
import "./AdminPage.css";

// ─── Nav items ────────────────────────────────────────────────────────────────
function getNavItems(t) {
  return [
    { key: "companies",     icon: "📦", label: t("admin.navBookBoxes")    },
    { key: "users",         icon: "👥", label: t("admin.navUsers")        },
    { key: "reports",       icon: "🐛", label: t("admin.navReports")      },
    { key: "data-requests", icon: "📋", label: t("admin.navDataRequests") },
    { key: "notifications", icon: "🔔", label: t("admin.navNotifications") },
  ];
}

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

const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram",  icon: "📷", placeholder: "https://instagram.com/…" },
  { key: "threads",   label: "Threads",    icon: "🧵", placeholder: "https://threads.net/…"   },
  { key: "tiktok",    label: "TikTok",     icon: "🎵", placeholder: "https://tiktok.com/…"    },
  { key: "facebook",  label: "Facebook",   icon: "📘", placeholder: "https://facebook.com/…"  },
  { key: "x",         label: "X",          icon: "✕",  placeholder: "https://x.com/…"         },
  { key: "bluesky",   label: "Bluesky",    icon: "🦋", placeholder: "https://bsky.app/…"       },
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
// ─── GenreTagPicker ───────────────────────────────────────────────────────────
function GenreTagPicker({ selected = [], onChange, allGenres = [] }) {
  const [input, setInput] = useState("");

  const suggestions = allGenres
    .filter(g => !selected.includes(g) && g.toLowerCase().includes(input.toLowerCase()))
    .slice(0, 8);

  const add = genre => {
    const trimmed = genre.trim();
    if (trimmed && !selected.includes(trimmed)) onChange([...selected, trimmed]);
    setInput("");
  };

  const remove = genre => onChange(selected.filter(g => g !== genre));

  const handleKey = e => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      add(input);
    }
    if (e.key === "Backspace" && !input && selected.length > 0) {
      remove(selected[selected.length - 1]);
    }
  };

  return (
    <div className="admin-form-row">
      <label className="admin-form-label">Gatunki</label>
      <div className="admin-genre-picker-wrap">
        {selected.map(g => (
          <span key={g} className="admin-genre-tag">
            {g}
            <button type="button" onClick={() => remove(g)}>✕</button>
          </span>
        ))}
        <input
          className="admin-genre-picker-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={selected.length === 0 ? "Fantasy, YA… (Enter lub przecinek)" : ""}
        />
      </div>
      {input && suggestions.length > 0 && (
        <div className="admin-genre-suggestions">
          {suggestions.map(g => (
            <div key={g} className="admin-genre-suggestion-item"
              onMouseDown={e => { e.preventDefault(); add(g); }}>
              {g}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SkipPolicyEditor ─────────────────────────────────────────────────────────
function SkipPolicyEditor({ value, onChange }) {
  const isLimited  = value.skipPolicyType === "LIMITED";
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
          <div style={{ marginTop: "0.6rem", marginBottom: "0.3rem", fontSize: "0.88rem", color: "var(--text-ghost)" }}>
            Reset skipów:
          </div>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
            <label className="admin-form-check">
              <input type="radio" checked={value.skipResetType !== "CALENDAR_YEAR"}
                onChange={() => onChange({ ...value, skipResetType: "SUBSCRIPTION_START" })} />
              Od miesiąca startu subskrypcji
            </label>
            <label className="admin-form-check">
              <input type="radio" checked={value.skipResetType === "CALENDAR_YEAR"}
                onChange={() => onChange({ ...value, skipResetType: "CALENDAR_YEAR" })} />
              Rok kalendarzowy (od stycznia)
            </label>
          </div>

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
  renewalDayUserSet: false,
  isCombo: false, comboComponentIds: [],
  shipsInternationally: true, bookishMerch: false, genresList: [],
  description: "",
  skipPolicyType: "UNLIMITED", skipResetType: "SUBSCRIPTION_START",
  skipCount: "", maxConsecutiveSkips: "", skipPolicyNotes: "",
  prepayOptions: [],
};

const EMPTY_PREPAY = { months: "", price: "", label: "" };

function PrepayOptionsEditor({ value = [], onChange }) {
  const add = () => onChange([...value, { ...EMPTY_PREPAY }]);
  const remove = i => onChange(value.filter((_, idx) => idx !== i));
  const update = (i, field, val) => onChange(value.map((o, idx) => idx === i ? { ...o, [field]: val } : o));
  return (
    <div className="admin-skip-policy" style={{ marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
        <span className="admin-form-label" style={{ margin: 0 }}>Opcje płatności z góry</span>
        <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={add}>+ Dodaj opcję</button>
      </div>
      {value.length === 0 && (
        <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-ghost)" }}>Brak opcji — tylko płatność miesięczna</p>
      )}
      {value.map((opt, i) => (
        <div key={i} style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "0.5rem" }}>
          <div className="admin-form-row" style={{ minWidth: 70 }}>
            <label className="admin-form-label">Miesięcy</label>
            <input type="number" min="2" max="24" className="admin-form-input"
              value={opt.months} onChange={e => update(i, "months", e.target.value)} placeholder="np. 6" />
          </div>
          <div className="admin-form-row" style={{ minWidth: 90 }}>
            <label className="admin-form-label">Cena łączna</label>
            <input type="number" step="0.01" min="0" className="admin-form-input"
              value={opt.price} onChange={e => update(i, "price", e.target.value)} placeholder="0.00" />
          </div>
          <div className="admin-form-row" style={{ flex: 1, minWidth: 120 }}>
            <label className="admin-form-label">Etykieta (opcja)</label>
            <input className="admin-form-input"
              value={opt.label} onChange={e => update(i, "label", e.target.value)} placeholder="np. Pół roku" />
          </div>
          <button type="button" className="admin-btn admin-btn--danger admin-btn--sm"
            style={{ marginBottom: "0.2rem" }} onClick={() => remove(i)}>✕</button>
        </div>
      ))}
    </div>
  );
}

function SubscriptionInlineForm({ onAdd, onCancel, availableComponents = [] }) {
  const [form, setForm]               = useState(EMPTY_SUB);
  const [logoFile, setLogoFile]       = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [allGenres, setAllGenres]     = useState([]);

  useEffect(() => {
    fetch(API.ADMIN_SUBSCRIPTION_GENRES, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setAllGenres)
      .catch(() => {});
  }, []);

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
      renewalDay:           (!form.renewalDayUserSet && form.renewalDay) ? parseInt(form.renewalDay) : null,
      renewalDayUserSet:    form.renewalDayUserSet,
      isCombo:              form.isCombo,
      comboComponentIds:    form.isCombo ? form.comboComponentIds : [],
      shipsInternationally: form.shipsInternationally,
      bookishMerch:         form.bookishMerch,
      genres:               form.genresList,
      description:          form.description || null,
      skipPolicyType:       form.skipPolicyType,
      skipResetType:        form.skipPolicyType === "LIMITED" ? form.skipResetType : null,
      skipCount:            form.skipPolicyType === "LIMITED" && form.skipCount ? parseInt(form.skipCount) : null,
      maxConsecutiveSkips:  form.skipPolicyType === "LIMITED" && form.maxConsecutiveSkips ? parseInt(form.maxConsecutiveSkips) : null,
      skipPolicyNotes:      form.skipPolicyNotes || null,
      prepayOptions:        form.prepayOptions
        .filter(o => o.months && o.price)
        .map(o => ({ months: parseInt(o.months), price: parseFloat(o.price), label: o.label || null })),
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
          <div className="admin-form-row" style={{ flex: 1, minWidth: 140 }}>
            <label className="admin-form-label">Dzień odnowy</label>
            {form.renewalDayUserSet ? (
              <span style={{ fontSize: "0.85rem", color: "var(--text-ghost)", padding: "0.35rem 0" }}>
                Ustawia użytkownik
              </span>
            ) : (
              <input type="number" min="1" max="31" className="admin-form-input"
                value={form.renewalDay} onChange={set("renewalDay")} placeholder="1–31" />
            )}
            <label className="admin-form-check" style={{ marginTop: "0.3rem", fontSize: "0.82rem" }}>
              <input type="checkbox" checked={form.renewalDayUserSet}
                onChange={() => setForm(prev => ({ ...prev, renewalDayUserSet: !prev.renewalDayUserSet, renewalDay: "" }))} />
              Ustawi użytkownik
            </label>
          </div>
        </div>

        {!form.isCombo && (
          <>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.25rem" }}>
              <label className="admin-form-check">
                <input type="checkbox" checked={form.shipsInternationally} onChange={toggle("shipsInternationally")} />
                Wysyłka int'l
              </label>
              <label className="admin-form-check">
                <input type="checkbox" checked={form.bookishMerch} onChange={toggle("bookishMerch")} />
                Merch
              </label>
            </div>
            <GenreTagPicker
              selected={form.genresList}
              allGenres={allGenres}
              onChange={genres => setForm(prev => ({ ...prev, genresList: genres }))} />
          </>
        )}

        <div className="admin-form-row">
          <label className="admin-form-label">Opis subskrypcji</label>
          <textarea className="admin-form-textarea" rows={3}
            value={form.description} onChange={set("description")}
            placeholder="Krótki opis subskrypcji widoczny dla użytkowników…" />
        </div>

        <ImageUpload label="Logo subskrypcji" currentUrl={logoPreview} onChange={handleLogoChange} />

        <SkipPolicyEditor value={form} onChange={v => setForm(prev => ({ ...prev, ...v }))} />

        <PrepayOptionsEditor
          value={form.prepayOptions}
          onChange={opts => setForm(prev => ({ ...prev, prepayOptions: opts }))} />

        <div className="admin-form-btns" style={{ marginTop: "0.75rem" }}>
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={onCancel}>Anuluj</button>
          <button type="submit" className="admin-btn admin-btn--primary admin-btn--sm">+ Dodaj subskrypcję</button>
        </div>
      </form>
    </div>
  );
}

function SubscriptionEditModal({ sub, companyId, siblingSubs = [], onClose, onSaved }) {
  const isCreate = !sub?.id;
  const subToForm = s => s ? ({
    name:                 s.name || "",
    type:                 s.type || "MONTHLY",
    basePrice:            s.basePrice != null ? String(s.basePrice) : "",
    renewalDay:           s.renewalDay != null ? String(s.renewalDay) : "",
    renewalDayUserSet:    !!s.renewalDayUserSet,
    isCombo:              !!s.isCombo,
    comboComponentIds:    s.comboComponentIds ?? [],
    shipsInternationally: s.shipsInternationally !== false,
    bookishMerch:         !!s.bookishMerch,
    genresList:           s.genres ?? [],
    description:          s.description || "",
    skipPolicyType:       s.skipPolicyType || "UNLIMITED",
    skipResetType:        s.skipResetType  || "SUBSCRIPTION_START",
    skipCount:            s.skipCount != null ? String(s.skipCount) : "",
    maxConsecutiveSkips:  s.maxConsecutiveSkips != null ? String(s.maxConsecutiveSkips) : "",
    skipPolicyNotes:      s.skipPolicyNotes || "",
    prepayOptions:        (s.prepayOptions ?? []).map(o => ({
      months: String(o.months), price: String(o.price), label: o.label || ""
    })),
  }) : {
    name: "", type: "MONTHLY", basePrice: "", renewalDay: "", renewalDayUserSet: false,
    isCombo: false, comboComponentIds: [], shipsInternationally: true, bookishMerch: false,
    genresList: [], description: "", skipPolicyType: "UNLIMITED",
    skipResetType: "SUBSCRIPTION_START", skipCount: "", maxConsecutiveSkips: "",
    skipPolicyNotes: "", prepayOptions: [],
  };

  const [form, setForm]               = useState(() => subToForm(sub));
  const [logoFile, setLogoFile]       = useState(null);
  const [logoPreview, setLogoPreview] = useState(
    sub?.logoUrl ? (sub.logoUrl.startsWith("http") ? sub.logoUrl : `${API.BASE}${sub.logoUrl}`) : null
  );
  const [allGenres, setAllGenres]     = useState([]);
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    fetch(API.ADMIN_SUBSCRIPTION_GENRES, { credentials: "include" })
      .then(r => r.ok ? r.json() : []).then(setAllGenres).catch(() => {});
  }, []);

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

  const handleSave = async e => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const body = {
      name:                 form.name.trim(),
      type:                 form.type,
      basePrice:            form.basePrice ? parseFloat(form.basePrice) : null,
      renewalDay:           (!form.renewalDayUserSet && form.renewalDay) ? parseInt(form.renewalDay) : null,
      renewalDayUserSet:    form.renewalDayUserSet,
      isCombo:              form.isCombo,
      comboComponentIds:    form.isCombo ? form.comboComponentIds : [],
      shipsInternationally: form.shipsInternationally,
      bookishMerch:         form.bookishMerch,
      genres:               form.genresList,
      description:          form.description || null,
      skipPolicyType:       form.skipPolicyType,
      skipResetType:        form.skipPolicyType === "LIMITED" ? form.skipResetType : null,
      skipCount:            form.skipPolicyType === "LIMITED" && form.skipCount ? parseInt(form.skipCount) : null,
      maxConsecutiveSkips:  form.skipPolicyType === "LIMITED" && form.maxConsecutiveSkips ? parseInt(form.maxConsecutiveSkips) : null,
      skipPolicyNotes:      form.skipPolicyNotes || null,
      prepayOptions:        form.prepayOptions
        .filter(o => o.months && o.price)
        .map(o => ({ months: parseInt(o.months), price: parseFloat(o.price), label: o.label || null })),
    };
    let savedId = sub?.id;
    if (isCreate) {
      const r = await fetch(API.ADMIN_COMPANY_SUBS(companyId), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) { const saved = await r.json(); savedId = saved.id; }
    } else {
      await fetch(API.ADMIN_SUB_UPDATE(companyId, sub.id), {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    if (logoFile && savedId) {
      const fd = new FormData();
      fd.append("file", logoFile);
      await fetch(API.ADMIN_SUB_LOGO(companyId, savedId), {
        method: "POST", credentials: "include", body: fd,
      });
    }
    setSaving(false);
    onSaved();
  };

  const nonComboCandidates = siblingSubs.filter(s => !s.isCombo && s.id !== sub?.id);

  return (
    <div className="admin-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="admin-modal-box" style={{ maxWidth: 700, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="admin-modal-header">
          <h3>{isCreate ? "+ Nowa subskrypcja" : "Edytuj subskrypcję"}</h3>
          <button className="admin-modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSave} style={{ padding: "0 1.25rem 1.25rem" }}>

          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginBottom: "0.5rem" }}>
            <label className="admin-form-check" style={{ fontSize: "0.97rem" }}>
              <input type="checkbox" checked={form.isCombo} onChange={toggle("isCombo")} />
              <strong>Subskrypcja Combo</strong>
            </label>
          </div>

          {form.isCombo && nonComboCandidates.length > 0 && (
            <div className="admin-skip-policy" style={{ marginBottom: "0.75rem" }}>
              <div className="admin-form-label" style={{ marginBottom: "0.4rem" }}>
                Składowe combo ({form.comboComponentIds.length} wybrano)
              </div>
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
            <div className="admin-form-row" style={{ flex: 1, minWidth: 140 }}>
              <label className="admin-form-label">Dzień odnowy</label>
              {form.renewalDayUserSet ? (
                <span style={{ fontSize: "0.85rem", color: "var(--text-ghost)", padding: "0.35rem 0" }}>
                  Ustawia użytkownik
                </span>
              ) : (
                <input type="number" min="1" max="31" className="admin-form-input"
                  value={form.renewalDay} onChange={set("renewalDay")} placeholder="1–31" />
              )}
              <label className="admin-form-check" style={{ marginTop: "0.3rem", fontSize: "0.82rem" }}>
                <input type="checkbox" checked={form.renewalDayUserSet}
                  onChange={() => setForm(prev => ({ ...prev, renewalDayUserSet: !prev.renewalDayUserSet, renewalDay: "" }))} />
                Ustawi użytkownik
              </label>
            </div>
          </div>

          {!form.isCombo && (
            <>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                <label className="admin-form-check">
                  <input type="checkbox" checked={form.shipsInternationally} onChange={toggle("shipsInternationally")} />
                  Wysyłka int'l
                </label>
                <label className="admin-form-check">
                  <input type="checkbox" checked={form.bookishMerch} onChange={toggle("bookishMerch")} />
                  Merch
                </label>
              </div>
              <GenreTagPicker
                selected={form.genresList}
                allGenres={allGenres}
                onChange={genres => setForm(prev => ({ ...prev, genresList: genres }))} />
            </>
          )}

          <div className="admin-form-row">
            <label className="admin-form-label">Opis subskrypcji</label>
            <textarea className="admin-form-textarea" rows={3}
              value={form.description} onChange={set("description")}
              placeholder="Krótki opis subskrypcji widoczny dla użytkowników…" />
          </div>

          <ImageUpload label="Logo subskrypcji" currentUrl={logoPreview} onChange={handleLogoChange} />

          <SkipPolicyEditor value={form} onChange={v => setForm(prev => ({ ...prev, ...v }))} />

          <PrepayOptionsEditor
            value={form.prepayOptions}
            onChange={opts => setForm(prev => ({ ...prev, prepayOptions: opts }))} />

          <div className="admin-form-btns" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={onClose}>Anuluj</button>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
              {saving ? "Zapisywanie…" : "Zapisz zmiany"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


function CompanyFormPage({ company, onSaved, onBack }) {
  const isEdit = Boolean(company);
  const [form, setForm] = useState({
    name:            company?.name            || "",
    websiteUrl:      company?.websiteUrl      || "",
    description:     company?.description     || "",
    location:        company?.location        || "",
    defaultCurrency: company?.defaultCurrency || "",
    instagram:       company?.instagram       || "",
    threads:         company?.threads         || "",
    tiktok:          company?.tiktok          || "",
    facebook:        company?.facebook        || "",
    x:               company?.x               || "",
    bluesky:         company?.bluesky         || "",
  });
  const [logoFile,    setLogoFile]    = useState(null);
  const [logoPreview, setLogoPreview] = useState(company?.logoUrl || null);
  const [existingSubs,  setExistingSubs]  = useState(isEdit ? (company.subscriptions || []) : []);
  const [pendingSubs,   setPendingSubs]   = useState([]);
  const [showSubForm,   setShowSubForm]   = useState(false);
  const [editingSub,    setEditingSub]    = useState(null);
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

        {/* ── Social media ── */}
        <div className="admin-form-row">
          <label className="admin-form-label">Media społecznościowe</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.5rem" }}>
            {SOCIAL_PLATFORMS.map(p => (
              <div key={p.key} style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span style={{ fontSize: "1rem", minWidth: 22, textAlign: "center", color: "var(--text-mid)" }}>{p.icon}</span>
                <input className="admin-form-input" value={form[p.key]} onChange={set(p.key)}
                  placeholder={p.placeholder} style={{ flex: 1 }} />
              </div>
            ))}
          </div>
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
                            ? `Limited (${sub.skipResetType === "CALENDAR_YEAR" ? "rok kalen." : "od startu"}, ${sub.skipCount ?? "?"} skip${sub.maxConsecutiveSkips != null ? `, max ${sub.maxConsecutiveSkips} z rzędu` : ""})`
                            : "Nielimitowana"}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button type="button" className="admin-action-btn"
                            onClick={() => setEditingSub(sub)} title="Edytuj">✎</button>
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

      {editingSub && (
        <SubscriptionEditModal
          sub={editingSub}
          companyId={company.id}
          siblingSubs={existingSubs}
          onClose={() => setEditingSub(null)}
          onSaved={() => {
            fetch(API.ADMIN_COMPANY_SUBS_LIST(company.id), { credentials: "include" })
              .then(r => r.json())
              .then(subs => { setExistingSubs(Array.isArray(subs) ? subs : []); setEditingSub(null); })
              .catch(() => setEditingSub(null));
          }}
        />
      )}
    </section>
  );
}

// ─── Company Detail View ──────────────────────────────────────────────────────
function CompanyDetailView({ company: initialCompany, onBack, onEdit, onDelete }) {
  const [company, setCompany] = useState(initialCompany);
  const [selectedSub, setSelectedSub] = useState(null);
  const [editingSub,  setEditingSub]  = useState(null);
  const [addingSub,   setAddingSub]   = useState(false);

  const logo = company.logoUrl
    ? (company.logoUrl.startsWith("http") ? company.logoUrl : `${API.BASE}${company.logoUrl}`)
    : null;

  const reloadCompany = () => {
    fetch(API.ADMIN_COMPANY(company.id), { credentials: "include" })
      .then(r => r.json())
      .then(data => { setCompany(data); setEditingSub(null); setAddingSub(false); })
      .catch(() => { setEditingSub(null); setAddingSub(false); });
  };

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
        {SOCIAL_PLATFORMS.some(p => company[p.key]) && (
          <div className="admin-social-links">
            {SOCIAL_PLATFORMS.filter(p => company[p.key]).map(p => (
              <a key={p.key} href={company[p.key]} target="_blank" rel="noopener noreferrer"
                className="admin-social-link" title={p.label}>
                <span className="admin-social-icon">{p.icon}</span> {p.label}
              </a>
            ))}
          </div>
        )}
        {company.description && <p className="admin-company-desc">{company.description}</p>}
        <div className="admin-company-chips">
          {company.location        && <span className="admin-chip">📍 {company.location}</span>}
          {company.defaultCurrency && <span className="admin-chip">💰 {company.defaultCurrency}</span>}
        </div>
      </div>

      <div className="admin-subs-section">
        <div className="admin-section-header">
          <h3 className="admin-subs-title">
            Subskrypcje ({company.subscriptions?.length ?? 0})
          </h3>
          {!addingSub && !editingSub && (
            <button className="admin-btn admin-btn--secondary admin-btn--sm"
              onClick={() => setAddingSub(true)}>
              + Dodaj subskrypcję
            </button>
          )}
        </div>

        {company.subscriptions?.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Nazwa</th><th>Typ</th><th>Cena</th><th>Dzień odnowy</th><th>Skip Policy</th><th></th></tr>
              </thead>
              <tbody>
                {company.subscriptions.map(sub => (
                  <>
                    <tr key={sub.id}
                      className={`admin-table-row-clickable${selectedSub?.id === sub.id ? " admin-table-row-selected" : ""}`}
                      onClick={() => setSelectedSub(prev => prev?.id === sub.id ? null : sub)}>
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
                      <td>{sub.renewalDayUserSet ? "👤 ustawi użytkownik" : (sub.renewalDay ?? "—")}</td>
                      <td>
                        {sub.skipPolicyType === "LIMITED"
                          ? `Limited · reset: ${sub.skipResetType === "CALENDAR_YEAR" ? "rok kalen." : "od startu"} · ${sub.skipCount ?? "?"} skip${sub.maxConsecutiveSkips != null ? ` · max ${sub.maxConsecutiveSkips} z rzędu` : ""}`
                          : "Nielimitowana"}
                        {sub.skipPolicyNotes && <><br /><small style={{ color: "var(--text-ghost)" }}>{sub.skipPolicyNotes}</small></>}
                      </td>
                      <td>
                        <button className="admin-action-btn" title="Edytuj"
                          onClick={e => { e.stopPropagation(); setEditingSub(sub); }}>✎</button>
                      </td>
                    </tr>
                    {selectedSub?.id === sub.id && (
                      <tr key={`${sub.id}-detail`} className="admin-table-detail-row">
                        <td colSpan={6}>
                          <div className="admin-sub-detail-panel">
                            {sub.logoUrl && (
                              <img
                                src={sub.logoUrl.startsWith("http") ? sub.logoUrl : `${API.BASE}${sub.logoUrl}`}
                                alt="" className="admin-sub-detail-logo"
                                onError={e => { e.target.style.display = "none"; }} />
                            )}
                            <div className="admin-sub-detail-body">
                              {sub.description && <p className="admin-sub-detail-desc">{sub.description}</p>}
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
                                {sub.genres?.map(g => <span key={g} className="admin-genre-tag">{g}</span>)}
                              </div>
                              {sub.prepayOptions?.length > 0 && (
                                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                                  <strong>Prepay:</strong>{" "}
                                  {sub.prepayOptions.map(o => `${o.months}m = ${o.price}${o.label ? ` (${o.label})` : ""}`).join(", ")}
                                </div>
                              )}
                              <div style={{ marginTop: "0.6rem" }}>
                                <button className="admin-btn admin-btn--secondary admin-btn--sm"
                                  onClick={() => setEditingSub(sub)}>✎ Edytuj subskrypcję</button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingSub && (
        <SubscriptionEditModal
          sub={editingSub}
          companyId={company.id}
          siblingSubs={company.subscriptions}
          onClose={() => setEditingSub(null)}
          onSaved={reloadCompany}
        />
      )}
      {addingSub && (
        <SubscriptionEditModal
          sub={null}
          companyId={company.id}
          siblingSubs={company.subscriptions ?? []}
          onClose={() => setAddingSub(false)}
          onSaved={reloadCompany}
        />
      )}
    </div>
  );
}

// ─── SECTION: Book Boxy ───────────────────────────────────────────────────────
function CompaniesSection() {
  const { t } = useI18n();
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
    if (!window.confirm(t("admin.confirmDelete").replace("{name}", company.name))) return;
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
        <h2 className="account-section-title">📦 {t("admin.navBookBoxes")}</h2>
        <button className="admin-btn admin-btn--primary admin-btn--sm"
          onClick={() => { setSelected(null); setView("form"); }}>
          {t("admin.addBookBox")}
        </button>
      </div>

      <div className="admin-search-row" style={{ marginBottom: "1rem" }}>
        <input placeholder={t("admin.searchName")} value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") setSearch(searchInput.trim()); }} />
        <button onClick={() => setSearch(searchInput.trim())}>{t("admin.search")}</button>
        {search && <button onClick={() => { setSearch(""); setSearchInput(""); }}>{t("admin.clearSearch")}</button>}
      </div>

      {loading ? (
        <div className="status-container"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <p className="admin-empty">{search ? t("admin.noResults") : t("admin.noBookBoxes")}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>{t("admin.colName")}</th>
                <th>{t("admin.colCountry")}</th>
                <th>{t("admin.colCurrency")}</th>
                <th>{t("admin.colSubscriptions")}</th>
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
  const { t } = useI18n();
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
      <h2 className="account-section-title">👥 {t("admin.navUsers")}</h2>

      <div className="admin-search-row">
        <input
          type="email"
          placeholder={t("admin.searchEmail")}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
        />
        <button onClick={handleSearch}>{t("admin.search")}</button>
        {emailQuery && <button onClick={handleClear}>{t("admin.clearSearch")}</button>}
      </div>

      {loading ? (
        <div className="status-container"><div className="spinner" /></div>
      ) : !data ? null : data.content?.length === 0 ? (
        <p className="admin-empty">{t("admin.noUsers")}</p>
      ) : (
        <>
          <p style={{ fontSize: "0.82rem", color: "var(--text-ghost)", marginBottom: "0.5rem", fontFamily: "'Crimson Text', serif" }}>
            Łącznie: {data.totalElements}
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("admin.colUsername")}</th>
                  <th>Imię i Nazwisko</th>
                  <th>{t("admin.colEmail")}</th>
                  <th>{t("admin.colRole")}</th>
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
  const { t } = useI18n();
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
      <h2 className="account-section-title">🐛 {t("admin.reports")}</h2>

      <div className="admin-filter-row">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}>
          <option value="">— {t("admin.filterAll")} —</option>
          {REPORT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="status-container"><div className="spinner" /></div>
      ) : !data ? null : data.content?.length === 0 ? (
        <p className="admin-empty">{t("admin.noReports")}</p>
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
  const { t } = useI18n();
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
      <h2 className="account-section-title">📋 {t("admin.dataRequests")}</h2>

      <div className="admin-filter-row">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}>
          <option value="">— {t("admin.filterAll")} —</option>
          {REQUEST_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="status-container"><div className="spinner" /></div>
      ) : !data ? null : data.content?.length === 0 ? (
        <p className="admin-empty">{t("admin.noDataRequests")}</p>
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

// ─── NOTIFICATIONS ADMIN SECTION ─────────────────────────────────────────────
function NotificationsAdminSection() {
  const [form, setForm] = useState({
    title: "", message: "", type: "INFO", targetRoles: ["user"]
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = () => {
    fetch(API.ADMIN_NOTIFICATIONS, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setHistory(Array.isArray(d) ? d : []); setLoadingHistory(false); })
      .catch(() => setLoadingHistory(false));
  };

  useEffect(() => { loadHistory(); }, []);

  const toggleRole = (role) => {
    setForm(f => ({
      ...f,
      targetRoles: f.targetRoles.includes(role)
        ? f.targetRoles.filter(r => r !== role)
        : [...f.targetRoles, role]
    }));
  };

  const handleSend = () => {
    if (!form.title.trim() || !form.message.trim() || form.targetRoles.length === 0) {
      setSent({ ok: false, msg: "Wypełnij tytuł, treść i wybierz co najmniej jedną rolę." });
      return;
    }
    setSending(true);
    setSent(null);
    fetch(API.ADMIN_NOTIFICATIONS, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(() => {
        setSent({ ok: true, msg: "Powiadomienie wysłane!" });
        setForm({ title: "", message: "", type: "INFO", targetRoles: ["user"] });
        loadHistory();
      })
      .catch(() => setSent({ ok: false, msg: "Błąd podczas wysyłania." }))
      .finally(() => setSending(false));
  };

  const TYPE_LABELS = { INFO: "ℹ️ Info", ANNOUNCEMENT: "📢 Ogłoszenie", WARNING: "⚠️ Ostrzeżenie" };
  const ROLE_LABELS = { user: "Użytkownik", moderator: "Moderator", admin: "Admin" };

  return (
    <div className="admin-notif-section">
      <div className="admin-notif-compose">
        <h2 className="admin-section-title">Wyślij powiadomienie</h2>
        <div className="admin-notif-form">
          <div className="admin-form-field">
            <label>Tytuł</label>
            <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))}
              placeholder="Tytuł powiadomienia" className="admin-input" maxLength={120} />
          </div>
          <div className="admin-form-field">
            <label>Treść</label>
            <textarea value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))}
              placeholder="Treść powiadomienia..." className="admin-textarea" rows={4} />
          </div>
          <div className="admin-form-row">
            <div className="admin-form-field">
              <label>Typ</label>
              <div className="admin-notif-type-btns">
                {Object.entries(TYPE_LABELS).map(([val, lbl]) => (
                  <button key={val}
                    className={`admin-type-btn${form.type === val ? " admin-type-btn--active" : ""}`}
                    onClick={() => setForm(f => ({...f, type: val}))}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div className="admin-form-field">
              <label>Role odbiorców</label>
              <div className="admin-notif-roles">
                {Object.entries(ROLE_LABELS).map(([val, lbl]) => (
                  <label key={val} className="admin-role-checkbox">
                    <input type="checkbox" checked={form.targetRoles.includes(val)} onChange={() => toggleRole(val)} />
                    {lbl}
                  </label>
                ))}
              </div>
            </div>
          </div>
          {sent && (
            <div className={`admin-notif-feedback${sent.ok ? " admin-notif-feedback--ok" : " admin-notif-feedback--err"}`}>
              {sent.msg}
            </div>
          )}
          <button className="admin-btn admin-btn--primary" onClick={handleSend} disabled={sending}>
            {sending ? "Wysyłanie…" : "📤 Wyślij powiadomienie"}
          </button>
        </div>
      </div>

      <div className="admin-notif-history">
        <h3 className="admin-subs-title">Historia wysłanych</h3>
        {loadingHistory ? (
          <div className="admin-loading">Ładowanie…</div>
        ) : history.length === 0 ? (
          <div className="admin-empty">Brak wysłanych powiadomień.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tytuł</th>
                <th>Typ</th>
                <th>Role</th>
                <th>Wysłano</th>
                <th>Odbiorcy</th>
              </tr>
            </thead>
            <tbody>
              {history.map(n => (
                <tr key={n.id}>
                  <td>
                    <strong>{n.title}</strong>
                    <div style={{fontSize:"0.8rem",color:"var(--text-mid)"}}>
                      {n.message && n.message.length > 80 ? n.message.slice(0, 80) + "…" : n.message}
                    </div>
                  </td>
                  <td>{TYPE_LABELS[n.type] || n.type}</td>
                  <td>{n.targetRoles?.split(",").map(r => ROLE_LABELS[r] || r).join(", ")}</td>
                  <td style={{fontSize:"0.8rem",color:"var(--text-mid)"}}>
                    {n.createdAt ? new Date(n.createdAt).toLocaleString("pl-PL") : "—"}
                  </td>
                  <td style={{textAlign:"center"}}>{n.recipientCount ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── ADMIN PAGE ───────────────────────────────────────────────────────────────
export default function AdminPage({ onBack, initialSection = "companies" }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState(initialSection);

  if (!user || user.role !== "admin") {
    return (
      <div className="status-container" style={{ padding: "4rem 1rem", textAlign: "center" }}>
        <p style={{ fontFamily: "'Cinzel', serif", color: "var(--text-ghost)", fontSize: "1.1rem" }}>
          {t("admin.noAccess")}
        </p>
        <button className="page-btn primary" style={{ marginTop: "1.5rem" }} onClick={onBack}>
          {t("admin.backToSite")}
        </button>
      </div>
    );
  }

  const navItems = getNavItems(t);

  const renderSection = () => {
    switch (activeSection) {
      case "companies":     return <CompaniesSection />;
      case "users":         return <UsersSection />;
      case "reports":       return <ReportsSection />;
      case "data-requests": return <DataRequestsSection />;
      case "notifications": return <NotificationsAdminSection />;
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
          {navItems.map(({ key, icon, label }) => (
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
          {t("admin.backToSite")}
        </button>
      </aside>

      {/* ── Content ── */}
      <main className="admin-content">
        {renderSection()}
      </main>
    </div>
  );
}
