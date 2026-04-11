import { useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import "./PersonPage.css";

const PAGE_SIZE = 12;

/* ── Social icons (inline SVG) ─────────────────────────── */
const IconGlobe = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/>
  </svg>
);
const IconInstagram = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
  </svg>
);
const IconX = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
  </svg>
);
const IconFacebook = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
  </svg>
);
const IconTikTok = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/>
  </svg>
);

function SocialLinks({ person }) {
  const links = [
    { key: "website",   href: person.website,   icon: <IconGlobe />,    label: "Website"   },
    { key: "instagram", href: person.instagram ? `https://instagram.com/${person.instagram.replace(/^@/, "")}` : null, icon: <IconInstagram />, label: "Instagram" },
    { key: "twitter",   href: person.twitter   ? `https://x.com/${person.twitter.replace(/^@/, "")}` : null,           icon: <IconX />,         label: "X / Twitter" },
    { key: "tiktok",    href: person.tiktok    ? `https://tiktok.com/@${person.tiktok.replace(/^@/, "")}` : null,      icon: <IconTikTok />,    label: "TikTok" },
    { key: "facebook",  href: person.facebook,  icon: <IconFacebook />, label: "Facebook"  },
  ].filter((l) => l.href);
  if (!links.length) return null;
  return (
    <div className="pe-social-links">
      {links.map((l) => (
        <a key={l.key} href={l.href} target="_blank" rel="noopener noreferrer"
          className="pe-social-link" title={l.label}>
          {l.icon}
        </a>
      ))}
    </div>
  );
}

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
  sectionTitle,      // e.g. "Books by" (name appended)
  onBack,
  onBookClick,
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const isAdmin = user?.role === "admin";

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
        name:             p.name          || "",
        bio:              p.bio           || "",
        imageUrl:         p.imageUrl      || "",
        website:          p.website       || "",
        instagram:        p.instagram     || "",
        twitter:          p.twitter       || "",
        tiktok:           p.tiktok        || "",
        facebook:         p.facebook      || "",
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [personId, apiBase]);

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
      if (!res.ok) { setError(t("person.failedSave")); return; }
      const saved = await res.json();
      setPerson(saved);
      setEditing(false);
    } catch { setError(t("person.networkError")); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(t("person.deleteConfirm", { name: person?.name }))) return;
    setDeleting(true); setError(null);
    try {
      const res = await fetch(`http://localhost:8080/api/${apiBase}/${personId}`, {
        method: "DELETE", credentials: "include",
      });
      if (res.ok) { onBack(); return; }
      const data = await res.json().catch(() => ({}));
      setError(data.error || t("person.failedSave"));
    } catch { setError(t("person.networkError")); }
    finally { setDeleting(false); }
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
    if (person) setForm({
      name:             person.name          || "",
      bio:              person.bio           || "",
      imageUrl:         person.imageUrl      || "",
      website:          person.website       || "",
      instagram:        person.instagram     || "",
      twitter:          person.twitter       || "",
      tiktok:           person.tiktok        || "",
      facebook:         person.facebook      || "",
    });
  };

  if (loading) return <div className="person-page"><div className="pe-loading">{t("person.loading")}</div></div>;
  if (!person)  return <div className="person-page"><div className="pe-loading">{t("person.notFound")}</div></div>;

  return (
    <div className="person-page">
      {/* ── Top bar ── */}
      <div className="pe-actions-top">
        <button className="pe-back-btn" onClick={editing ? cancelEdit : onBack}>
          {editing ? t("person.backToProfile") : t("person.back")}
        </button>
        {isAdmin && !editing && (
          <div className="pe-actions-right">
            <button className="pe-action-btn" onClick={() => { setEditing(true); setError(null); }}>{t("person.edit")}</button>
            <button
              className="pe-action-btn pe-delete-btn"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? t("person.deleting") : t("person.delete")}
            </button>
          </div>
        )}
        {isAdmin && editing && (
          <div className="pe-actions-right">
            <button className="pe-action-btn" onClick={handleSave} disabled={saving}>
              {saving ? t("person.saving") : t("person.save")}
            </button>
            <button className="pe-action-btn pe-cancel-btn" onClick={cancelEdit}>{t("person.cancel")}</button>
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
                {t("person.photoUrl")}
                <input className="pe-edit-input" value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  placeholder={t("person.photoUrlPlaceholder")} />
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
                {t("person.name")}
                <input className="pe-edit-input pe-edit-name-input" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="pe-edit-label">
                {t("person.about")}
                <textarea className="pe-edit-textarea" value={form.bio}
                  onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                  rows={5} placeholder={t("person.bioPlaceholder")} />
              </label>
              <div className="pe-edit-social-grid">
                <label className="pe-edit-label">
                  {t("person.website")}
                  <input className="pe-edit-input" value={form.website}
                    onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                    placeholder={t("person.websitePlaceholder")} />
                </label>
                <label className="pe-edit-label">
                  {t("person.instagram")}
                  <input className="pe-edit-input" value={form.instagram}
                    onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))}
                    placeholder={t("person.handlePlaceholder")} />
                </label>
                <label className="pe-edit-label">
                  {t("person.twitter")}
                  <input className="pe-edit-input" value={form.twitter}
                    onChange={(e) => setForm((f) => ({ ...f, twitter: e.target.value }))}
                    placeholder={t("person.handlePlaceholder")} />
                </label>
                <label className="pe-edit-label">
                  {t("person.tiktok")}
                  <input className="pe-edit-input" value={form.tiktok || ""}
                    onChange={(e) => setForm((f) => ({ ...f, tiktok: e.target.value }))}
                    placeholder={t("person.handlePlaceholder")} />
                </label>
                <label className="pe-edit-label">
                  {t("person.facebook")}
                  <input className="pe-edit-input" value={form.facebook}
                    onChange={(e) => setForm((f) => ({ ...f, facebook: e.target.value }))}
                    placeholder={t("person.facebookPlaceholder")} />
                </label>
              </div>
            </>
          ) : (
            <>
              <h1 className="pe-name">{person.name}</h1>
              <SocialLinks person={person} />
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
              placeholder={t("person.filterByBook")}
              value={filterBook}
              onChange={(e) => setFilterBook(e.target.value)}
            />
            <input
              className="pe-filter-input"
              placeholder={t("person.filterByBox")}
              value={filterBox}
              onChange={(e) => setFilterBox(e.target.value)}
            />
            <input
              className="pe-filter-input"
              placeholder={t("person.filterBySeries")}
              value={filterSeries}
              onChange={(e) => setFilterSeries(e.target.value)}
            />
            {(filterBook || filterBox || filterSeries) && (
              <button className="pe-filter-clear" onClick={() => {
                setFilterBook(""); setFilterBox(""); setFilterSeries("");
              }}>{t("person.clearFilters")}</button>
            )}
          </div>
        )}

        {filtered.length === 0 && editions.length > 0 && (
          <p className="pe-no-editions">{t("person.noEditionsFilter")}</p>
        )}
        {editions.length === 0 && (
          <p className="pe-no-editions">{t("person.noEditions", { name: person.name })}</p>
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
