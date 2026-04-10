import { useState, useEffect } from "react";
import "./AuthorPage.css";
import { useAuth } from "./AuthContext";

const EMPTY_FORM = { name: "", bio: "", imageUrl: "", nationality: "" };

export default function AuthorPage({ authorId, onBack, onBookClick }) {
  const { user } = useAuth();
  const isAdmin = user?.username === "admin";

  const [author, setAuthor]   = useState(null);
  const [books, setBooks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!authorId) return;
    setLoading(true);
    Promise.all([
      fetch(`http://localhost:8080/api/authors/${authorId}`).then((r) => r.ok ? r.json() : null),
      fetch(`http://localhost:8080/api/authors/${authorId}/books`).then((r) => r.ok ? r.json() : []),
    ]).then(([a, b]) => {
      setAuthor(a);
      setBooks(b || []);
      if (a) setForm({ name: a.name || "", bio: a.bio || "", imageUrl: a.imageUrl || "", nationality: a.nationality || "" });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [authorId]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`http://localhost:8080/api/authors/${authorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...author, ...form }),
      });
      if (!res.ok) { setError("Failed to save."); return; }
      const saved = await res.json();
      setAuthor(saved);
      setEditing(false);
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete author "${author?.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`http://localhost:8080/api/authors/${authorId}`, {
        method: "DELETE", credentials: "include",
      });
      if (res.ok) { onBack(); }
      else setError("Failed to delete.");
    } catch { setError("Network error."); }
    finally { setDeleting(false); }
  };

  if (loading) return <div className="author-page"><div className="author-loading">Loading…</div></div>;
  if (!author)  return <div className="author-page"><div className="author-loading">Author not found.</div></div>;

  return (
    <div className="author-page">
      {/* Top actions */}
      <div className="author-actions-top">
        <button className="author-back-btn" onClick={onBack}>← Back</button>
        {isAdmin && !editing && (
          <div className="author-actions-right">
            <button className="author-action-btn" onClick={() => { setEditing(true); setError(null); }}>
              Edit
            </button>
            <button
              className="author-action-btn author-delete-btn"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        )}
        {isAdmin && editing && (
          <div className="author-actions-right">
            <button className="author-action-btn" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="author-action-btn author-cancel-btn" onClick={() => {
              setEditing(false);
              setForm({ name: author.name || "", bio: author.bio || "", imageUrl: author.imageUrl || "", nationality: author.nationality || "" });
              setError(null);
            }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {error && <p className="author-error">{error}</p>}

      <div className="author-profile">
        {/* Photo */}
        <div className="author-photo-wrap">
          {editing ? (
            <div className="author-photo-edit">
              {form.imageUrl && (
                <img className="author-photo" src={form.imageUrl} alt={form.name}
                  onError={(e) => { e.target.style.display = "none"; }} />
              )}
              <label className="author-edit-label">
                Photo URL
                <input className="author-edit-input" value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  placeholder="https://…" />
              </label>
            </div>
          ) : author.imageUrl ? (
            <img className="author-photo" src={author.imageUrl} alt={author.name}
              onError={(e) => { e.target.style.display = "none"; }} />
          ) : (
            <div className="author-photo-placeholder">{author.name?.[0]?.toUpperCase() || "?"}</div>
          )}
        </div>

        {/* Info */}
        <div className="author-info">
          {editing ? (
            <>
              <label className="author-edit-label author-edit-name-label">
                Name
                <input className="author-edit-input author-edit-name-input" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="author-edit-label">
                Nationality
                <input className="author-edit-input" value={form.nationality}
                  onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))}
                  placeholder="e.g. American" />
              </label>
              <label className="author-edit-label">
                Bio
                <textarea className="author-edit-textarea" value={form.bio}
                  onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                  rows={6} placeholder="Short biography…" />
              </label>
            </>
          ) : (
            <>
              <h1 className="author-name">{author.name}</h1>
              {author.nationality && (
                <p className="author-nationality">🌍 {author.nationality}</p>
              )}
              {author.bio && (
                <p className="author-bio">{author.bio}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Books */}
      {books.length > 0 && (
        <section className="author-books-section">
          <h2 className="author-books-title">Books by {author.name}</h2>
          <div className="author-books-grid">
            {books.map((book) => {
              const cover = book.editions?.[0]?.imageUrls?.[0]
                || "https://placehold.co/120x180/060d18/00b4d0?text=No+Cover";
              const series = book.seriesName
                ? `${book.seriesName}${book.volumeNumber ? ` #${book.volumeNumber}` : ""}` : null;
              return (
                <button
                  key={book.id}
                  className="author-book-card"
                  onClick={() => onBookClick(book.id)}
                >
                  <img className="author-book-cover" src={cover} alt={book.title}
                    onError={(e) => { e.target.src = "https://placehold.co/120x180/060d18/00b4d0?text=No+Cover"; }} />
                  <div className="author-book-info">
                    <span className="author-book-title">{book.title}</span>
                    {series && <span className="author-book-series">{series}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {books.length === 0 && !loading && (
        <p className="author-no-books">No books found for this author yet.</p>
      )}
    </div>
  );
}
