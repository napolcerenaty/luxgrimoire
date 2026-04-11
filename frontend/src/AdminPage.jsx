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

// ─── Company Form Modal ───────────────────────────────────────────────────────
function CompanyFormModal({ company, onSave, onClose, submitting }) {
  const isEdit = Boolean(company);
  const [form, setForm] = useState({
    name:            company?.name            || "",
    logoUrl:         company?.logoUrl         || "",
    websiteUrl:      company?.websiteUrl      || "",
    description:     company?.description     || "",
    location:        company?.location        || "",
    defaultCurrency: company?.defaultCurrency || "",
  });

  const set = field => e => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = e => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h3 className="admin-modal-title">{isEdit ? "Edytuj Book Box" : "Nowy Book Box"}</h3>
          <button className="admin-modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="admin-form" onSubmit={handleSubmit}>
          <div className="admin-form-row">
            <label className="admin-form-label">Nazwa *</label>
            <input className="admin-form-input" value={form.name} onChange={set("name")} required />
          </div>
          <div className="admin-form-row">
            <label className="admin-form-label">URL logo</label>
            <input className="admin-form-input" value={form.logoUrl} onChange={set("logoUrl")} placeholder="https://…" />
          </div>
          <div className="admin-form-row">
            <label className="admin-form-label">Strona WWW</label>
            <input className="admin-form-input" value={form.websiteUrl} onChange={set("websiteUrl")} placeholder="https://…" />
          </div>
          <div className="admin-form-row">
            <label className="admin-form-label">Opis</label>
            <textarea className="admin-form-textarea" value={form.description} onChange={set("description")} rows={3} />
          </div>
          <div className="admin-form-row">
            <label className="admin-form-label">Lokalizacja</label>
            <input className="admin-form-input" value={form.location} onChange={set("location")} placeholder="Poland" />
          </div>
          <div className="admin-form-row">
            <label className="admin-form-label">Waluta</label>
            <input className="admin-form-input" value={form.defaultCurrency} onChange={set("defaultCurrency")} placeholder="PLN" style={{ maxWidth: 120 }} />
          </div>
          <div className="admin-form-btns">
            <button type="button" className="admin-btn admin-btn--ghost" onClick={onClose}>Anuluj</button>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={submitting}>
              {submitting ? "Zapisywanie…" : isEdit ? "Zapisz zmiany" : "Utwórz"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Subscription Form Modal ──────────────────────────────────────────────────
function SubscriptionFormModal({ onSave, onClose, submitting }) {
  const [form, setForm] = useState({
    name:                 "",
    type:                 "MONTHLY",
    basePrice:            "",
    shipsInternationally: true,
    bookishMerch:         false,
    genres:               "",
  });

  const set    = field => e   => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const toggle = field => ()  => setForm(prev => ({ ...prev, [field]: !prev[field] }));

  const handleSubmit = e => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      name:                 form.name.trim(),
      type:                 form.type,
      basePrice:            form.basePrice ? parseFloat(form.basePrice) : null,
      shipsInternationally: form.shipsInternationally,
      bookishMerch:         form.bookishMerch,
      genres:               form.genres.split(",").map(g => g.trim()).filter(Boolean),
    });
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h3 className="admin-modal-title">Nowa subskrypcja</h3>
          <button className="admin-modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="admin-form" onSubmit={handleSubmit}>
          <div className="admin-form-row">
            <label className="admin-form-label">Nazwa *</label>
            <input className="admin-form-input" value={form.name} onChange={set("name")} required />
          </div>
          <div className="admin-form-row">
            <label className="admin-form-label">Typ</label>
            <select className="admin-form-select" value={form.type} onChange={set("type")}>
              <option value="MONTHLY">Miesięczna (MONTHLY)</option>
              <option value="BI_MONTHLY">Co dwa miesiące (BI_MONTHLY)</option>
              <option value="QUARTERLY">Kwartalna (QUARTERLY)</option>
            </select>
          </div>
          <div className="admin-form-row">
            <label className="admin-form-label">Cena bazowa</label>
            <input className="admin-form-input" type="number" step="0.01" min="0"
              value={form.basePrice} onChange={set("basePrice")} placeholder="0.00" style={{ maxWidth: 140 }} />
          </div>
          <div className="admin-form-row">
            <label className="admin-form-label">Gatunki (przecinek)</label>
            <input className="admin-form-input" value={form.genres} onChange={set("genres")} placeholder="Fantasy, YA, Horror" />
          </div>
          <div className="admin-form-row admin-form-row--check">
            <label className="admin-form-check">
              <input type="checkbox" checked={form.shipsInternationally} onChange={toggle("shipsInternationally")} />
              Wysyłka międzynarodowa
            </label>
          </div>
          <div className="admin-form-row admin-form-row--check">
            <label className="admin-form-check">
              <input type="checkbox" checked={form.bookishMerch} onChange={toggle("bookishMerch")} />
              Bookish merch
            </label>
          </div>
          <div className="admin-form-btns">
            <button type="button" className="admin-btn admin-btn--ghost" onClick={onClose}>Anuluj</button>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={submitting}>
              {submitting ? "Dodawanie…" : "Dodaj subskrypcję"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Company Detail View ──────────────────────────────────────────────────────
function CompanyDetailView({ company, onBack, onEdit, onDelete, onAddSub, onDeleteSub }) {
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

      <div className="admin-subs-section">
        <div className="admin-section-header">
          <h3 className="admin-subs-title">Subskrypcje ({company.subscriptions?.length ?? 0})</h3>
          <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={onAddSub}>
            + Dodaj subskrypcję
          </button>
        </div>

        {company.subscriptions?.length > 0 ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nazwa</th>
                  <th>Typ</th>
                  <th>Cena</th>
                  <th>Merch</th>
                  <th>Gatunki</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {company.subscriptions.map(sub => (
                  <tr key={sub.id}>
                    <td><strong>{sub.name}</strong></td>
                    <td>{sub.type || "—"}</td>
                    <td>{sub.basePrice != null ? `${sub.basePrice} ${company.defaultCurrency || ""}` : "—"}</td>
                    <td>{sub.bookishMerch ? "✓" : "—"}</td>
                    <td>{sub.genres?.join(", ") || "—"}</td>
                    <td>
                      <button className="admin-action-btn admin-action-btn--danger" title="Usuń subskrypcję"
                        onClick={() => onDeleteSub(sub)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-empty">Brak subskrypcji dla tego book boxa.</p>
        )}
      </div>
    </div>
  );
}

// ─── SECTION: Book Boxy ───────────────────────────────────────────────────────
function CompaniesSection() {
  const [companies,        setCompanies]        = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [selectedCompany,  setSelectedCompany]  = useState(null);
  const [showCompanyForm,  setShowCompanyForm]  = useState(false);
  const [editingCompany,   setEditingCompany]   = useState(null);
  const [showSubForm,      setShowSubForm]      = useState(false);
  const [submitting,       setSubmitting]       = useState(false);

  const fetchCompanies = useCallback(() => {
    setLoading(true);
    fetch(API.ADMIN_COMPANIES, { credentials: "include" })
      .then(r => r.json())
      .then(data => { setCompanies(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const refreshCompany = useCallback((id) => {
    fetch(API.ADMIN_COMPANY(id), { credentials: "include" })
      .then(r => r.json())
      .then(c => setSelectedCompany(c))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleOpenDetail = (company) => setSelectedCompany(company);

  const handleBackToList = () => {
    setSelectedCompany(null);
    fetchCompanies();
  };

  const handleEditCompany = (company) => {
    setEditingCompany(company);
    setShowCompanyForm(true);
  };

  const handleDeleteCompany = async (company) => {
    if (!window.confirm(`Usunąć "${company.name}"? Tej operacji nie można cofnąć.`)) return;
    await fetch(API.ADMIN_COMPANY(company.id), { method: "DELETE", credentials: "include" });
    setSelectedCompany(null);
    fetchCompanies();
  };

  const handleSaveCompany = async (formData) => {
    setSubmitting(true);
    try {
      const method = editingCompany ? "PUT" : "POST";
      const url    = editingCompany ? API.ADMIN_COMPANY(editingCompany.id) : API.ADMIN_COMPANIES;
      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (r.ok) {
        setShowCompanyForm(false);
        setEditingCompany(null);
        if (selectedCompany && editingCompany?.id === selectedCompany.id) {
          refreshCompany(selectedCompany.id);
        } else {
          fetchCompanies();
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddSubscription = async (formData) => {
    setSubmitting(true);
    try {
      const r = await fetch(API.ADMIN_COMPANY_SUBS(selectedCompany.id), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (r.ok) {
        setShowSubForm(false);
        refreshCompany(selectedCompany.id);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSubscription = async (sub) => {
    if (!window.confirm(`Usunąć subskrypcję "${sub.name}"?`)) return;
    await fetch(API.ADMIN_COMPANY_SUB(selectedCompany.id, sub.id), { method: "DELETE", credentials: "include" });
    refreshCompany(selectedCompany.id);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="account-section">
      {selectedCompany ? (
        <CompanyDetailView
          company={selectedCompany}
          onBack={handleBackToList}
          onEdit={handleEditCompany}
          onDelete={handleDeleteCompany}
          onAddSub={() => setShowSubForm(true)}
          onDeleteSub={handleDeleteSubscription}
        />
      ) : (
        <>
          <div className="admin-section-header">
            <h2 className="account-section-title">📦 Book Boxy</h2>
            <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => { setEditingCompany(null); setShowCompanyForm(true); }}>
              + Dodaj Book Box
            </button>
          </div>

          {loading ? (
            <div className="status-container"><div className="spinner" /></div>
          ) : companies.length === 0 ? (
            <p className="admin-empty">Brak book boxów w bazie.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}></th>
                    <th>Nazwa</th>
                    <th>Lokalizacja</th>
                    <th>Subskrypcje</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map(c => (
                    <tr key={c.id} className="admin-company-row"
                        onClick={() => handleOpenDetail(c)}
                        title="Kliknij aby zobaczyć szczegóły">
                      <td>
                        {c.logoUrl
                          ? <img
                              src={c.logoUrl.startsWith("http") ? c.logoUrl : `${API.BASE}${c.logoUrl}`}
                              alt="" className="admin-company-list-logo"
                              onError={e => { e.target.style.display = "none"; }} />
                          : <span className="admin-company-list-logo-ph">📦</span>
                        }
                      </td>
                      <td className="admin-company-list-name">{c.name}</td>
                      <td>{c.location || "—"}</td>
                      <td>{c.subscriptions?.length ?? 0}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: "0.35rem" }}>
                          <button className="admin-action-btn" title="Edytuj"
                            onClick={() => handleEditCompany(c)}>✎</button>
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
        </>
      )}

      {showCompanyForm && (
        <CompanyFormModal
          company={editingCompany}
          onSave={handleSaveCompany}
          onClose={() => { setShowCompanyForm(false); setEditingCompany(null); }}
          submitting={submitting}
        />
      )}

      {showSubForm && (
        <SubscriptionFormModal
          onSave={handleAddSubscription}
          onClose={() => setShowSubForm(false)}
          submitting={submitting}
        />
      )}
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
