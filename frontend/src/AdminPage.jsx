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

// ─── SECTION: Book Boxy ───────────────────────────────────────────────────────
function CompaniesSection() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    fetch(API.ADMIN_COMPANIES, { credentials: "include" })
      .then(r => r.json())
      .then(data => { setCompanies(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <section className="account-section">
      <h2 className="account-section-title">📦 Book Boxy</h2>
      {loading ? (
        <div className="status-container"><div className="spinner" /></div>
      ) : companies.length === 0 ? (
        <p className="admin-empty">Brak book boxów w bazie.</p>
      ) : (
        <div className="admin-company-grid">
          {companies.map(c => (
            <div key={c.id} className="admin-company-card">
              {c.logoUrl
                ? <img src={`${API.BASE}${c.logoUrl}`} alt={c.name} className="admin-company-card-logo"
                    onError={e => { e.target.style.display="none"; }} />
                : <div className="admin-company-card-logo-placeholder">📦</div>
              }
              <p className="admin-company-name">{c.name}</p>
              {c.location && <p className="admin-company-meta">📍 {c.location}</p>}
              <p className="admin-company-meta">
                {(c.subscriptions?.length ?? 0)} subskrypcji
              </p>
            </div>
          ))}
        </div>
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
