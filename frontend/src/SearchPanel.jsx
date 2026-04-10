import { useState, useEffect, useRef, useCallback } from "react";
import "./SearchPanel.css";

const FILTERS = [
  { key: "all",           label: "All" },
  { key: "books",         label: "Books" },
  { key: "authors",       label: "Authors" },
  { key: "artists",       label: "Artists" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "companies",     label: "Book Boxes" },
];

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function SearchPanel({ books, onBookClick, onCompanyClick, user, onNewBook, onAdd }) {
  const [query, setQuery]         = useState("");
  const [activeFilter, setFilter] = useState("all");
  const [open, setOpen]           = useState(false);
  const [results, setResults]     = useState(null); // null = not searched yet
  const [loading, setLoading]     = useState(false);
  const wrapperRef = useRef(null);

  const debouncedQuery = useDebounce(query, 300);

  // Fetch results from backend whenever debounced query or filter changes
  useEffect(() => {
    if (!debouncedQuery.trim() || debouncedQuery.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ q: debouncedQuery.trim(), filter: activeFilter });
    fetch(`http://localhost:8080/api/search?${params}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { setResults(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [debouncedQuery, activeFilter]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const hasResults = results &&
    (results.books?.length || results.authors?.length || results.artists?.length ||
     results.subscriptions?.length || results.companies?.length);

  const handleSelect = (bookId) => {
    setQuery(""); setOpen(false); setResults(null);
    onBookClick(bookId);
  };

  const handleCompanySelect = (companyId, companyObj) => {
    setQuery(""); setOpen(false); setResults(null);
    if (onCompanyClick) onCompanyClick(companyObj || { id: companyId });
  };

  const handleSearch = () => {
    if (!results) return;
    if (results.books?.length)         { handleSelect(results.books[0].id); return; }
    if (results.authors?.length)       { /* open author profile – not yet implemented */ return; }
    if (results.companies?.length)     { handleCompanySelect(results.companies[0].id, results.companies[0]); return; }
  };

  const handleLuckyDraw = () => {
    const allPairs = (books || []).flatMap((b) =>
      (b.editions || []).map((e) => ({ bookId: b.id, editionId: e.id }))
    );
    if (allPairs.length === 0) return;
    const pick = allPairs[Math.floor(Math.random() * allPairs.length)];
    onBookClick(pick.bookId);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") setOpen(false);
  };

  // ── Row renderers ──────────────────────────────────────────────────────
  const renderBookRow = (item, key) => (
    <button key={key} className="sr-item" onClick={() => handleSelect(item.id)}>
      <img
        className="sr-thumb"
        src={item.coverUrl || "https://placehold.co/36x54/060d18/00b4d0?text=?"}
        alt=""
        onError={(e) => { e.target.src = "https://placehold.co/36x54/060d18/00b4d0?text=?"; }}
      />
      <div className="sr-info">
        <span className="sr-title">{item.title}</span>
        {(item.subscriptionName || item.companyName) && (
          <span className="sr-badge">
            {(item.subscriptionLogoUrl || item.companyLogoUrl) && (
              <img className="sr-badge-logo" src={item.subscriptionLogoUrl || item.companyLogoUrl} alt="" />
            )}
            {item.subscriptionName || item.companyName}
          </span>
        )}
      </div>
    </button>
  );

  const renderPersonRow = (item, label, key) => (
    <div key={key} className="sr-item sr-author-row">
      <div className="sr-author-avatar">
        {item.imageUrl
          ? <img src={item.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
          : item.name?.[0]?.toUpperCase()
        }
      </div>
      <div className="sr-info">
        <span className="sr-title">{item.name}</span>
        <span className="sr-badge">{label}{item.bookCount ? ` · ${item.bookCount} books` : ""}{item.nationality ? ` · ${item.nationality}` : ""}{item.specialty ? ` · ${item.specialty}` : ""}</span>
      </div>
    </div>
  );

  const dropdownVisible = open && query.trim().length >= 2;

  return (
    <div className="search-panel">
      <div className="search-panel-inner" ref={wrapperRef}>

        {/* Filter chips */}
        <div className="search-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`filter-chip${activeFilter === f.key ? " filter-chip--active" : ""}`}
              onClick={() => { setFilter(f.key); if (query.trim().length >= 2) setOpen(true); }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search row */}
        <div className="search-row">
          <input
            type="text"
            className="search-input"
            placeholder="what are you looking for..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => query.trim().length >= 2 && setOpen(true)}
            onKeyDown={handleKeyDown}
          />
          <button className="search-btn" onClick={handleSearch}>SEARCH</button>
          <button className="lucky-draw-btn" onClick={handleLuckyDraw} title="Lucky draw – random edition">
            🎲 LUCKY DRAW
          </button>
        </div>

        {/* Dropdown */}
        {dropdownVisible && (
          <div className="search-dropdown">
            {loading && <div className="sr-empty">Searching…</div>}

            {!loading && !hasResults && results && (
              <div className="sr-empty">
                Didn&rsquo;t find what you&rsquo;re looking for?{" "}
                {user && onAdd ? (
                  <button className="sr-add-link" onClick={() => { setOpen(false); onAdd(activeFilter); }}>
                    Add it!
                  </button>
                ) : (
                  <span>Add it!</span>
                )}
              </div>
            )}

            {!loading && results && (
              <>
                {/* Books */}
                {results.books?.length > 0 && (
                  <div className="sr-group">
                    {activeFilter === "all" && <div className="sr-group-label">Books</div>}
                    {results.books.map((item, i) => renderBookRow(item, `b${i}`))}
                  </div>
                )}

                {/* Authors */}
                {results.authors?.length > 0 && (
                  <div className="sr-group">
                    {activeFilter === "all" && <div className="sr-group-label">Authors</div>}
                    {results.authors.map((item, i) => renderPersonRow(item, "Author", `au${i}`))}
                  </div>
                )}

                {/* Artists */}
                {results.artists?.length > 0 && (
                  <div className="sr-group">
                    {activeFilter === "all" && <div className="sr-group-label">Artists</div>}
                    {results.artists.map((item, i) => renderPersonRow(item, "Artist", `ar${i}`))}
                  </div>
                )}

                {/* Subscriptions */}
                {results.subscriptions?.length > 0 && (
                  <div className="sr-group">
                    {activeFilter === "all" && <div className="sr-group-label">Subscriptions</div>}
                    {results.subscriptions.map((item, i) => (
                      <button
                        key={`s${i}`}
                        className="sr-item"
                        onClick={() => handleCompanySelect(item.companyId, { id: item.companyId, name: item.companyName, logoUrl: item.companyLogoUrl })}
                      >
                        {item.logoUrl
                          ? <img className="sr-thumb sr-thumb--square" src={item.logoUrl} alt="" onError={(e) => { e.target.style.display = "none"; }} />
                          : <div className="sr-author-avatar">{item.name?.[0]?.toUpperCase()}</div>
                        }
                        <div className="sr-info">
                          <span className="sr-title">{item.name}</span>
                          <span className="sr-badge">
                            {item.companyLogoUrl && <img className="sr-badge-logo" src={item.companyLogoUrl} alt="" />}
                            {item.companyName}{item.type ? ` · ${item.type}` : ""}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Companies */}
                {results.companies?.length > 0 && (
                  <div className="sr-group">
                    {activeFilter === "all" && <div className="sr-group-label">Companies</div>}
                    {results.companies.map((item, i) => (
                      <button
                        key={`c${i}`}
                        className="sr-item"
                        onClick={() => handleCompanySelect(item.id, item)}
                      >
                        {item.logoUrl
                          ? <img className="sr-thumb sr-thumb--square" src={item.logoUrl} alt="" onError={(e) => { e.target.style.display = "none"; }} />
                          : <div className="sr-author-avatar">{item.name?.[0]?.toUpperCase()}</div>
                        }
                        <div className="sr-info">
                          <span className="sr-title">{item.name}</span>
                          <span className="sr-badge">Book Box Company{item.location ? ` · ${item.location}` : ""}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
