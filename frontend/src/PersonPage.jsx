import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./AuthContext";
import "./PersonPage.css";

const PAGE_SIZE = 12;

/* ── Small edition card ─────────────────────────────────── */
function EditionCard({ item, onBookClick }) {
  const cover = item.coverUrl
    || "https://placehold.co/120x180/060d18/00b4d0?text=No+Cover";
  const series = item.seriesName
    ? `${item.seriesName}${item.volumeNumber ? ` #${item.volumeNumber}` : ""}`
    : null;

  return (
    <button
      className="pe-edition-card"
      onClick={() => item.bookId && onBookClick(item.bookId)}
      disabled={!item.bookId}
    >
      <img
        className="pe-edition-cover"
        src={cover}
        alt={item.bookTitle || "edition"}
        onError={(e) => {
          e.target.src = "https://placehold.co/120x180/060d18/00b4d0?text=No+Cover";
        }}
      />
      <div className="pe-edition-info">
        {item.bookTitle && <span className="pe-edition-title">{item.bookTitle}</span>}
        {series         && <span className="pe-edition-series">{series}</span>}
        {item.boxName   && <span className="pe-edition-box">{item.boxName}</span>}
        {item.companyName && item.companyName !== item.boxName && (
          <span className="pe-edition-company">{item.companyName}</span>
        )}
      </div>
    </button>
  );
}

/* ── Main reusable person page ──────────────────────────── */
export default function PersonPage({
  personId,
  apiBase,           // e.g. "authors" or "artists"
  secondaryLabel,    // field label: "Nationality" or "Specialty"
  secondaryField,    // field name: "nationality" or "specialty"
  sectionTitle,      // e.g. "Editions featuring" (name appended)
  onBack,
  onBookClick,
}) {
  const { user } = useAuth();
  const isAdmin = user?.username === "admin";

  const [person, setPerson]     = useState(null);
  const [editions, setEditions] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [form, setForm]         = useState({});
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState(null);

  // Filter state
  const [filterBook,   setFilterBook]   = useState("");
  const [filterBox,    setFilterBox]    = useState("");
  const [filterSeries, setFilterSeries] = useState("");

  // Infinite scroll
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  // Load person + editions
  useEffect(() => {
    if (!personId) return;
    setLoading(true);
    setVisibleCount(PAGE_SIZE);
    Promise.all([
      fetch(`http://localhost:8080/api/${apiBase}/${personId}`).then((r) => r.ok ? r.json() : null),
      fetch(`http://localhost:8080/api/${apiBase}/${personId}/editions`).then((r) => r.ok ? r.json() : []),
    ]).then(([p, e]) => {
      setPerson(p);
      setEditions(e || []);
      if (p) setForm({
        name:          p.name         || "",
        bio:           p.bio          || "",
        imageUrl:      p.imageUrl     || "",
        [secondaryField]: p[secondaryField] || "",
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [personId, apiBase, secondaryField]);

  // IntersectionObserver for infinite scroll
  const observerRef = useRef(null);
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((n) => n + PAGE_SIZE);
        }
      },
      { rootMargin: "200px" }
    );
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, []);

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filterBook, filterBox, filterSeries]);

  const filtered = editions.filter((e) => {
    const q1 = filterBook.toLowerCase();
    const q2 = filterBox.toLowerCase();
    const q3 = filterSeries.toLowerCase();
    if (q1 && !(e.bookTitle || "").toLowerCase().includes(q1)) return false;
    if (q2 && !(e.boxName   || "").toLowerCase().includes(q2)) return false;
    if (q3 && !(e.seriesName|| "").toLowerCase().includes(q3)) return false;
    return true;
  });

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`http://localhost:8080/api/${apiBase}/${personId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...person, ...form }),
      });
      if (!res.ok) { setError("Failed to save."); return; }
      const saved = await res.json();
      setPerson(saved);
      setEditing(false);
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${person?.name}"? This cannot be undone.`)) return;
    setDeleting(true); setError(null);
    try {
      const res = await fetch(`http://localhost:8080/api/${apiBase}/${personId}`, {
        method: "DELETE", credentials: "include",
      });
      if (res.ok) { onBack(); return; }
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to delete.");
    } catch { setError("Network error."); }
    finally { setDeleting(false); }
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
    if (person) setForm({
      name:          person.name         || "",
      bio:           person.bio          || "",
      imageUrl:      person.imageUrl     || "",
      [secondaryField]: person[secondaryField] || "",
    });
  };

  if (loading) return <div className="person-page"><div className="pe-loading">Loading…</div></div>;
  if (!person)  return <div className="person-page"><div className="pe-loading">Not found.</div></div>;

  return (
    <div className="person-page">
      {/* ── Top bar ── */}
      <div className="pe-actions-top">
        <button className="pe-back-btn" onClick={onBack}>← Back</button>
        {isAdmin && !editing && (
          <div className="pe-actions-right">
            <button className="pe-action-btn" onClick={() => { setEditing(true); setError(null); }}>Edit</button>
            <button
              className="pe-action-btn pe-delete-btn"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        )}
        {isAdmin && editing && (
          <div className="pe-actions-right">
            <button className="pe-action-btn" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="pe-action-btn pe-cancel-btn" onClick={cancelEdit}>Cancel</button>
          </div>
        )}
      </div>

      {error && <p className="pe-error">{error}</p>}

      {/* ── Profile ── */}
      <div className="pe-profile">
        <div className="pe-photo-wrap">
          {editing ? (
            <div className="pe-photo-edit">
              {form.imageUrl && (
                <img className="pe-photo" src={form.imageUrl} alt={form.name}
                  onError={(e) => { e.target.style.display = "none"; }} />
              )}
              <label className="pe-edit-label">
                Photo URL
                <input className="pe-edit-input" value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  placeholder="https://…" />
              </label>
            </div>
          ) : person.imageUrl ? (
            <img className="pe-photo" src={person.imageUrl} alt={person.name}
              onError={(e) => { e.target.style.display = "none"; }} />
          ) : (
            <div className="pe-photo-placeholder">{person.name?.[0]?.toUpperCase() || "?"}</div>
          )}
        </div>

        <div className="pe-info">
          {editing ? (
            <>
              <label className="pe-edit-label pe-edit-name-label">
                Name
                <input className="pe-edit-input pe-edit-name-input" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="pe-edit-label">
                {secondaryLabel}
                <input className="pe-edit-input" value={form[secondaryField]}
                  onChange={(e) => setForm((f) => ({ ...f, [secondaryField]: e.target.value }))} />
              </label>
              <label className="pe-edit-label">
                Bio
                <textarea className="pe-edit-textarea" value={form.bio}
                  onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                  rows={6} placeholder="Short biography…" />
              </label>
            </>
          ) : (
            <>
              <h1 className="pe-name">{person.name}</h1>
              {person[secondaryField] && (
                <p className="pe-secondary">
                  {secondaryField === "nationality" ? "🌍" : "🎨"} {person[secondaryField]}
                </p>
              )}
              {person.bio && <p className="pe-bio">{person.bio}</p>}
            </>
          )}
        </div>
      </div>

      {/* ── Editions ── */}
      <section className="pe-editions-section">
        <h2 className="pe-editions-title">
          {sectionTitle} {person.name}
          <span className="pe-editions-count">{filtered.length}</span>
        </h2>

        {/* Filter bar */}
        {editions.length > 0 && (
          <div className="pe-filters">
            <input
              className="pe-filter-input"
              placeholder="Filter by book title…"
              value={filterBook}
              onChange={(e) => setFilterBook(e.target.value)}
            />
            <input
              className="pe-filter-input"
              placeholder="Filter by box / subscription…"
              value={filterBox}
              onChange={(e) => setFilterBox(e.target.value)}
            />
            <input
              className="pe-filter-input"
              placeholder="Filter by series…"
              value={filterSeries}
              onChange={(e) => setFilterSeries(e.target.value)}
            />
            {(filterBook || filterBox || filterSeries) && (
              <button className="pe-filter-clear" onClick={() => {
                setFilterBook(""); setFilterBox(""); setFilterSeries("");
              }}>✕ Clear</button>
            )}
          </div>
        )}

        {filtered.length === 0 && editions.length > 0 && (
          <p className="pe-no-editions">No editions match your filters.</p>
        )}
        {editions.length === 0 && (
          <p className="pe-no-editions">No editions found for {person.name} yet.</p>
        )}

        {/* Grid */}
        <div className="pe-editions-grid">
          {visible.map((item) => (
            <EditionCard key={item.editionId} item={item} onBookClick={onBookClick} />
          ))}
        </div>

        {/* Infinite scroll sentinel */}
        {hasMore && <div ref={sentinelRef} className="pe-sentinel" />}
      </section>
    </div>
  );
}
