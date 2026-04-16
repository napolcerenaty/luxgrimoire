import { useState, useEffect, useRef, useCallback } from "react";
import { useI18n } from "./i18n";
import "./SearchPanel.css";

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function SearchPanel({ books, onBookClick, onCompanyClick, onAuthorClick, onArtistClick, user, onNewBook, onAdd, onRequestData, onSubscriptionClick, compact = false }) {
  const { t } = useI18n();

  const FILTERS = [
    { key: "all",           label: t("search.filterAll") },
    { key: "books",         label: t("search.filterBooks") },
    { key: "authors",       label: t("search.filterAuthors") },
    { key: "artists",       label: t("search.filterArtists") },
    { key: "subscriptions", label: t("search.filterSubs") },
    { key: "companies",     label: t("search.filterCompanies") },
  ];

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

  const handleArtistSelect = (artistId) => {
    setQuery(""); setOpen(false); setResults(null);
    if (onArtistClick) onArtistClick(artistId);
  };

  const handleAuthorSelect = (authorId) => {
    setQuery(""); setOpen(false); setResults(null);
    if (onAuthorClick) onAuthorClick(authorId);
  };

  const handleSearch = () => {
    if (!results) return;
    if (results.books?.length)         { handleSelect(results.books[0].id); return; }
    if (results.authors?.length)       { handleAuthorSelect(results.authors[0].id); return; }
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

  const renderPersonRow = (item, label, key, onClick) => (
    onClick ? (
      <button key={key} className="sr-item sr-author-row" onClick={onClick}>
        <div className="sr-author-avatar">
          {item.imageUrl
            ? <img src={item.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
            : item.name?.[0]?.toUpperCase()
          }
        </div>
        <div className="sr-info">
          <span className="sr-title">{item.name}</span>
          <span className="sr-badge">{label}{item.bookCount ? ` \u00b7 ${item.bookCount} ${t("search.books")}` : ""}{item.nationality ? ` \u00b7 ${item.nationality}` : ""}{item.specialty ? ` \u00b7 ${item.specialty}` : ""}</span>
        </div>
      </button>
    ) : (
      <div key={key} className="sr-item sr-author-row">
        <div className="sr-author-avatar">
          {item.imageUrl
            ? <img src={item.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
            : item.name?.[0]?.toUpperCase()
          }
        </div>
        <div className="sr-info">
          <span className="sr-title">{item.name}</span>
          <span className="sr-badge">{label}{item.bookCount ? ` \u00b7 ${item.bookCount} ${t("search.books")}` : ""}{item.nationality ? ` \u00b7 ${item.nationality}` : ""}{item.specialty ? ` \u00b7 ${item.specialty}` : ""}</span>
        </div>
      </div>
    )
  );

  const dropdownVisible = open && query.trim().length >= 2;

  if (compact) {
    return (
      <div className="search-panel-header" ref={wrapperRef}>
        <div className="search-header-row">
          <input
            type="text"
            className="search-input search-input-compact"
            placeholder={t("search.placeholder")}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => query.trim().length >= 2 && setOpen(true)}
            onKeyDown={handleKeyDown}
          />
        </div>
        {dropdownVisible && (
          <div className="search-dropdown search-dropdown-header">
            {loading && <div className="sr-empty">{t("search.searching")}</div>}
            {!loading && !hasResults && results && (
              <div className="sr-empty">
                {t("search.notFound")}{" "}
                {user && onRequestData && (
                  <button className="sr-request-link" onClick={() => { setOpen(false); onRequestData(); }}>
                    {t("search.requestDataLink")}
                  </button>
                )}
              </div>
            )}
            {!loading && results && (
              <>
                {results.books?.length > 0 && (
                  <div className="sr-group">
                    <div className="sr-group-label">{t("search.groupBooks")}</div>
                    {results.books.slice(0, 4).map((item, i) => renderBookRow(item, `cb${i}`))}
                  </div>
                )}
                {results.authors?.length > 0 && (
                  <div className="sr-group">
                    <div className="sr-group-label">{t("search.groupAuthors")}</div>
                    {results.authors.slice(0, 3).map((item, i) => renderPersonRow(item, t("search.labelAuthor"), `cau${i}`, () => handleAuthorSelect(item.id)))}
                  </div>
                )}
                {results.artists?.length > 0 && (
                  <div className="sr-group">
                    <div className="sr-group-label">{t("search.groupArtists")}</div>
                    {results.artists.slice(0, 3).map((item, i) => renderPersonRow(item, t("search.labelArtist"), `car${i}`, () => handleArtistSelect(item.id)))}
                  </div>
                )}
                {results.subscriptions?.length > 0 && (
                  <div className="sr-group">
                    <div className="sr-group-label">{t("search.groupSubs")}</div>
                    {results.subscriptions.slice(0, 3).map((item, i) => (
                      <button key={`cs${i}`} className="sr-item" onClick={() => {
                        if (onSubscriptionClick) {
                          setQuery(""); setOpen(false); setResults(null);
                          onSubscriptionClick({ companyId: item.companyId, subscriptionId: item.id, subName: item.name });
                        } else {
                          handleCompanySelect(item.companyId, { id: item.companyId, name: item.companyName, logoUrl: item.companyLogoUrl });
                        }
                      }}>
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
                {results.companies?.length > 0 && (
                  <div className="sr-group">
                    <div className="sr-group-label">{t("search.groupCompanies")}</div>
                    {results.companies.slice(0, 3).map((item, i) => (
                      <button key={`cc${i}`} className="sr-item" onClick={() => handleCompanySelect(item.id, item)}>
                        {item.logoUrl
                          ? <img className="sr-thumb sr-thumb--square" src={item.logoUrl} alt="" onError={(e) => { e.target.style.display = "none"; }} />
                          : <div className="sr-author-avatar">{item.name?.[0]?.toUpperCase()}</div>
                        }
                        <div className="sr-info">
                          <span className="sr-title">{item.name}</span>
                          <span className="sr-badge">{t("search.bookBoxCompany")}{item.location ? ` · ${item.location}` : ""}</span>
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
    );
  }

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
            placeholder={t("search.placeholder")}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => query.trim().length >= 2 && setOpen(true)}
            onKeyDown={handleKeyDown}
          />
          <button className="search-btn" onClick={handleSearch}>{t("search.searchBtn")}</button>
          <button className="lucky-draw-btn" onClick={handleLuckyDraw} title={t("search.luckyDrawTitle")}>
            {t("search.luckyDraw")}
          </button>
        </div>

        {/* Dropdown */}
        {dropdownVisible && (
          <div className="search-dropdown">
            {loading && <div className="sr-empty">{t("search.searching")}</div>}

            {!loading && !hasResults && results && (
              <div className="sr-empty">
                {t("search.notFound")}{" "}
                {user && onAdd ? (
                  <button className="sr-add-link" onClick={() => { setOpen(false); onAdd(activeFilter); }}>
                    {t("search.addIt")}
                  </button>
                ) : (
                  <span>{t("search.addIt")}</span>
                )}
                {(activeFilter === "subscriptions" || activeFilter === "companies") && onRequestData && (
                  <div className="sr-data-request-hint">
                    {t("search.requestDataHint")}{" "}
                    <button className="sr-data-request-link" onClick={() => { setOpen(false); onRequestData(); }}>
                      {t("search.requestDataLink")}
                    </button>
                  </div>
                )}
              </div>
            )}

            {!loading && results && (
              <>
                {/* Books */}
                {results.books?.length > 0 && (
                  <div className="sr-group">
                    {activeFilter === "all" && <div className="sr-group-label">{t("search.groupBooks")}</div>}
                    {results.books.map((item, i) => renderBookRow(item, `b${i}`))}
                  </div>
                )}

                {/* Authors */}
                {results.authors?.length > 0 && (
                  <div className="sr-group">
                    {activeFilter === "all" && <div className="sr-group-label">{t("search.groupAuthors")}</div>}
                    {results.authors.map((item, i) => renderPersonRow(item, t("search.labelAuthor"), `au${i}`, () => handleAuthorSelect(item.id)))}
                  </div>
                )}

                {/* Artists */}
                {results.artists?.length > 0 && (
                  <div className="sr-group">
                    {activeFilter === "all" && <div className="sr-group-label">{t("search.groupArtists")}</div>}
                    {results.artists.map((item, i) => renderPersonRow(item, t("search.labelArtist"), `ar${i}`, () => handleArtistSelect(item.id)))}
                  </div>
                )}

                {/* Subscriptions */}
                {results.subscriptions?.length > 0 && (
                  <div className="sr-group">
                    {activeFilter === "all" && <div className="sr-group-label">{t("search.groupSubs")}</div>}
                    {results.subscriptions.map((item, i) => (
                      <button
                        key={`s${i}`}
                        className="sr-item"
                        onClick={() => {
                          if (onSubscriptionClick) {
                            setQuery(""); setOpen(false); setResults(null);
                            onSubscriptionClick({ companyId: item.companyId, subscriptionId: item.id, subName: item.name });
                          } else {
                            handleCompanySelect(item.companyId, { id: item.companyId, name: item.companyName, logoUrl: item.companyLogoUrl });
                          }
                        }}
                      >
                        {item.logoUrl
                          ? <img className="sr-thumb sr-thumb--square" src={item.logoUrl} alt="" onError={(e) => { e.target.style.display = "none"; }} />
                          : <div className="sr-author-avatar">{item.name?.[0]?.toUpperCase()}</div>
                        }
                        <div className="sr-info">
                          <span className="sr-title">{item.name}</span>
                          <span className="sr-badge">
                            {item.companyLogoUrl && <img className="sr-badge-logo" src={item.companyLogoUrl} alt="" />}
                            {item.companyName}{item.type ? ` \u00b7 ${item.type}` : ""}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Companies */}
                {results.companies?.length > 0 && (
                  <div className="sr-group">
                    {activeFilter === "all" && <div className="sr-group-label">{t("search.groupCompanies")}</div>}
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
                          <span className="sr-badge">{t("search.bookBoxCompany")}{item.location ? ` \u00b7 ${item.location}` : ""}</span>
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
