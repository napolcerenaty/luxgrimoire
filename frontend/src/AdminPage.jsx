import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import { API } from "./api";
import SaleAnnouncementAdminPage from "./SaleAnnouncementAdminPage";
import BookDetailEditPage from "./BookDetailEditPage";
import "./AccountPage.css";
import "./AdminPage.css";
import "./ReportModals.css";

// ─── Nav items ────────────────────────────────────────────────────────────────
const PL_MONTHS = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
const monthName = (m) => PL_MONTHS[(m - 1)] || m;

function getNavItems(t) {
  return [
    { key: "companies",     icon: "📦", label: t("admin.navBookBoxes"),     permission: "MANAGE_COMPANIES"     },
    { key: "books",         icon: "📖", label: t("admin.navBooks"),          permission: null },
    { key: "users",         icon: "👥", label: t("admin.navUsers"),         permission: "MANAGE_USERS"         },
    { key: "sales",         icon: "🛒", label: t("admin.navSales"),         permission: "MANAGE_SALES"         },
    { key: "reports",       icon: "🐛", label: t("admin.navReports"),       permission: "MANAGE_REPORTS"       },
    { key: "data-requests", icon: "📋", label: t("admin.navDataRequests"),  permission: "MANAGE_DATA_REQUESTS" },
    { key: "notifications", icon: "🔔", label: t("admin.navNotifications"), permission: "MANAGE_NOTIFICATIONS" },
    { key: "email",         icon: "✉️",  label: t("admin.navEmail"),         permission: "MANAGE_EMAIL"         },
    { key: "imports",       icon: "🔄", label: t("admin.navImports"),       permission: "MANAGE_IMPORTS"       },
    { key: "ol-catalog",    icon: "📚", label: t("admin.navOlCatalog"),     permission: "MANAGE_IMPORTS"       },
    { key: "audit-log",     icon: "📋", label: t("admin.navAuditLog"),      permission: "MANAGE_AUDIT"         },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StatusBadge({ value }) {
  return <span className={`admin-status-badge ${value}`}>{value}</span>;
}

function RoleBadge({ value }) {
  return <span className={`admin-role-badge role-${value}`}>{value}</span>;
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
  { code: "AR", name: "Argentyna" },
  { code: "AT", name: "Austria" },
  { code: "AU", name: "Australia" },
  { code: "BE", name: "Belgia" },
  { code: "BR", name: "Brazylia" },
  { code: "CA", name: "Kanada" },
  { code: "CH", name: "Szwajcaria" },
  { code: "CN", name: "Chiny" },
  { code: "CZ", name: "Czechy" },
  { code: "DE", name: "Niemcy" },
  { code: "DK", name: "Dania" },
  { code: "EE", name: "Estonia" },
  { code: "ES", name: "Hiszpania" },
  { code: "FI", name: "Finlandia" },
  { code: "FR", name: "Francja" },
  { code: "GB", name: "Wielka Brytania" },
  { code: "GR", name: "Grecja" },
  { code: "HR", name: "Chorwacja" },
  { code: "HU", name: "Węgry" },
  { code: "IE", name: "Irlandia" },
  { code: "IN", name: "Indie" },
  { code: "IT", name: "Włochy" },
  { code: "JP", name: "Japonia" },
  { code: "KR", name: "Korea Pd." },
  { code: "LT", name: "Litwa" },
  { code: "LV", name: "Łotwa" },
  { code: "MX", name: "Meksyk" },
  { code: "NL", name: "Holandia" },
  { code: "NO", name: "Norwegia" },
  { code: "NZ", name: "Nowa Zelandia" },
  { code: "PL", name: "Polska" },
  { code: "PT", name: "Portugalia" },
  { code: "RO", name: "Rumunia" },
  { code: "RS", name: "Serbia" },
  { code: "SE", name: "Szwecja" },
  { code: "SG", name: "Singapur" },
  { code: "SI", name: "Słowenia" },
  { code: "SK", name: "Słowacja" },
  { code: "UA", name: "Ukraina" },
  { code: "US", name: "USA" },
  { code: "ZA", name: "RPA" },
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
  const isNone     = value.skipPolicyType === "NONE";
  const set = field => e => onChange({ ...value, [field]: e.target.value });

  return (
    <div className="admin-skip-policy">
      <div className="admin-form-label" style={{ marginBottom: "0.4rem" }}>Skip Policy</div>
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        <label className="admin-form-check">
          <input type="radio" checked={isNone}
            onChange={() => onChange({ ...value, skipPolicyType: "NONE" })} />
          Brak skipów
        </label>
        <label className="admin-form-check">
          <input type="radio" checked={!isLimited && !isNone}
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
              <input type="radio" checked={value.skipResetType === "SUBSCRIPTION_START"}
                onChange={() => onChange({ ...value, skipResetType: "SUBSCRIPTION_START" })} />
              Data dodania subskrypcji (auto)
            </label>
            <label className="admin-form-check">
              <input type="radio" checked={value.skipResetType === "CALENDAR_YEAR"}
                onChange={() => onChange({ ...value, skipResetType: "CALENDAR_YEAR" })} />
              Rok kalendarzowy (od stycznia)
            </label>
            <label className="admin-form-check">
              <input type="radio" checked={value.skipResetType === "FIRST_SKIP"}
                onChange={() => onChange({ ...value, skipResetType: "FIRST_SKIP" })} />
              Od pierwszego skipu użytkownika
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
  renewalDayUserSet: false, startingMonth: "",
  isCombo: false, comboComponentIds: [],
  shipsInternationally: true, bookishMerch: false, genresList: [],
  description: "", defaultLanguage: "",
  skipPolicyType: "UNLIMITED", skipResetType: "SUBSCRIPTION_START",
  skipCount: "", maxConsecutiveSkips: "", skipPolicyNotes: "",
  prepayOptions: [],
};

const BOOK_LANGUAGES = [
  { value: "", label: "— brak / mieszane —" },
  { value: "en", label: "🇬🇧 English" },
  { value: "pl", label: "🇵🇱 Polski" },
  { value: "de", label: "🇩🇪 Deutsch" },
  { value: "fr", label: "🇫🇷 Français" },
  { value: "es", label: "🇪🇸 Español" },
];

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
      startingMonth:        (form.type === "BI_MONTHLY" || form.type === "QUARTERLY") && form.startingMonth ? parseInt(form.startingMonth) : null,
      isCombo:              form.isCombo,
      comboComponentIds:    form.isCombo ? form.comboComponentIds : [],
      shipsInternationally: form.shipsInternationally,
      bookishMerch:         form.bookishMerch,
      genres:               form.genresList,
      description:          form.description || null,
      defaultLanguage:      form.defaultLanguage || null,
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
      <div>

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
          {(form.type === "BI_MONTHLY" || form.type === "QUARTERLY") && (
            <div className="admin-form-row" style={{ flex: 1, minWidth: 140 }}>
              <label className="admin-form-label">Miesiąc startowy cyklu</label>
              <select className="admin-form-select" value={form.startingMonth} onChange={set("startingMonth")}>
                <option value="">— wybierz —</option>
                {PL_MONTHS.map((name, i) => (
                  <option key={i + 1} value={i + 1}>{name}</option>
                ))}
              </select>
            </div>
          )}
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

        <div className="admin-form-row" style={{ maxWidth: 220 }}>
          <label className="admin-form-label">Domyślny język książek</label>
          <select className="admin-form-select" value={form.defaultLanguage} onChange={set("defaultLanguage")}>
            {BOOK_LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>

        <ImageUpload label="Logo subskrypcji" currentUrl={logoPreview} onChange={handleLogoChange} />

        <SkipPolicyEditor value={form} onChange={v => setForm(prev => ({ ...prev, ...v }))} />

        <PrepayOptionsEditor
          value={form.prepayOptions}
          onChange={opts => setForm(prev => ({ ...prev, prepayOptions: opts }))} />

        <div className="admin-form-btns" style={{ marginTop: "0.75rem" }}>
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={onCancel}>Anuluj</button>
          <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleAdd}>+ Dodaj subskrypcję</button>
        </div>
      </div>
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
    startingMonth:        s.startingMonth != null ? String(s.startingMonth) : "",
    isCombo:!!s.isCombo,
    comboComponentIds:    s.comboComponentIds ?? [],
    shipsInternationally: s.shipsInternationally !== false,
    bookishMerch:         !!s.bookishMerch,
    genresList:           s.genres ?? [],
    description:          s.description || "",
    defaultLanguage:      s.defaultLanguage || "",
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
    startingMonth: "",
    isCombo: false, comboComponentIds: [], shipsInternationally: true, bookishMerch: false,
    genresList: [], description: "", defaultLanguage: "", skipPolicyType: "UNLIMITED",
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
      startingMonth:        (form.type === "BI_MONTHLY" || form.type === "QUARTERLY") && form.startingMonth ? parseInt(form.startingMonth) : null,
      isCombo:              form.isCombo,
      comboComponentIds:    form.isCombo ? form.comboComponentIds : [],
      shipsInternationally: form.shipsInternationally,
      bookishMerch:         form.bookishMerch,
      genres:               form.genresList,
      description:          form.description || null,
      defaultLanguage:      form.defaultLanguage || null,
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
            {(form.type === "BI_MONTHLY" || form.type === "QUARTERLY") && (
              <div className="admin-form-row" style={{ flex: 1, minWidth: 140 }}>
                <label className="admin-form-label">Miesiąc startowy cyklu</label>
                <select className="admin-form-select" value={form.startingMonth} onChange={set("startingMonth")}>
                  <option value="">— wybierz —</option>
                  {PL_MONTHS.map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name}</option>
                  ))}
                </select>
              </div>
            )}
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

          <div className="admin-form-row" style={{ maxWidth: 240 }}>
            <label className="admin-form-label">Domyślny język książek</label>
            <select className="admin-form-select" value={form.defaultLanguage} onChange={set("defaultLanguage")}>
              {BOOK_LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
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

        {!isCreate && sub?.id && (
          <div style={{ padding: "0 1.25rem 1.25rem" }}>
            <ImportSourcesPanel companyId={companyId} subscriptionId={sub.id} />
          </div>
        )}
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
        <h2 className="section-title account-section-title" style={{ margin: 0 }}>
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

// ─── InlineEditionCreator ─────────────────────────────────────────────────────
function InlineEditionCreator({ onCreated, onCancel }) {
  const { t } = useI18n();
  const [mode, setMode] = useState("menu"); // "menu" | "new-book" | "add-edition"
  const [selectedBook, setSelectedBook] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const doSearch = async (q) => {
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const r = await fetch(`${API.SEARCH}?q=${encodeURIComponent(q.trim())}&filter=books`, { credentials: "include" });
      const data = r.ok ? await r.json() : {};
      setSearchResults(data.books || []);
    } catch { setSearchResults([]); }
    setSearching(false);
  };

  const handleSaved = (book) => {
    const editions = book.editions || [];
    if (editions.length === 0) { onCancel(); return; }
    // Find newly created edition (last by position; backend appends)
    const latest = editions[editions.length - 1];
    onCreated({
      id:          latest.id,
      editionName: latest.editionName,
      bookTitle:   book.title,
      imageUrl:    latest.imageUrl,
      bookId:      book.id,
    });
  };

  if (mode === "new-book") {
    return <BookDetailEditPage initialData={null} editingEdition="new"
      onSaved={handleSaved} onBack={() => setMode("menu")} />;
  }
  if (mode === "add-edition" && selectedBook) {
    return <BookDetailEditPage initialData={selectedBook} editingEdition="new"
      onSaved={handleSaved} onBack={() => setMode("menu")} />;
  }

  return (
    <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.8rem", marginTop: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.7rem" }}>
        <strong style={{ fontSize: "0.85rem" }}>{t("admin.createEdition")}</strong>
        <button type="button" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-ghost)", fontSize: "1rem" }} onClick={onCancel}>✕</button>
      </div>
      <button className="admin-btn admin-btn--secondary admin-btn--sm" style={{ marginBottom: "0.7rem" }}
        onClick={() => setMode("new-book")}>
        {t("admin.newBookWithEdition")}
      </button>
      <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.3rem" }}>
        {t("admin.orAddEditionToExisting")}
      </div>
      <input className="admin-form-input" placeholder={t("admin.searchTitle")} value={searchQ}
        onChange={e => { setSearchQ(e.target.value); doSearch(e.target.value); }} />
      {searching && <div style={{ fontSize: "0.78rem", color: "var(--text-ghost)", marginTop: 4 }}>…</div>}
      {searchResults.map(book => (
        <div key={book.id} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0.4rem 0.6rem", fontSize: "0.82rem",
          border: "1px solid var(--border)", borderRadius: 6, marginTop: 4,
        }}>
          <span><strong>{book.title}</strong>{book.author && <span style={{ color: "var(--text-ghost)", marginLeft: "0.4rem" }}>{book.author}</span>}</span>
          <button className="admin-btn admin-btn--secondary admin-btn--sm"
            onClick={() => { setSelectedBook(book); setMode("add-edition"); }}>
            {t("admin.addEdition")}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── SubMonthsManager ─────────────────────────────────────────────────────────
function EditionSearchWidget({ companyId, selectedEdition, onSelect, onClear }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const doSearch = () => {
    if (!q.trim()) return;
    setSearching(true);
    fetch(`${API.ADMIN_COMPANY_EDITIONS_SEARCH(companyId)}?q=${encodeURIComponent(q.trim())}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setResults(Array.isArray(data) ? data : []); setSearching(false); })
      .catch(() => setSearching(false));
  };

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>{t("admin.bookEditionLabel")}</label>
      {selectedEdition ? (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--surface-alt)", borderRadius: 6, padding: "0.4rem 0.6rem", fontSize: "0.82rem" }}>
          {selectedEdition.imageUrl && <img src={selectedEdition.imageUrl} alt="" style={{ height: 36, borderRadius: 4 }} onError={e => { e.target.style.display = "none"; }} />}
          <span><strong>{selectedEdition.editionName || selectedEdition.subscriptionName}</strong>{selectedEdition.bookTitle ? ` — ${selectedEdition.bookTitle}` : ""}</span>
          <button type="button" style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: "1rem" }} onClick={onClear}>✕</button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <input className="admin-form-input" style={{ flex: 1 }} placeholder={t("admin.searchEdition")} value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } }} />
            <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={doSearch} disabled={searching}>
              {searching ? "…" : t("admin.search")}
            </button>
          </div>
          {results.length > 0 && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 6, marginTop: 4, maxHeight: 180, overflowY: "auto", background: "var(--surface-raised)" }}>
              {results.map(r => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", cursor: "pointer", fontSize: "0.82rem", borderBottom: "1px solid var(--border)" }}
                  onClick={() => { onSelect(r); setResults([]); setQ(""); }}>
                  {r.imageUrl && <img src={r.imageUrl} alt="" style={{ height: 32, borderRadius: 3 }} onError={e => { e.target.style.display = "none"; }} />}
                  <span><strong>{r.editionName || r.subscriptionName || "—"}</strong>{r.bookTitle ? ` — ${r.bookTitle}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SubMonthsManager({ sub, companyId }) {
  const { t } = useI18n();
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingMonth, setAddingMonth] = useState(false);
  const [editingMonth, setEditingMonth] = useState(null);
  const [form, setForm] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, theme: "", imageUrl: "" });
  const [books, setBooks] = useState([]); // [{bookId, editionId, _edition}]
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [creatingEditionForIdx, setCreatingEditionForIdx] = useState(null);

  const loadMonths = () => {
    setLoading(true);
    fetch(API.ADMIN_SUB_MONTHS(companyId, sub.id), { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setMonths(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadMonths(); }, [sub.id]);

  const openAdd = () => {
    setForm({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, theme: "", imageUrl: "" });
    setBooks([]);
    setEditingMonth(null);
    setAddingMonth(true);
    setMsg(null);
  };

  const openEdit = (m) => {
    setForm({ year: m.year, month: m.month, theme: m.theme || "", imageUrl: m.imageUrl || "" });
    // Populate books from multi-book list or legacy single book
    const existingBooks = Array.isArray(m.books) && m.books.length > 0
      ? m.books.map(b => ({ bookId: b.bookId || "", editionId: b.editionId || "", _edition: b.editionId ? { id: b.editionId } : null }))
      : (m.bookId ? [{ bookId: m.bookId, editionId: m.editionId || "", _edition: m.editionId ? { id: m.editionId } : null }] : []);
    setBooks(existingBooks);
    setEditingMonth(m);
    setAddingMonth(false);
    setMsg(null);
  };

  const closeForm = () => { setAddingMonth(false); setEditingMonth(null); setBooks([]); };

  const addBook = () => setBooks(prev => [...prev, { bookId: "", editionId: "", _edition: null }]);
  const removeBook = idx => setBooks(prev => prev.filter((_, i) => i !== idx));
  const updateBookEdition = (idx, ed) => setBooks(prev => prev.map((b, i) => i === idx
    ? { ...b, editionId: ed?.id || "", bookId: b.bookId, _edition: ed }
    : b));

  const handleSave = () => {
    setSaving(true);
    const booksPayload = books
      .filter(b => b.editionId || b.bookId)
      .map(b => ({ bookId: b.bookId || null, editionId: b.editionId || null }));
    const payload = {
      year: Number(form.year), month: Number(form.month),
      theme: form.theme, imageUrl: form.imageUrl,
      books: booksPayload,
    };
    const isEdit = !!editingMonth;
    const url = isEdit ? API.ADMIN_MONTH(editingMonth.id) : API.ADMIN_SUB_MONTHS(companyId, sub.id);
    fetch(url, {
      method: isEdit ? "PUT" : "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || "Błąd")))
      .then(() => { setSaving(false); closeForm(); loadMonths(); setMsg({ ok: true, text: isEdit ? "Zapisano." : "Dodano." }); })
      .catch(e => { setSaving(false); setMsg({ ok: false, text: String(e) }); });
  };

  const handleDelete = (m) => {
    if (!window.confirm(`Usunąć motyw ${monthName(m.month)} ${m.year}?`)) return;
    fetch(API.ADMIN_MONTH(m.id), { method: "DELETE", credentials: "include" })
      .then(r => { if (r.ok || r.status === 204) { loadMonths(); setMsg({ ok: true, text: "Usunięto." }); } })
      .catch(() => setMsg({ ok: false, text: "Błąd usuwania." }));
  };

  const bookCount = (m) => {
    if (Array.isArray(m.books) && m.books.length > 0) return m.books.length;
    return m.bookId ? 1 : 0;
  };

  if (creatingEditionForIdx !== null) {
    return (
      <div style={{ marginTop: "1rem" }}>
        <InlineEditionCreator
          onCreated={(edition) => {
            updateBookEdition(creatingEditionForIdx, edition);
            setCreatingEditionForIdx(null);
          }}
          onCancel={() => setCreatingEditionForIdx(null)}
        />
      </div>
    );
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <strong style={{ fontSize: "0.9rem" }}>{t("admin.monthsTitle")} ({months.length})</strong>
        {!addingMonth && !editingMonth && (
          <button className="admin-btn admin-btn--secondary admin-btn--sm" onClick={openAdd}>+</button>
        )}
      </div>

      {msg && (
        <div style={{ fontSize: "0.82rem", marginBottom: "0.4rem", color: msg.ok ? "var(--success)" : "var(--danger)" }}>
          {msg.ok ? "✔ " : "✖ "}{msg.text}
          <button style={{ marginLeft: 6, background: "none", border: "none", cursor: "pointer", fontSize: "0.78rem" }} onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {(addingMonth || editingMonth) && (
        <div style={{ background: "var(--surface-alt)", borderRadius: 8, padding: "0.8rem", marginBottom: "0.8rem", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <div className="admin-form-row" style={{ flex: 1, minWidth: 80 }}>
              <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>{t("admin.yearLabel")}</label>
              <input className="admin-form-input" type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} />
            </div>
            <div className="admin-form-row" style={{ flex: 1, minWidth: 130 }}>
              <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>{t("admin.monthLabel")}</label>
              <select className="admin-form-select" value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))}>
                {PL_MONTHS.map((name, i) => <option key={i+1} value={i+1}>{name}</option>)}
              </select>
            </div>
            <div className="admin-form-row" style={{ flex: 3, minWidth: 180 }}>
              <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>{t("admin.themeLabel")}</label>
              <input className="admin-form-input" value={form.theme} onChange={e => setForm(f => ({ ...f, theme: e.target.value }))} />
            </div>
          </div>
          <div className="admin-form-row">
            <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>{t("admin.imageUrlLabel")}</label>
            <input className="admin-form-input" value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} />
          </div>
          {form.imageUrl && (
            <img src={form.imageUrl} alt="" style={{ height: 60, borderRadius: 5, marginBottom: 6 }} onError={e => { e.target.style.display = "none"; }} />
          )}

          {/* Multi-book section */}
          <div style={{ marginTop: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>{t("admin.booksInBox").replace("{n}", books.length)}</span>
              <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={addBook}>{t("admin.addBookToBox")}</button>
            </div>
            {books.map((b, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "flex-end", gap: "0.4rem", marginBottom: "0.4rem" }}>
                <div style={{ flex: 1 }}>
                  <EditionSearchWidget
                    companyId={companyId}
                    selectedEdition={b._edition}
                    onSelect={ed => updateBookEdition(idx, ed)}
                    onClear={() => updateBookEdition(idx, null)}
                  />
                  {!b._edition && (
                    <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm"
                      style={{ marginTop: "0.3rem", fontSize: "0.76rem" }}
                      onClick={() => setCreatingEditionForIdx(idx)}>
                      {t("admin.createEdition")}
                    </button>
                  )}
                </div>
                <button type="button" className="admin-btn admin-btn--danger admin-btn--sm"
                  style={{ marginBottom: "0.2rem" }} onClick={() => removeBook(idx)}>✕</button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
            <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleSave} disabled={saving}>{saving ? "…" : t("admin.save")}</button>
            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={closeForm}>{t("admin.cancel")}</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ fontSize: "0.82rem", color: "var(--text-ghost)" }}>{t("admin.loading")}</div> : (
        months.length === 0 ? <div style={{ fontSize: "0.82rem", color: "var(--text-ghost)" }}>{t("admin.noThemes")}</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {months.map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.82rem", padding: "0.3rem 0", borderBottom: "1px solid var(--border-faint, var(--border))" }}>
                {m.imageUrl && <img src={m.imageUrl} alt="" style={{ height: 32, borderRadius: 3 }} onError={e => { e.target.style.display = "none"; }} />}
                <span style={{ minWidth: 110 }}><strong>{monthName(m.month)} {m.year}</strong></span>
                <span style={{ flex: 1, color: m.theme ? "inherit" : "var(--text-ghost)" }}>{m.theme || "—"}</span>
                {bookCount(m) > 0 && <span style={{ fontSize: "0.78rem", color: "var(--accent)" }}>📚 {bookCount(m)}</span>}
                <button className="admin-action-btn" title="Edytuj" onClick={() => openEdit(m)}>✎</button>
                <button className="admin-action-btn" title="Usuń" style={{ color: "var(--danger)" }} onClick={() => handleDelete(m)}>🗑</button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── Company Detail View ──────────────────────────────────────────────────────
function CompanyDetailView({ company: initialCompany, onBack, onEdit, onDelete }) {
  const { t } = useI18n();
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
        <button className="admin-btn admin-btn--ghost" onClick={onBack}>{t("admin.backToList")}</button>
        <div className="admin-detail-title">
          {logo && <img src={logo} alt="" className="admin-detail-logo" onError={e => { e.target.style.display = "none"; }} />}
          <h2 className="section-title account-section-title" style={{ margin: 0 }}>{company.name}</h2>
        </div>
        <div className="admin-detail-actions">
          <button className="admin-btn admin-btn--secondary" onClick={() => onEdit(company)}>{t("admin.edit")}</button>
          <button className="admin-btn admin-btn--danger"    onClick={() => onDelete(company)}>{t("admin.delete")}</button>
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
            {t("admin.subscriptionsCount").replace("{n}", company.subscriptions?.length ?? 0)}
          </h3>
          {!addingSub && !editingSub && (
            <button className="admin-btn admin-btn--secondary admin-btn--sm"
              onClick={() => setAddingSub(true)}>
              {t("admin.addSubscription")}
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
                        {sub.skipPolicyType === "NONE"
                          ? "Brak skipów"
                          : sub.skipPolicyType === "LIMITED"
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
                                  onClick={() => setEditingSub(sub)}>{t("admin.editSubscription")}</button>
                              </div>
                              <SubMonthsManager sub={sub} companyId={company.id} />
                              <ImportSourcesPanel companyId={company.id} subscriptionId={sub.id} />
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
  const { user } = useAuth();
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
        <h2 className="section-title account-section-title">📦 {t("admin.navBookBoxes")}</h2>
        {user?.role !== "company_manager" && (
          <button className="admin-btn admin-btn--primary admin-btn--sm"
            onClick={() => { setSelected(null); setView("form"); }}>
            {t("admin.addBookBox")}
          </button>
        )}
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
const ALL_PERMISSIONS = [
  "MANAGE_COMPANIES", "MANAGE_SALES", "MANAGE_REPORTS",
  "MANAGE_DATA_REQUESTS", "MANAGE_NOTIFICATIONS", "MANAGE_EMAIL",
  "MANAGE_USERS", "MANAGE_IMPORTS", "MANAGE_AUDIT",
];
const PERM_I18N_KEY = {
  MANAGE_COMPANIES:    "permManageCompanies",
  MANAGE_SALES:        "permManageSales",
  MANAGE_REPORTS:      "permManageReports",
  MANAGE_DATA_REQUESTS:"permManageDataRequests",
  MANAGE_NOTIFICATIONS:"permManageNotifications",
  MANAGE_EMAIL:        "permManageEmail",
  MANAGE_USERS:        "permManageUsers",
  MANAGE_IMPORTS:      "permManageImports",
  MANAGE_AUDIT:        "permManageAudit",
};

// Default permissions per role (match backend AuthHelper)
const ROLE_DEFAULT_PERMS = {
  admin:           ALL_PERMISSIONS,
  superadmin:      ALL_PERMISSIONS,
  moderator:       ["MANAGE_DATA_REQUESTS", "MANAGE_SALES"],
  company_manager: ["MANAGE_COMPANIES", "MANAGE_SALES"],
  user:            [],
};

function roleI18nKey(r) {
  return `admin.role${r.charAt(0).toUpperCase() + r.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;
}

function UserRoleModal({ targetUser, currentUser, onClose, onSaved }) {
  const { t } = useI18n();
  const isSuperAdmin = currentUser?.role === "superadmin";
  // superadmin can assign any role; admin can assign user/company_manager/moderator (not admin/superadmin)
  const ROLE_OPTIONS = isSuperAdmin
    ? ["user", "company_manager", "moderator", "admin", "superadmin"]
    : ["user", "company_manager", "moderator"];

  const [role, setRole] = useState(targetUser.role || "user");
  const [extraPerms, setExtraPerms] = useState(() => {
    const stored = (targetUser.adminPermissions || "").split(",").map(s => s.trim()).filter(Boolean);
    const defaults = ROLE_DEFAULT_PERMS[targetUser.role || "user"] || [];
    return stored.filter(p => !defaults.includes(p));
  });
  const [managedCompanyId, setManagedCompanyId] = useState(targetUser.managedCompanyId || "");
  const [companies, setCompanies] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const defaultPerms = ROLE_DEFAULT_PERMS[role] || [];
  const isAutoPerms  = role === "admin" || role === "superadmin";

  // Load companies when company_manager is selected
  useEffect(() => {
    if (role === "company_manager") {
      fetch(API.ADMIN_COMPANIES, { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then(data => setCompanies(Array.isArray(data) ? data : (data.content || [])))
        .catch(() => {});
    }
  }, [role]);

  const toggleExtra = (p) => {
    setExtraPerms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const allPerms = isAutoPerms ? "" : [...defaultPerms, ...extraPerms].join(",");
      const body = { role, adminPermissions: allPerms };
      if (role === "company_manager") body.managedCompanyId = managedCompanyId || null;

      const res = await fetch(API.ADMIN_USER_ROLE_PERMS(targetUser.username), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        setError(txt || "Error saving");
        setSaving(false);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{t("admin.editRoleTitle")}</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--text-ghost)", marginBottom: "1rem" }}>
          @{targetUser.username}
        </p>

        <label className="form-label">{t("admin.roleLabel")}</label>
        <select className="form-input" value={role} onChange={e => { setRole(e.target.value); setExtraPerms([]); }}
          style={{ marginBottom: "1.2rem" }}>
          {ROLE_OPTIONS.map(r => (
            <option key={r} value={r}>{t(roleI18nKey(r))}</option>
          ))}
        </select>

        {role === "company_manager" && (
          <>
            <label className="form-label">{t("admin.companyLabel")}</label>
            <select className="form-input" value={managedCompanyId}
              onChange={e => setManagedCompanyId(e.target.value)}
              style={{ marginBottom: "1.2rem" }}>
              <option value="">{t("admin.selectCompany")}</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </>
        )}

        <label className="form-label">{t("admin.permissionsLabel")}</label>
        {isAutoPerms ? (
          <p style={{ fontSize: "0.82rem", color: "var(--text-ghost)", marginBottom: "1rem", fontStyle: "italic" }}>
            {t("admin.permissionsHint")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.2rem" }}>
            {ALL_PERMISSIONS.map(p => {
              const isDefault = defaultPerms.includes(p);
              const checked   = isDefault || extraPerms.includes(p);
              return (
                <label key={p} style={{ display: "flex", alignItems: "center", gap: "0.6rem",
                  cursor: isDefault ? "default" : "pointer", fontSize: "0.88rem",
                  opacity: isDefault ? 0.6 : 1 }}>
                  <input type="checkbox" checked={checked} disabled={isDefault}
                    onChange={() => !isDefault && toggleExtra(p)} />
                  {t(`admin.${PERM_I18N_KEY[p]}`)}
                  {isDefault && (
                    <span style={{ fontSize: "0.75rem", color: "var(--text-ghost)", fontStyle: "italic" }}>
                      (domyślne)
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}

        {error && <p style={{ color: "var(--error)", fontSize: "0.85rem", marginBottom: "0.8rem" }}>{error}</p>}

        <div className="modal-actions">
          <button className="page-btn secondary" onClick={onClose}>{t("admin.cancel")}</button>
          <button className="page-btn primary" onClick={handleSave} disabled={saving}>
            {saving ? "…" : t("admin.saveRole")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BookEditionSection ───────────────────────────────────────────────────────

function BookEditionSection() {
  const { t } = useI18n();
  // mode: "menu" | "new-book" | "add-edition" | "edit-meta"
  const [mode, setMode] = useState("menu");
  const [selectedBook, setSelectedBook] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const doSearch = async (q) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const r = await fetch(`${API.SEARCH}?q=${encodeURIComponent(q)}&filter=books`, { credentials: "include" });
      const data = r.ok ? await r.json() : {};
      setSearchResults(Array.isArray(data) ? data : (data.books || []));
    } catch { setSearchResults([]); }
    setSearching(false);
  };

  const reset = () => { setMode("menu"); setSelectedBook(null); setSearchQ(""); setSearchResults([]); };

  if (mode === "new-book") {
    return (
      <BookDetailEditPage
        initialData={null}
        editingEdition="new"
        onSaved={reset}
        onBack={reset}
      />
    );
  }

  if ((mode === "add-edition" || mode === "edit-meta") && selectedBook) {
    return (
      <BookDetailEditPage
        initialData={selectedBook}
        editingEdition={mode === "add-edition" ? "new" : null}
        onSaved={reset}
        onBack={reset}
      />
    );
  }

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">📖 {t("admin.navBooks")}</h2>

      {/* New book */}
      <div style={{ marginBottom: "2rem" }}>
        <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: "1rem", marginBottom: "0.8rem" }}>
          Nowa książka
        </h3>
        <button className="page-btn primary" onClick={() => setMode("new-book")}>
          + Dodaj nową książkę z edycją
        </button>
      </div>

      {/* Find existing book */}
      <div>
        <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: "1rem", marginBottom: "0.8rem" }}>
          Istniejąca książka
        </h3>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.8rem" }}>
          <input
            className="form-input"
            style={{ maxWidth: 360 }}
            placeholder="Szukaj książki po tytule…"
            value={searchQ}
            onChange={e => { setSearchQ(e.target.value); doSearch(e.target.value); }}
          />
          {searching && <span style={{ alignSelf: "center", color: "var(--text-ghost)" }}>…</span>}
        </div>
        {searchQ.trim().length >= 2 && searchResults.length === 0 && !searching && (
          <p style={{ fontSize: "0.83rem", color: "var(--text-ghost)" }}>Brak wyników.</p>
        )}
        {searchResults.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 540 }}>
            {searchResults.map(book => (
              <div key={book.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0.6rem 1rem", background: "var(--surface-2)", borderRadius: 8,
                border: "1px solid var(--border)"
              }}>
                <span style={{ fontSize: "0.9rem" }}>
                  <strong>{book.title}</strong>
                  {book.author && <span style={{ color: "var(--text-ghost)", marginLeft: "0.5rem" }}>{book.author}</span>}
                </span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="page-btn secondary" style={{ fontSize: "0.8rem", padding: "0.3rem 0.8rem" }}
                    onClick={() => { setSelectedBook(book); setMode("add-edition"); }}>
                    + Edycja
                  </button>
                  <button className="page-btn secondary" style={{ fontSize: "0.8rem", padding: "0.3rem 0.8rem" }}
                    onClick={() => { setSelectedBook(book); setMode("edit-meta"); }}>
                    Edytuj metadane
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UsersSection() {
  const { user: currentUser } = useAuth();
  const { t } = useI18n();
  const [emailQuery, setEmailQuery] = useState("");
  const [inputVal,   setInputVal]   = useState("");
  const [page,       setPage]       = useState(0);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [editTarget, setEditTarget] = useState(null);

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
      <h2 className="section-title account-section-title">👥 {t("admin.navUsers")}</h2>

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
                  <th></th>
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
                    <td>
                      <button className="admin-edit-role-btn" onClick={() => setEditTarget(u)}>
                        ✏️ {t("admin.edit")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onPage={p => setPage(p)} />
        </>
      )}
      {editTarget && (
        <UserRoleModal
          targetUser={editTarget}
          currentUser={currentUser}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(page, emailQuery); }}
        />
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
      <h2 className="section-title account-section-title">🐛 {t("admin.reports")}</h2>

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
                          {r.imageUrls && r.imageUrls.length > 0 && (
                            <div className="admin-report-images">
                              {r.imageUrls.split(",").filter(Boolean).map((url, i) => (
                                <a key={i} href={url.startsWith("http") ? url : `${API.BASE}${url}`} target="_blank" rel="noopener noreferrer">
                                  <img
                                    className="admin-report-img-thumb"
                                    src={url.startsWith("http") ? url : `${API.BASE}${url}`}
                                    alt={`Screenshot ${i + 1}`}
                                  />
                                </a>
                              ))}
                            </div>
                          )}
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
      <h2 className="section-title account-section-title">📋 {t("admin.dataRequests")}</h2>

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
                  <th>Tytuł</th>
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
                      <td>{r.title || "—"}</td>
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
                        <td colSpan={6}>
                          <p style={{ fontFamily: "'Crimson Text', serif", color: "var(--text-mid)", marginBottom: "0.6rem" }}>
                            <strong>Opis:</strong> {r.description || "—"}
                          </p>
                          {r.imageUrls && r.imageUrls.length > 0 && (
                            <div className="admin-report-images">
                              {r.imageUrls.split(",").filter(Boolean).map((url, i) => (
                                <a key={i} href={url.startsWith("http") ? url : `${API.BASE}${url}`} target="_blank" rel="noopener noreferrer">
                                  <img
                                    className="admin-report-img-thumb"
                                    src={url.startsWith("http") ? url : `${API.BASE}${url}`}
                                    alt={`Screenshot ${i + 1}`}
                                  />
                                </a>
                              ))}
                            </div>
                          )}
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
  const [expandedRow, setExpandedRow] = useState(null);

  // Retention settings
  const [retentionDays, setRetentionDays]     = useState(180);
  const [retentionInput, setRetentionInput]   = useState("180");
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionMsg, setRetentionMsg]       = useState(null);

  useEffect(() => {
    fetch(API.ADMIN_NOTIF_RETENTION, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.days) { setRetentionDays(d.days); setRetentionInput(String(d.days)); } })
      .catch(() => {});
  }, []);

  const saveRetention = () => {
    const days = parseInt(retentionInput, 10);
    if (isNaN(days) || days < 7 || days > 3650) {
      setRetentionMsg({ ok: false, msg: "Wartość musi być między 7 a 3650 dni." });
      return;
    }
    setRetentionSaving(true);
    setRetentionMsg(null);
    fetch(API.ADMIN_NOTIF_RETENTION, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setRetentionDays(d.days); setRetentionMsg({ ok: true, msg: "Zapisano." }); })
      .catch(() => setRetentionMsg({ ok: false, msg: "Błąd zapisu." }))
      .finally(() => setRetentionSaving(false));
  };

  const PRESETS = [30, 90, 180, 365, 730];

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
        <h2 className="section-title admin-section-title">Wyślij powiadomienie</h2>
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

      <div className="admin-notif-retention">
        <h3 className="admin-subs-title">Retencja powiadomień</h3>
        <p className="admin-retention-desc">
          Powiadomienia użytkowników starsze niż podana liczba dni są automatycznie usuwane codziennie o 03:00.
          Aktualnie: <strong>{retentionDays} dni</strong> (~{Math.round(retentionDays / 30)} mies.).
        </p>
        <div className="admin-retention-presets">
          {PRESETS.map(p => (
            <button
              key={p}
              className={`admin-type-btn${parseInt(retentionInput, 10) === p ? " admin-type-btn--active" : ""}`}
              onClick={() => setRetentionInput(String(p))}
            >
              {p} dni
            </button>
          ))}
        </div>
        <div className="admin-retention-row">
          <input
            type="number"
            className="admin-input admin-retention-input"
            min={7}
            max={3650}
            value={retentionInput}
            onChange={e => setRetentionInput(e.target.value)}
          />
          <span className="admin-retention-unit">dni</span>
          <button className="admin-btn admin-btn--primary" onClick={saveRetention} disabled={retentionSaving}>
            {retentionSaving ? "Zapisywanie…" : "Zapisz"}
          </button>
        </div>
        {retentionMsg && (
          <div className={`admin-notif-feedback${retentionMsg.ok ? " admin-notif-feedback--ok" : " admin-notif-feedback--err"}`}>
            {retentionMsg.msg}
          </div>
        )}
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
                <tr
                  key={n.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => setExpandedRow(r => r === n.id ? null : n.id)}
                >
                  <td>
                    <strong>{n.title}</strong>
                    <div style={{
                      fontSize: "0.8rem",
                      color: "var(--text-mid)",
                      marginTop: "0.2rem",
                      whiteSpace: expandedRow === n.id ? "pre-wrap" : "normal",
                      maxWidth: "400px",
                    }}>
                      {expandedRow === n.id
                        ? n.message
                        : (n.message && n.message.length > 80 ? n.message.slice(0, 80) + "…" : n.message)}
                    </div>
                    {n.message && n.message.length > 80 && (
                      <div style={{ fontSize: "0.72rem", color: "var(--accent)", marginTop: "0.15rem" }}>
                        {expandedRow === n.id ? "▲ Zwiń" : "▼ Rozwiń"}
                      </div>
                    )}
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
// ─── Email Section ────────────────────────────────────────────────────────────
// ─── Import: Sources Panel (used inside SubscriptionEditModal) ────────────────
function ImportSourcesPanel({ companyId, subscriptionId }) {
  const [sources,    setSources]    = useState([]);
  const [urlInput,   setUrlInput]   = useState("");
  const [typeInput,  setTypeInput]  = useState("RSS");
  const [adding,     setAdding]     = useState(false);
  const [msg,        setMsg]        = useState(null);
  const [scrapeUrl,  setScrapeUrl]  = useState("");
  const [scraping,   setScraping]   = useState(false);
  const [scraped,    setScraped]    = useState(null);
  const [scrapeErr,  setScrapeErr]  = useState(null);
  const [aiStatus,   setAiStatus]   = useState(null);
  const [imageFile,  setImageFile]  = useState(null);
  const [imageScanning, setImageScanning] = useState(false);
  const [imageErr,   setImageErr]   = useState(null);
  const [parentUrl,    setParentUrl]    = useState("");
  const [parentScraping, setParentScraping] = useState(false);
  const [parentResults,  setParentResults]  = useState([]);
  const [parentErr,    setParentErr]    = useState(null);

  const loadSources = useCallback(() => {
    if (!companyId || !subscriptionId) return;
    fetch(API.ADMIN_IMPORT_SOURCES(companyId, subscriptionId), { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setSources)
      .catch(() => {});
  }, [companyId, subscriptionId]);

  useEffect(() => { loadSources(); }, [loadSources]);

  useEffect(() => {
    fetch(API.ADMIN_IMPORT_AI_STATUS, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setAiStatus(d))
      .catch(() => {});
  }, []);

  const handleAddSource = () => {
    if (!urlInput.trim()) return;
    setAdding(true);
    fetch(API.ADMIN_IMPORT_SOURCES_CREATE, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, subscriptionId, sourceType: typeInput, url: urlInput.trim() }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(() => { setUrlInput(""); setMsg({ ok: true, text: "Dodano źródło." }); loadSources(); })
      .catch(() => setMsg({ ok: false, text: "Błąd dodawania źródła." }))
      .finally(() => setAdding(false));
  };

  const handleDelete = id => {
    fetch(API.ADMIN_IMPORT_SOURCE_DELETE(id), { method: "DELETE", credentials: "include" })
      .then(() => loadSources())
      .catch(() => {});
  };

  const handleCheckNow = id => {
    fetch(API.ADMIN_IMPORT_SOURCE_CHECK(id), { method: "POST", credentials: "include" })
      .then(r => r.json())
      .then(d => setMsg({ ok: true, text: d.message || "Sprawdzono." }))
      .catch(() => setMsg({ ok: false, text: "Błąd sprawdzania." }));
  };

  const handleScrapeImage = () => {
    if (!imageFile) return;
    setImageScanning(true); setScraped(null); setImageErr(null);
    const formData = new FormData();
    formData.append("file", imageFile);
    fetch(API.ADMIN_IMPORT_SCRAPE_IMAGE, { method: "POST", credentials: "include", body: formData })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || "Błąd")))
      .then(d => setScraped({ ...d, subscriptionId, companyId }))
      .catch(e => setImageErr(String(e)))
      .finally(() => setImageScanning(false));
  };

  const handleScrape = () => {
    if (!scrapeUrl.trim()) return;
    setScraping(true); setScraped(null); setScrapeErr(null);
    fetch(API.ADMIN_IMPORT_SCRAPE_URL, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: scrapeUrl.trim(), subscriptionId, companyId }),
    })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || "Błąd")))
      .then(d => setScraped({ ...d, subscriptionId, companyId }))
      .catch(e => setScrapeErr(String(e)))
      .finally(() => setScraping(false));
  };

  const handleScrapeParent = () => {
    if (!parentUrl.trim()) return;
    setParentScraping(true); setParentResults([]); setParentErr(null);
    fetch(API.ADMIN_IMPORT_SCRAPE_PARENT, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: parentUrl.trim(), subscriptionId, companyId }),
    })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || "Błąd")))
      .then(list => setParentResults(list.map((d, i) => ({ ...d, _key: i, subscriptionId, companyId }))))
      .catch(e => setParentErr(String(e)))
      .finally(() => setParentScraping(false));
  };

  const handleRemoveParentEntry = key => setParentResults(prev => prev.filter(e => e._key !== key));
  const handleUpdateParentEntry = (key, updated) => setParentResults(prev => prev.map(e => e._key === key ? { ...e, ...updated } : e));

  const handleSaveAllParent = () => {
    if (!parentResults.length) return;
    Promise.all(parentResults.map(entry =>
      fetch(API.ADMIN_SUB_MONTHS(companyId, subscriptionId), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: entry.year, month: entry.month, theme: entry.theme, imageUrl: entry.imageUrl }),
      }).then(r => r.ok ? r.json() : Promise.reject())
    ))
    .then(() => { setParentResults([]); setParentUrl(""); setMsg({ ok: true, text: `Zapisano ${parentResults.length} miesięcy.` }); })
    .catch(() => setMsg({ ok: false, text: "Błąd zapisu — sprawdź wpisy." }));
  };

  const handleSaveDirect = () => {
    if (!scraped || !subscriptionId || !companyId) return;
    fetch(API.ADMIN_SUB_MONTHS(companyId, subscriptionId), {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year:     scraped.year,
        month:    scraped.month,
        theme:    scraped.theme,
        imageUrl: scraped.imageUrl,
      }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(() => { setScraped(null); setScrapeUrl(""); setMsg({ ok: true, text: "Miesiąc zapisany." }); })
      .catch(() => setMsg({ ok: false, text: "Błąd zapisu." }));
  };

  return (
    <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
      <h4 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>🔄 Import źródeł</h4>

      {sources.length > 0 && (
        <table className="admin-table" style={{ marginBottom: "0.75rem", fontSize: "0.83rem" }}>
          <thead><tr><th>Typ</th><th>URL</th><th>Ostatnie sprawdzenie</th><th></th></tr></thead>
          <tbody>
            {sources.map(s => (
              <tr key={s.id}>
                <td>{s.sourceType}</td>
                <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.url}</td>
                <td style={{ fontSize: "0.78rem" }}>{s.lastCheckedAt ? new Date(s.lastCheckedAt).toLocaleString("pl-PL") : "—"}</td>
                <td style={{ display: "flex", gap: "0.4rem" }}>
                  {s.sourceType === "RSS" && (
                    <button className="admin-btn admin-btn--secondary admin-btn--sm" onClick={() => handleCheckNow(s.id)}>Sprawdź teraz</button>
                  )}
                  <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => handleDelete(s.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.5rem" }}>
        <select className="admin-form-select" style={{ width: "auto" }} value={typeInput} onChange={e => setTypeInput(e.target.value)}>
          <option value="RSS">RSS</option>
          <option value="BLOG">BLOG</option>
        </select>
        <input className="admin-form-input" style={{ flex: 1, minWidth: 200 }} value={urlInput}
          onChange={e => setUrlInput(e.target.value)} placeholder="URL RSS lub bloga…" />
        <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleAddSource} disabled={adding}>
          {adding ? "Dodawanie…" : "Dodaj źródło"}
        </button>
      </div>

      <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
          <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>Importuj z URL wpisu</span>
          {aiStatus && (
            <span style={{
              fontSize: "0.75rem", padding: "1px 7px", borderRadius: 10,
              background: aiStatus.configured ? "var(--success-bg, #d4edda)" : "var(--surface-raised)",
              color: aiStatus.configured ? "var(--success, #155724)" : "var(--text-muted)",
              border: "1px solid currentColor", opacity: 0.85,
            }}>
              {aiStatus.configured ? "🤖 AI aktywne" : "AI niedostępne"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input className="admin-form-input" style={{ flex: 1, minWidth: 220 }} value={scrapeUrl}
            onChange={e => setScrapeUrl(e.target.value)} placeholder="https://blog.example.com/post…" />
          <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleScrape} disabled={scraping}>
            {scraping ? "Importuję…" : "Importuj"}
          </button>
        </div>
        {scrapeErr && <div style={{ color: "var(--danger)", fontSize: "0.82rem", marginTop: "0.4rem" }}>✖ {scrapeErr}</div>}
        {scraped && <ScrapedPreviewForm data={scraped} onDataChange={setScraped} onSavePending={handleSaveDirect} />}
      </div>

      {/* Parent URL multi-import section */}
      <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem" }}>
        <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: "0.4rem" }}>🗂 Importuj z listy wpisów (parent URL)</div>
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
          Podaj URL strony z listą wpisów — system znajdzie i zaimportuje wszystkie miesiące automatycznie.
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input className="admin-form-input" style={{ flex: 1, minWidth: 220 }} value={parentUrl}
            onChange={e => setParentUrl(e.target.value)} placeholder="https://blog.example.com/kategoria/…" />
          <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleScrapeParent} disabled={parentScraping}>
            {parentScraping ? "Pobieram…" : "Pobierz wpisy"}
          </button>
        </div>
        {parentErr && <div style={{ color: "var(--danger)", fontSize: "0.82rem", marginTop: "0.4rem" }}>✖ {parentErr}</div>}

        {parentResults.length > 0 && (
          <div style={{ marginTop: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Znaleziono {parentResults.length} wpisów:</span>
              <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleSaveAllParent}>
                ✔ Zapisz wszystkie ({parentResults.length})
              </button>
            </div>
            {parentResults.map(entry => (
              <div key={entry._key} style={{ position: "relative", marginBottom: "0.5rem" }}>
                <button onClick={() => handleRemoveParentEntry(entry._key)}
                  style={{ position: "absolute", top: 8, right: 8, zIndex: 1, background: "var(--danger)", color: "#fff",
                    border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.75rem", padding: "2px 6px" }}>
                  ✕ Usuń
                </button>
                <ScrapedPreviewForm
                  data={entry}
                  onDataChange={updated => handleUpdateParentEntry(entry._key, updated)}
                  onSavePending={() => {
                    fetch(API.ADMIN_SUB_MONTHS(companyId, subscriptionId), {
                      method: "POST", credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ year: entry.year, month: entry.month, theme: entry.theme, imageUrl: entry.imageUrl }),
                    }).then(r => r.ok && handleRemoveParentEntry(entry._key))
                      .catch(() => {});
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {aiStatus?.configured && (
        <div style={{ marginTop: "0.75rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem" }}>
          <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: "0.4rem" }}>📷 Importuj ze zdjęcia</div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <input type="file" accept="image/jpeg,image/png,image/webp" style={{ flex: 1, minWidth: 180, fontSize: "0.82rem" }}
              onChange={e => { setImageFile(e.target.files[0] || null); setImageErr(null); setScraped(null); }} />
            <button className="admin-btn admin-btn--primary admin-btn--sm"
              onClick={handleScrapeImage} disabled={imageScanning || !imageFile}>
              {imageScanning ? "Analizuję…" : "Analizuj zdjęcie"}
            </button>
          </div>
          {imageErr && <div style={{ color: "var(--danger)", fontSize: "0.82rem", marginTop: "0.4rem" }}>✖ {imageErr}</div>}
        </div>
      )}

      {msg && (
        <div style={{ fontSize: "0.83rem", marginTop: "0.5rem", color: msg.ok ? "var(--success)" : "var(--danger)" }}>
          {msg.ok ? "✔ " : "✖ "}{msg.text}
          <button style={{ marginLeft: 8, fontSize: "0.78rem", background: "none", border: "none", cursor: "pointer" }} onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
    </div>
  );
}

function ScrapedPreviewForm({ data, onDataChange, onSavePending }) {
  const set = field => e => onDataChange({ ...data, [field]: e.target.value });
  const MONTHS = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
  const allImgs = data.allImages || [];

  return (
    <div style={{ background: "var(--surface-raised)", borderRadius: 8, padding: "0.75rem", marginTop: "0.75rem" }}>
      <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: 8 }}>Podgląd importu — sprawdź i edytuj</div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <div className="admin-form-row" style={{ flex: 1, minWidth: 80 }}>
          <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>Rok</label>
          <input className="admin-form-input" type="number" value={data.year || ""} onChange={set("year")} placeholder="2025" />
        </div>
        <div className="admin-form-row" style={{ flex: 1, minWidth: 120 }}>
          <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>Miesiąc</label>
          <select className="admin-form-select" value={data.month || ""} onChange={set("month")}>
            <option value="">—</option>
            {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div className="admin-form-row" style={{ flex: 2, minWidth: 160 }}>
          <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>Motyw</label>
          <input className="admin-form-input" value={data.theme || ""} onChange={set("theme")} placeholder="Motyw miesiąca…" />
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <div className="admin-form-row" style={{ flex: 2, minWidth: 150 }}>
          <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>Tytuł książki</label>
          <input className="admin-form-input" value={data.bookTitle || ""} onChange={set("bookTitle")} />
        </div>
        <div className="admin-form-row" style={{ flex: 2, minWidth: 150 }}>
          <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>Autor</label>
          <input className="admin-form-input" value={data.bookAuthor || ""} onChange={set("bookAuthor")} />
        </div>
      </div>

      {/* Image picker */}
      <div className="admin-form-row">
        <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>URL obrazka (wybierz lub wpisz)</label>
        <input className="admin-form-input" value={data.imageUrl || ""} onChange={set("imageUrl")} />
      </div>
      {allImgs.length > 0 && (
        <div style={{ marginBottom: "0.6rem" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
            Znalezione obrazki — kliknij aby wybrać:
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {allImgs.map((src, i) => (
              <div key={i} onClick={() => onDataChange({ ...data, imageUrl: src })}
                style={{
                  cursor: "pointer", borderRadius: 6, overflow: "hidden",
                  border: `2px solid ${data.imageUrl === src ? "var(--accent)" : "var(--border)"}`,
                  opacity: data.imageUrl === src ? 1 : 0.7,
                  transition: "border-color 0.15s, opacity 0.15s",
                  background: "var(--surface)",
                }}>
                <img src={src} alt=""
                  style={{ width: 72, height: 72, objectFit: "cover", display: "block" }}
                  onError={e => { e.target.closest("div").style.display = "none"; }} />
              </div>
            ))}
          </div>
        </div>
      )}
      {data.imageUrl && (
        <img src={data.imageUrl} alt="" style={{ height: 80, borderRadius: 6, marginBottom: 8 }}
          onError={e => { e.target.style.display = "none"; }} />
      )}
      <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={onSavePending} style={{ marginTop: 4 }}>
        ✔ Zapisz miesiąc
      </button>
    </div>
  );
}

// ─── OL Catalog Section ───────────────────────────────────────────────────────
function OlCatalogSection() {
  const [status,   setStatus]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [msg,      setMsg]      = useState(null);
  const [polling,  setPolling]  = useState(false);

  const loadStatus = () => {
    fetch(API.OL_IMPORT_STATUS, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setStatus(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadStatus();
  }, []);

  // Poll every 5 seconds while import is running
  useEffect(() => {
    if (!status?.running && polling) { setPolling(false); return; }
    if (!status?.running) return;
    setPolling(true);
    const id = setInterval(loadStatus, 5000);
    return () => clearInterval(id);
  }, [status?.running]);

  const handleTrigger = (mode) => {
    setMsg(null);
    fetch(API.OL_IMPORT_TRIGGER, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    })
      .then(async r => {
        const d = await r.json();
        if (!r.ok || d.error) {
          const text = d.error || `Błąd HTTP ${r.status}`;
          setMsg({ ok: false, text });
          return;
        }
        setMsg({ ok: true, text: `Import (${mode}) uruchomiony w tle. Status odświeża się automatycznie co 5 s.` });
        setTimeout(loadStatus, 1000);
      })
      .catch(() => setMsg({ ok: false, text: "Błąd połączenia z serwerem." }));
  };

  const fmt = (n) => n?.toLocaleString("pl-PL") ?? "—";
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString("pl-PL") : "—";
  const fmtDuration = (sec) => {
    if (!sec) return "—";
    const m = Math.floor(sec / 60), s = sec % 60;
    return m > 0 ? `${m} min ${s} s` : `${s} s`;
  };

  return (
    <div className="admin-section">
      <h2 className="section-title admin-section-title">📚 Katalog Open Library</h2>
      <p className="admin-section-sub">
        Baza startowa autorów i tytułów importowana z Open Library. Import działa w tle i nie wpływa na działanie aplikacji.
        Miesięczna aktualizacja automatycznie uruchamia się 1. dnia miesiąca o 3:00.
      </p>

      {msg && (
        <div style={{ fontSize: "0.85rem", marginBottom: "1rem", color: msg.ok ? "var(--success)" : "var(--danger)" }}>
          {msg.ok ? "✔ " : "✖ "}{msg.text}
          <button style={{ marginLeft: 8, fontSize: "0.78rem", background: "none", border: "none", cursor: "pointer" }} onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {loading ? (
        <div className="admin-loading">Ładowanie…</div>
      ) : (
        <>
          {/* Stats */}
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
            <div style={statCardStyle}>
              <span style={statLabelStyle}>Książki w katalogu</span>
              <span style={statValueStyle}>{fmt(status?.totalBooks)}</span>
            </div>
            <div style={statCardStyle}>
              <span style={statLabelStyle}>Autorzy w katalogu</span>
              <span style={statValueStyle}>{fmt(status?.totalAuthors)}</span>
            </div>
            {status?.lastRun && (
              <>
                <div style={statCardStyle}>
                  <span style={statLabelStyle}>Ostatni import</span>
                  <span style={statValueStyle} title={status.lastRun.runAt}>{fmtDate(status.lastRun.runAt)}</span>
                </div>
                <div style={statCardStyle}>
                  <span style={statLabelStyle}>Tryb</span>
                  <span style={statValueStyle}>{status.lastRun.mode}</span>
                </div>
                <div style={statCardStyle}>
                  <span style={statLabelStyle}>Czas trwania</span>
                  <span style={statValueStyle}>{fmtDuration(status.lastRun.durationSeconds)}</span>
                </div>
                <div style={statCardStyle}>
                  <span style={statLabelStyle}>Przetworzone / wstawione</span>
                  <span style={statValueStyle}>{fmt(status.lastRun.booksProcessed)} / {fmt(status.lastRun.booksInserted)}</span>
                </div>
                <div style={statCardStyle}>
                  <span style={statLabelStyle}>Status</span>
                  <span style={{
                    ...statValueStyle,
                    color: status.lastRun.status === "ok" ? "var(--success,#22c55e)" : status.lastRun.status === "partial" ? "var(--warning,#f59e0b)" : "var(--error,#ef4444)"
                  }}>
                    {status.lastRun.status === "ok" ? "✓ Zakończony" : status.lastRun.status === "partial" ? "⚠ Częściowy" : status.lastRun.status || "–"}
                  </span>
                  {status.lastRun.status === "partial" && status.lastRun.errorMessage && (
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginTop: 4 }} title={status.lastRun.errorMessage}>
                      Pobieranie przerwane (częściowe dane zapisane)
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Running indicator */}
          {status?.running && (
            <div style={{ background: "var(--accent-dim,rgba(99,102,241,.1))", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.85rem" }}>
              ⏳ Import w toku…{" "}
              <strong>{status.phase === "authors" ? "Autorzy" : status.phase === "works" ? "Dzieła" : status.phase}</strong>
              {" — "}{fmt(status.currentLines)} wierszy
            </div>
          )}

          {/* Trigger buttons */}
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              className="admin-btn"
              disabled={status?.running}
              onClick={() => handleTrigger("diff")}
            >
              {status?.running ? "Import w toku…" : "▶ Uruchom aktualizację (diff)"}
            </button>
            <button
              className="admin-btn admin-btn-secondary"
              disabled={status?.running}
              onClick={() => {
                if (!window.confirm("Import pełny (init) pobierze ~3–4 GB danych (dump OL) i przetworzy książki z gatunków: Fantasy, Romantasy, Dark Romance, Sci-Fi, Horror, Mystery/Thriller, Romance, YA. Oczekiwana liczba rekordów: ~200–400k książek, ~150–200k autorów. Czas trwania: 20–40 minut. Kontynuować?")) return;
                handleTrigger("init");
              }}
            >
              ♻ Pełny import (init)
            </button>
            <button
              className="admin-btn admin-btn-ghost"
              onClick={loadStatus}
              disabled={status?.running}
            >
              ↻ Odśwież status
            </button>
          </div>

          {!status?.lastRun && status?.totalBooks === 0 && (
            <p style={{ marginTop: "1rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              💡 Katalog jest pusty. Uruchom <strong>Pełny import (init)</strong> aby zasilić bazę danych.{" "}
              Import obejmuje gatunki: <em>Fantasy, Romantasy, Dark Romance, Sci-Fi, Horror, Mystery/Thriller, Romance, YA</em> — książki anglojęzyczne z lat 1980+.
              Spodziewana liczba rekordów: ~200–400k książek, czas: 20–40 min.
            </p>
          )}
        </>
      )}
    </div>
  );
}

const statCardStyle = {
  background: "var(--surface-raised)",
  borderRadius: 8,
  padding: "0.75rem 1rem",
  minWidth: 130,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};
const statLabelStyle = { fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" };
const statValueStyle = { fontSize: "1.1rem", fontWeight: 600 };

// ─── Import: Pending Queue Section ───────────────────────────────────────────
function ImportsSection() {
  const [pending,  setPending]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState({});
  const [approveEditions, setApproveEditions] = useState({});
  const [msg,      setMsg]      = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(API.ADMIN_IMPORT_PENDING, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(list => { setPending(list); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const getEdit = item => editing[item.id] ?? {
    year: item.year, month: item.month, theme: item.theme,
    bookTitle: item.bookTitle, bookAuthor: item.bookAuthor, imageUrl: item.imageUrl,
  };

  const setEdit = (id, field, value) =>
    setEditing(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), [field]: value } }));

  const handleApprove = item => {
    const data = getEdit(item);
    const selectedEd = approveEditions[item.id] ?? null;
    const payload = {
      ...data,
      bookId: data.bookId || null,
      editionId: selectedEd ? selectedEd.id : null,
    };
    fetch(API.ADMIN_IMPORT_PENDING_APPROVE(item.id), {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(r => r.json())
      .then(d => { setMsg({ ok: true, text: d.message || "Zatwierdzono." }); load(); })
      .catch(() => setMsg({ ok: false, text: "Błąd zatwierdzania." }));
  };

  const handleReject = id => {
    fetch(API.ADMIN_IMPORT_PENDING_REJECT(id), { method: "POST", credentials: "include" })
      .then(() => { setMsg({ ok: true, text: "Odrzucono." }); load(); })
      .catch(() => setMsg({ ok: false, text: "Błąd." }));
  };

  const MONTHS = ["","Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];

  return (
    <div className="admin-section">
      <h2 className="section-title admin-section-title">🔄 Oczekujące importy</h2>
      <p className="admin-section-sub">Przejrzyj i zatwierdź lub odrzuć wpisy pobrane automatycznie ze źródeł RSS / blogów.</p>

      {msg && (
        <div style={{ fontSize: "0.85rem", marginBottom: "1rem", color: msg.ok ? "var(--success)" : "var(--danger)" }}>
          {msg.ok ? "✔ " : "✖ "}{msg.text}
          <button style={{ marginLeft: 8, fontSize: "0.78rem", background: "none", border: "none", cursor: "pointer" }} onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {loading ? (
        <div className="admin-loading">Ładowanie…</div>
      ) : pending.length === 0 ? (
        <div className="admin-empty">Brak oczekujących importów. 🎉</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {pending.map(item => {
            const e = getEdit(item);
            const set = field => ev => setEdit(item.id, field, ev.target.value);
            const selectedEd = approveEditions[item.id] ?? null;
            return (
              <div key={item.id} style={{ background: "var(--surface-raised)", borderRadius: 10, padding: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-ghost)" }}>
                    Sub: <strong>{item.subscriptionId}</strong> ·{" "}
                    {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>źródło</a>}
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-ghost)" }}>
                    {item.createdAt ? new Date(item.createdAt).toLocaleString("pl-PL") : ""}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <div className="admin-form-row" style={{ flex: 1, minWidth: 80 }}>
                    <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>Rok</label>
                    <input className="admin-form-input" type="number" value={e.year || ""} onChange={set("year")} />
                  </div>
                  <div className="admin-form-row" style={{ flex: 1, minWidth: 130 }}>
                    <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>Miesiąc</label>
                    <select className="admin-form-select" value={e.month || ""} onChange={set("month")}>
                      <option value="">—</option>
                      {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                    </select>
                  </div>
                  <div className="admin-form-row" style={{ flex: 3, minWidth: 180 }}>
                    <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>Motyw</label>
                    <input className="admin-form-input" value={e.theme || ""} onChange={set("theme")} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <div className="admin-form-row" style={{ flex: 2, minWidth: 150 }}>
                    <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>Tytuł książki</label>
                    <input className="admin-form-input" value={e.bookTitle || ""} onChange={set("bookTitle")} />
                  </div>
                  <div className="admin-form-row" style={{ flex: 2, minWidth: 150 }}>
                    <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>Autor</label>
                    <input className="admin-form-input" value={e.bookAuthor || ""} onChange={set("bookAuthor")} />
                  </div>
                </div>
                <div className="admin-form-row">
                  <label className="admin-form-label" style={{ fontSize: "0.78rem" }}>URL obrazka</label>
                  <input className="admin-form-input" value={e.imageUrl || ""} onChange={set("imageUrl")} />
                </div>
                {e.imageUrl && (
                  <img src={e.imageUrl} alt="" style={{ height: 70, borderRadius: 6, marginBottom: 8 }}
                    onError={ev => { ev.target.style.display = "none"; }} />
                )}
                {item.companyId && (
                  <EditionSearchWidget
                    companyId={item.companyId}
                    selectedEdition={selectedEd}
                    onSelect={ed => setApproveEditions(prev => ({ ...prev, [item.id]: ed }))}
                    onClear={() => setApproveEditions(prev => ({ ...prev, [item.id]: null }))}
                  />
                )}
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                  <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => handleApprove(item)}>
                    ✔ Zatwierdź
                  </button>
                  <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => handleReject(item.id)}>
                    ✕ Odrzuć
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmailSection() {
  const [sending, setSending] = useState(false);
  const [result, setResult]   = useState(null);
  const [form, setForm]       = useState({ to: "", subject: "", content: "" });

  const handleSend = () => {
    setResult(null);
    const { to, subject, content } = form;
    if (!to.trim() || !to.includes("@")) {
      setResult({ ok: false, msg: "Podaj prawidłowy adres email." }); return;
    }
    if (!subject.trim()) {
      setResult({ ok: false, msg: "Tytuł nie może być pusty." }); return;
    }
    if (!content.trim()) {
      setResult({ ok: false, msg: "Treść nie może być pusta." }); return;
    }
    setSending(true);
    fetch(API.ADMIN_SEND_EMAIL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: to.trim(), subject: subject.trim(), content: content.trim() }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok) {
          setResult({ ok: true, msg: d.message || "Mail wysłany!" });
          setForm({ to: "", subject: "", content: "" });
        } else {
          setResult({ ok: false, msg: d.error || "Błąd wysyłki." });
        }
      })
      .catch(() => setResult({ ok: false, msg: "Błąd połączenia." }))
      .finally(() => setSending(false));
  };

  return (
    <div className="admin-section">
      <h2 className="section-title admin-section-title">✉️ Wyślij email</h2>
      <p className="admin-section-sub">Wyślij wiadomość na dowolny adres email. Mail zostanie wysłany z <strong>noreply@luxgrimoire.com</strong>.</p>

      <div className="notif-form" style={{ maxWidth: 600 }}>
        <label className="admin-label">Adres email odbiorcy</label>
        <input
          className="admin-input"
          type="email"
          placeholder="odbiorca@example.com"
          value={form.to}
          onChange={e => setForm(f => ({ ...f, to: e.target.value }))}
        />

        <label className="admin-label" style={{ marginTop: "1rem" }}>Tytuł</label>
        <input
          className="admin-input"
          type="text"
          placeholder="Temat wiadomości…"
          value={form.subject}
          onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
        />

        <label className="admin-label" style={{ marginTop: "1rem" }}>Treść</label>
        <p style={{ fontSize: "0.78rem", color: "var(--text-ghost)", marginBottom: "0.4rem" }}>
          Obsługiwany jest HTML — możesz używać tagów jak <code>&lt;b&gt;</code>, <code>&lt;p&gt;</code>, <code>&lt;a href="..."&gt;</code> itp.
        </p>
        <textarea
          className="admin-input"
          rows={10}
          placeholder="Treść maila… (HTML jest obsługiwany)"
          value={form.content}
          onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
          style={{ resize: "vertical", fontFamily: "monospace", fontSize: "0.85rem" }}
        />

        {result && (
          <div className={`notif-send-result ${result.ok ? "ok" : "error"}`} style={{ marginTop: "0.75rem" }}>
            {result.ok ? "✔ " : "✖ "}{result.msg}
          </div>
        )}

        <button
          className="page-btn primary"
          style={{ marginTop: "1rem" }}
          onClick={handleSend}
          disabled={sending}
        >
          {sending ? "Wysyłanie…" : "Wyślij email"}
        </button>
      </div>
    </div>
  );
}

// ─── Audit Log Section ────────────────────────────────────────────────────────
function SalesSection() {
  const [companies, setCompanies] = useState([]);
  useEffect(() => {
    fetch(API.ADMIN_COMPANIES, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setCompanies(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);
  return <SaleAnnouncementAdminPage companies={companies} />;
}

function AuditLogSection() {
  const [logs, setLogs]           = useState([]);
  const [page, setPage]           = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [filterAction, setFilterAction]   = useState("");
  const [filterEntity, setFilterEntity]   = useState("");
  const [filterUser,   setFilterUser]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  const ACTIONS = ["", "CREATE", "UPDATE", "DELETE", "TRIGGER", "UPLOAD", "EMAIL"];

  const load = useCallback((p = 0) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: p, size: 50 });
    if (filterAction) params.set("action", filterAction);
    if (filterEntity) params.set("entityType", filterEntity);
    if (filterUser)   params.set("username", filterUser);
    fetch(`${API.ADMIN_AUDIT_LOGS}?${params}`, { credentials: "include" })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        setLogs(d.content || []);
        setTotalPages(d.totalPages || 0);
        setPage(d.page || 0);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [filterAction, filterEntity, filterUser]);

  useEffect(() => { load(0); }, [load]);

  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
  };

  const ACTION_COLORS = {
    CREATE: "#4caf50", UPDATE: "#2196f3", DELETE: "#f44336",
    TRIGGER: "#ff9800", UPLOAD: "#9c27b0", EMAIL: "#00bcd4"
  };

  return (
    <section className="admin-section">
      <h2 className="section-title admin-section-title">📋 Audit Log</h2>

      <div className="admin-filter-row" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="admin-input" style={{ minWidth: 130 }}>
          {ACTIONS.map(a => <option key={a} value={a}>{a || "All actions"}</option>)}
        </select>
        <input
          className="admin-input" placeholder="Entity type (e.g. Company)" value={filterEntity}
          onChange={e => setFilterEntity(e.target.value)} style={{ minWidth: 160 }}
        />
        <input
          className="admin-input" placeholder="Username" value={filterUser}
          onChange={e => setFilterUser(e.target.value)} style={{ minWidth: 140 }}
        />
        <button className="page-btn primary" onClick={() => load(0)}>Search</button>
        <button className="page-btn" onClick={() => {
          setFilterAction(""); setFilterEntity(""); setFilterUser("");
          setTimeout(() => load(0), 0);
        }}>Reset</button>
      </div>

      {loading && <p style={{ color: "var(--text-ghost)" }}>Loading…</p>}
      {error && <p style={{ color: "var(--color-error, #f44336)" }}>Error loading audit log: {error}</p>}
      {!loading && !error && logs.length === 0 && <p style={{ color: "var(--text-ghost)" }}>No entries found.</p>}
      {!loading && !error && logs.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table" style={{ fontSize: "0.82rem" }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>User</th>
                <th>Action</th>
                <th>Type</th>
                <th>ID</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(log.performedAt)}</td>
                  <td><code>{log.performedByUsername}</code></td>
                  <td>
                    <span style={{
                      background: ACTION_COLORS[log.action] || "#888",
                      color: "#fff", borderRadius: 4, padding: "1px 6px", fontSize: "0.75rem"
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td>{log.entityType}</td>
                  <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                    <code title={log.entityId}>{log.entityId || "—"}</code>
                  </td>
                  <td style={{ maxWidth: 340, wordBreak: "break-word" }}>{log.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPage={p => load(p)} />
    </section>
  );
}

export default function AdminPage({ onBack, initialSection = "companies" }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState(initialSection);

  // ─── helpers ─────────────────────────────────────────────────────────────
  const isFullAdmin = user && (user.role === "admin" || user.role === "superadmin");
  const isModerator = user?.role === "moderator";
  const isCompanyManager = user?.role === "company_manager";
  const userPerms   = user?.adminPermissions
    ? user.adminPermissions.split(",").map(s => s.trim()).filter(Boolean)
    : [];
  const hasAdminAccess = isFullAdmin || isModerator || isCompanyManager || userPerms.length > 0;

  const canAccess = (permission) => {
    if (!permission) return true; // no permission required → available to all with admin access
    if (isFullAdmin) return true;
    if (isModerator && (permission === "MANAGE_DATA_REQUESTS" || permission === "MANAGE_SALES")) return true;
    if (isCompanyManager && (permission === "MANAGE_COMPANIES" || permission === "MANAGE_SALES")) return true;
    return userPerms.includes(permission);
  };

  // ─── access guard ─────────────────────────────────────────────────────────
  if (!user || !hasAdminAccess) {
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

  const allNavItems = getNavItems(t);
  const navItems = allNavItems.filter(item => canAccess(item.permission));

  const renderSection = () => {
    const item = allNavItems.find(n => n.key === activeSection);
    if (item && !canAccess(item.permission)) return null;
    switch (activeSection) {
      case "companies":     return <CompaniesSection />;
      case "books":         return <BookEditionSection />;
      case "users":         return <UsersSection />;
      case "sales":         return <SalesSection />;
      case "reports":       return <ReportsSection />;
      case "data-requests": return <DataRequestsSection />;
      case "notifications": return <NotificationsAdminSection />;
      case "email":         return <EmailSection />;
      case "imports":       return <ImportsSection />;
      case "ol-catalog":    return <OlCatalogSection />;
      case "audit-log":     return <AuditLogSection />;
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
