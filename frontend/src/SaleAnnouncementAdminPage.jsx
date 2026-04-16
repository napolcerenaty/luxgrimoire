import { useState, useEffect, useCallback, useRef } from "react";
import { API } from "./api";
import "./SaleAnnouncementAdminPage.css";

// Common timezones: [IANA name, display label]
const TIMEZONES = [
  ["Europe/London",       "BST / GMT (Europe/London)"],
  ["Europe/Warsaw",       "CET / CEST (Europe/Warsaw)"],
  ["Europe/Paris",        "CET / CEST (Europe/Paris)"],
  ["Europe/Berlin",       "CET / CEST (Europe/Berlin)"],
  ["Europe/Amsterdam",    "CET / CEST (Europe/Amsterdam)"],
  ["Europe/Stockholm",    "CET / CEST (Europe/Stockholm)"],
  ["Europe/Rome",         "CET / CEST (Europe/Rome)"],
  ["Europe/Madrid",       "CET / CEST (Europe/Madrid)"],
  ["America/New_York",    "EST / EDT (New York)"],
  ["America/Chicago",     "CST / CDT (Chicago)"],
  ["America/Denver",      "MST / MDT (Denver)"],
  ["America/Los_Angeles", "PST / PDT (Los Angeles)"],
  ["America/Toronto",     "EST / EDT (Toronto)"],
  ["America/Vancouver",   "PST / PDT (Vancouver)"],
  ["America/Sao_Paulo",   "BRT (São Paulo)"],
  ["Australia/Sydney",    "AEST / AEDT (Sydney)"],
  ["Australia/Melbourne", "AEST / AEDT (Melbourne)"],
  ["Pacific/Auckland",    "NZST / NZDT (Auckland)"],
  ["Asia/Tokyo",          "JST (Tokyo)"],
  ["Asia/Seoul",          "KST (Seoul)"],
  ["Asia/Kolkata",        "IST (Kolkata)"],
  ["UTC",                 "UTC"],
];

const EMPTY_FORM = {
  title: "",
  companyId: "",
  generalSaleDate: "",
  generalSaleTime: "",
  firstAccessDate: "",
  firstAccessTime: "",
  earlyAccessDate: "",
  earlyAccessTime: "",
  saleTimezone: "Europe/London",
  basePrice: "",
  currency: "GBP",
  description: "",
  imageUrl: "",
};

/** Combine a date string and time string into an ISO-like "YYYY-MM-DDThh:mm" string,
 *  or return empty string if date is blank. */
function combine(date, time) {
  if (!date) return "";
  return time ? `${date}T${time}` : date;
}

/** Split a stored datetime-ish string into {date, time} parts. */
function split(dt) {
  if (!dt) return { date: "", time: "" };
  const [date, time = ""] = dt.split("T");
  return { date, time: time.substring(0, 5) }; // keep HH:mm only
}

export default function SaleAnnouncementAdminPage({ companies = [] }) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = new, or sale object
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [imgMode, setImgMode] = useState("url"); // "url" | "upload"
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Edition picker state
  const [selectedSaleId, setSelectedSaleId] = useState(null);
  const [selectedSaleCompanyId, setSelectedSaleCompanyId] = useState(null);
  const [editions, setEditions] = useState([]);
  const [editionSearch, setEditionSearch] = useState("");
  const [editionResults, setEditionResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const loadSales = useCallback(() => {
    setLoading(true);
    fetch(API.SALES, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setSales)
      .catch(() => setSales([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadSales(); }, [loadSales]);

  const loadEditions = (saleId) => {
    fetch(API.SALE_EDITIONS(saleId), { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setEditions)
      .catch(() => setEditions([]));
  };

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError(null);
  };

  const openEdit = (sale) => {
    setEditing(sale);
    const gs = split(sale.generalSaleDate || sale.saleDate || "");
    const fa = split(sale.firstAccessDate || "");
    const ea = split(sale.earlyAccessDate || "");
    setForm({
      title: sale.title || "",
      companyId: sale.companyId || "",
      generalSaleDate: gs.date,
      generalSaleTime: gs.time,
      firstAccessDate: fa.date,
      firstAccessTime: fa.time,
      earlyAccessDate: ea.date,
      earlyAccessTime: ea.time,
      saleTimezone: sale.saleTimezone || "Europe/London",
      basePrice: sale.basePrice != null ? String(sale.basePrice) : "",
      currency: sale.currency || "GBP",
      description: sale.description || "",
      imageUrl: sale.imageUrl || "",
    });
    setImgMode("url");
    setShowForm(true);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      title: form.title,
      companyId: form.companyId || null,
      generalSaleDate: combine(form.generalSaleDate, form.generalSaleTime) || null,
      firstAccessDate: combine(form.firstAccessDate, form.firstAccessTime) || null,
      earlyAccessDate: combine(form.earlyAccessDate, form.earlyAccessTime) || null,
      saleTimezone: form.saleTimezone || "Europe/London",
      basePrice: form.basePrice !== "" ? parseFloat(form.basePrice) : null,
      currency: form.currency || null,
      description: form.description || null,
      imageUrl: form.imageUrl || null,
    };
    try {
      const url = editing ? API.SALE(editing.id) : API.SALES;
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowForm(false);
      loadSales();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this sale?")) return;
    await fetch(API.SALE(id), { method: "DELETE", credentials: "include" });
    loadSales();
  };

  const openEditionPicker = (sale) => {
    setSelectedSaleId(sale.id);
    setSelectedSaleCompanyId(sale.companyId || null);
    loadEditions(sale.id);
  };

  const handleEditionSearch = async (q) => {
    setEditionSearch(q);
    if (q.trim().length < 2) { setEditionResults([]); return; }
    setSearchLoading(true);
    try {
      let searchUrl = `${API.SEARCH}?q=${encodeURIComponent(q)}&filter=edition`;
      if (selectedSaleCompanyId) searchUrl += `&editionCompanyId=${encodeURIComponent(selectedSaleCompanyId)}`;
      const res = await fetch(searchUrl, { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data.editions || []);
      setEditionResults(arr.slice(0, 10));
    } catch {
      setEditionResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const addEdition = async (editionId) => {
    if (!selectedSaleId) return;
    const res = await fetch(API.SALE_EDITIONS(selectedSaleId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ editionId, sortOrder: editions.length }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if (d.error === "edition_already_added") {
        alert("This edition is already linked to this sale.");
      }
      return;
    }
    loadEditions(selectedSaleId);
    setEditionResults([]);
    setEditionSearch("");
  };

  const removeEdition = async (saleEditionId, editionId) => {
    await fetch(API.SALE_EDITION(selectedSaleId, editionId), {
      method: "DELETE",
      credentials: "include",
    });
    loadEditions(selectedSaleId);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(API.UPLOAD_IMAGE, { method: "POST", credentials: "include", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      setForm(p => ({ ...p, imageUrl: url }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const f = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="sa-page">
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <h2 style={{ margin: 0 }}>Sale Announcements</h2>
        <button onClick={openNew} className="sa-btn" style={{ background: "#7c3aed" }}>+ New Sale</button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="sa-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Company</th>
              <th>General Sale</th>
              <th>Price</th>
              <th>Editions</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id}>
                <td>{s.title}</td>
                <td>{s.companyName || s.companyId || "—"}</td>
                <td>{s.generalSaleDate || s.saleDate || "—"}</td>
                <td>{s.basePrice ? `${s.basePrice} ${s.currency}` : "—"}</td>
                <td>{s.editionCount ?? 0}</td>
                <td>
                  <button onClick={() => openEdit(s)} className="sa-btn-sm" style={{ background: "#6366f1" }}>Edit</button>{" "}
                  <button onClick={() => openEditionPicker(s)} className="sa-btn-sm" style={{ background: "#0ea5e9" }}>Editions</button>{" "}
                  <button onClick={() => handleDelete(s.id)} className="sa-btn-sm" style={{ background: "#dc2626" }}>Delete</button>
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr><td colSpan={6} style={{ padding: "1rem", textAlign: "center", color: "var(--text-faint)" }}>No sales yet.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {/* Create / Edit Form */}
      {showForm && (
        <div className="sa-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="sa-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? "Edit Sale" : "New Sale"}</h3>

            <label className="sa-label">Title *
              <input className="sa-input" value={form.title} onChange={f("title")} />
            </label>

            <label className="sa-label">Company
              <select className="sa-select" value={form.companyId} onChange={f("companyId")}>
                <option value="">— None —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            {/* Timezone — applies to all 3 dates */}
            <label className="sa-label">Sale Timezone
              <select className="sa-select" value={form.saleTimezone} onChange={f("saleTimezone")}>
                {TIMEZONES.map(([tz, label]) => <option key={tz} value={tz}>{label}</option>)}
              </select>
            </label>

            {/* First Access */}
            <p className="sa-section-title">First Access</p>
            <div className="sa-date-row">
              <label className="sa-label" style={{ margin: 0 }}>Date
                <input className="sa-input" type="date" value={form.firstAccessDate} onChange={f("firstAccessDate")} />
              </label>
              <label className="sa-label-tz">Time
                <input className="sa-input" type="time" value={form.firstAccessTime} onChange={f("firstAccessTime")} />
              </label>
            </div>

            {/* Early Access */}
            <p className="sa-section-title">Early Access</p>
            <div className="sa-date-row">
              <label className="sa-label" style={{ margin: 0 }}>Date
                <input className="sa-input" type="date" value={form.earlyAccessDate} onChange={f("earlyAccessDate")} />
              </label>
              <label className="sa-label-tz">Time
                <input className="sa-input" type="time" value={form.earlyAccessTime} onChange={f("earlyAccessTime")} />
              </label>
            </div>

            {/* General Sale */}
            <p className="sa-section-title">General Sale *</p>
            <div className="sa-date-row">
              <label className="sa-label" style={{ margin: 0 }}>Date
                <input className="sa-input" type="date" value={form.generalSaleDate} onChange={f("generalSaleDate")} />
              </label>
              <label className="sa-label-tz">Time
                <input className="sa-input" type="time" value={form.generalSaleTime} onChange={f("generalSaleTime")} />
              </label>
            </div>

            <div className="sa-grid-2" style={{ marginTop: "0.85rem" }}>
              <label className="sa-label">Base Price
                <input className="sa-input" type="number" step="0.01" value={form.basePrice} onChange={f("basePrice")} />
              </label>
              <label className="sa-label">Currency
                <input className="sa-input" value={form.currency} onChange={f("currency")} maxLength={10} />
              </label>
            </div>

            <label className="sa-label">Description
              <textarea className="sa-textarea" value={form.description} onChange={f("description")} />
            </label>

            {/* Image: URL or file upload */}
            <p className="sa-section-title">Image</p>
            <div className="sa-img-toggle">
              <button className={imgMode === "url" ? "active" : ""} onClick={() => setImgMode("url")}>URL</button>
              <button className={imgMode === "upload" ? "active" : ""} onClick={() => setImgMode("upload")}>Upload file</button>
            </div>
            {imgMode === "url" ? (
              <label className="sa-label">Image URL
                <input className="sa-input" value={form.imageUrl} onChange={f("imageUrl")} placeholder="https://…" />
              </label>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={handleImageUpload} />
                <button className="sa-btn" style={{ background: "#0ea5e9", width: "fit-content" }}
                  onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? "Uploading…" : "Choose image…"}
                </button>
                {form.imageUrl && (
                  <span style={{ fontSize: "0.8rem", color: "var(--text-faint)", wordBreak: "break-all" }}>
                    {form.imageUrl}
                  </span>
                )}
              </div>
            )}
            {form.imageUrl && (
              <img src={form.imageUrl} alt="" style={{ maxWidth: "100%", maxHeight: 120, marginTop: "0.5rem", borderRadius: 4 }} />
            )}

            {error && <div className="sa-error">{error}</div>}
            <div className="sa-btn-row">
              <button onClick={() => setShowForm(false)} className="sa-btn-sm" style={{ background: "#6b7280", padding: "0.35rem 0.9rem" }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} className="sa-btn" style={{ background: "#7c3aed" }}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edition Picker */}
      {selectedSaleId && (
        <div className="sa-modal-overlay" onClick={() => { setSelectedSaleId(null); setSelectedSaleCompanyId(null); }}>
          <div className="sa-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Manage Editions</h3>

            <p className="sa-section-title">Linked editions</p>
            {editions.length === 0 ? (
              <p style={{ color: "var(--text-faint)", fontSize: "0.88rem" }}>None added yet.</p>
            ) : (
              <ul className="sa-edition-list">
                {editions.map((e) => {
                  const label = [e.bookTitle, e.editionName].filter(Boolean).join(" — ") || e.editionId;
                  return (
                    <li key={e.id}>
                      <span>{label}</span>
                      <button onClick={() => removeEdition(e.id, e.editionId)} className="sa-btn-sm" style={{ background: "#dc2626" }}>Remove</button>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="sa-section-title">Add edition (search by title{selectedSaleCompanyId ? " — filtered by company" : ""})</p>
            <input
              className="sa-input"
              placeholder="Search editions…"
              value={editionSearch}
              onChange={(e) => handleEditionSearch(e.target.value)}
            />
            {searchLoading && <p style={{ color: "var(--text-faint)", fontSize: "0.85rem" }}>Searching…</p>}
            {editionResults.length > 0 && (
              <ul className="sa-search-results">
                {editionResults.map((r) => {
                  const id = r.id || r.editionId;
                  const label = [r.bookTitle || r.title, r.editionName].filter(Boolean).join(" — ");
                  return (
                    <li key={id} onClick={() => addEdition(id)}>{label || id}</li>
                  );
                })}
              </ul>
            )}

            <div className="sa-btn-row">
              <button onClick={() => { setSelectedSaleId(null); setSelectedSaleCompanyId(null); }} className="sa-btn-sm" style={{ background: "#6b7280", padding: "0.35rem 0.9rem" }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

