import { useState, useEffect, useRef } from "react";
import "./SearchPanel.css";

export default function SearchPanel({ books, onBookClick }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const wrapperRef = useRef(null);

  useEffect(() => {
    fetch("http://localhost:8080/api/companies", { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setCompanies)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const companyMap = {};
  companies.forEach((c) => { companyMap[c.id] = c; });

  const getResults = () => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const titleMatches = [];
    const authorMap = {};

    books.forEach((book) => {
      const titleHit = book.title?.toLowerCase().includes(q) || book.seriesName?.toLowerCase().includes(q);
      const authorHit = book.author?.toLowerCase().includes(q);
      const artistHit = book.editions?.some((e) =>
        e.artists?.some((a) => a.name?.toLowerCase().includes(q))
      );
      const editionHit = book.editions?.some((e) =>
        e.editionName?.toLowerCase().includes(q) || e.subscriptionName?.toLowerCase().includes(q)
      );

      if (titleHit || editionHit) {
        titleMatches.push({ type: "book", book });
      } else if (authorHit || artistHit) {
        const person = book.author || "Unknown";
        if (!authorMap[person]) authorMap[person] = [];
        authorMap[person].push(book);
      }
    });

    const authorGroups = Object.entries(authorMap).map(([author, bks]) => ({
      type: "author-group", author, books: bks,
    }));

    return [...titleMatches, ...authorGroups];
  };

  const getInfoBadge = (book) => {
    const edition = book.editions?.find((e) => e.bookBoxCompanyId) || book.editions?.[0];
    if (!edition) return null;
    if (edition.bookBoxCompanyId && companyMap[edition.bookBoxCompanyId]) {
      const co = companyMap[edition.bookBoxCompanyId];
      if (edition.subscriptionId) {
        const sub = co.subscriptions?.find((s) => s.id === edition.subscriptionId);
        if (sub) return { name: sub.name, logo: sub.logoUrl || null };
      }
      return { name: co.name, logo: co.logoUrl || null };
    }
    if (edition.subscriptionName) return { name: edition.subscriptionName, logo: null };
    return null;
  };

  const results = getResults();

  const handleSelect = (bookId) => {
    setQuery("");
    setOpen(false);
    onBookClick(bookId);
  };

  const handleSearch = () => {
    if (results.length === 0) return;
    const first = results[0];
    if (first.type === "book") handleSelect(first.book.id);
    else if (first.type === "author-group") handleSelect(first.books[0].id);
  };

  const handleLuckyDraw = () => {
    const allPairs = books.flatMap((b) =>
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

  return (
    <div className="search-panel">
      <div className="search-panel-inner" ref={wrapperRef}>
        <div className="search-row">
          <input
            type="text"
            className="search-input"
            placeholder="what are you looking for..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => query && setOpen(true)}
            onKeyDown={handleKeyDown}
          />
          <button className="search-btn" onClick={handleSearch}>SEARCH</button>
          <button className="lucky-draw-btn" onClick={handleLuckyDraw} title="Lucky draw – random edition">
            🎲 LUCKY DRAW
          </button>
        </div>

        {open && query.trim() && results.length > 0 && (
          <div className="search-dropdown">
            {results.map((item, i) => {
              if (item.type === "book") {
                const cover = item.book.editions?.[0]?.imageUrls?.[0];
                const badge = getInfoBadge(item.book);
                return (
                  <button key={i} className="sr-item" onClick={() => handleSelect(item.book.id)}>
                    <img
                      className="sr-thumb"
                      src={cover || "https://placehold.co/36x54/060d18/00b4d0?text=?"}
                      alt=""
                      onError={(e) => { e.target.src = "https://placehold.co/36x54/060d18/00b4d0?text=?"; }}
                    />
                    <div className="sr-info">
                      <span className="sr-title">{item.book.title}</span>
                      {badge && (
                        <span className="sr-badge">
                          {badge.logo && <img className="sr-badge-logo" src={badge.logo} alt="" />}
                          {badge.name}
                        </span>
                      )}
                    </div>
                  </button>
                );
              }

              if (item.type === "author-group") {
                return (
                  <div key={i} className="sr-group">
                    <div className="sr-group-label">Books by {item.author}</div>
                    {item.books.map((book, j) => {
                      const cover = book.editions?.[0]?.imageUrls?.[0];
                      const badge = getInfoBadge(book);
                      return (
                        <button key={j} className="sr-item" onClick={() => handleSelect(book.id)}>
                          <img
                            className="sr-thumb"
                            src={cover || "https://placehold.co/36x54/060d18/00b4d0?text=?"}
                            alt=""
                            onError={(e) => { e.target.src = "https://placehold.co/36x54/060d18/00b4d0?text=?"; }}
                          />
                          <div className="sr-info">
                            <span className="sr-title">{book.title}</span>
                            {badge && (
                              <span className="sr-badge">
                                {badge.logo && <img className="sr-badge-logo" src={badge.logo} alt="" />}
                                {badge.name}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    <button className="sr-item sr-author-row" onClick={() => setOpen(false)}>
                      <div className="sr-author-avatar">{item.author?.[0]?.toUpperCase()}</div>
                      <div className="sr-info">
                        <span className="sr-title">{item.author}</span>
                        <span className="sr-badge">Author</span>
                      </div>
                    </button>
                  </div>
                );
              }
              return null;
            })}
          </div>
        )}

        {open && query.trim() && results.length === 0 && (
          <div className="search-dropdown">
            <div className="sr-empty">No results for &ldquo;{query}&rdquo;</div>
          </div>
        )}
      </div>
    </div>
  );
}
