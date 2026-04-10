import { useState, useEffect, useRef } from "react";
import "./SearchPanel.css";

export default function SearchPanel({ books, onBookClick, onCompanyClick, user, onNewBook }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [artists, setArtists] = useState([]);
  const wrapperRef = useRef(null);

  useEffect(() => {
    fetch("http://localhost:8080/api/companies", { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setCompanies)
      .catch(() => {});
    fetch("http://localhost:8080/api/authors", { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setAuthors)
      .catch(() => {});
    fetch("http://localhost:8080/api/artists", { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setArtists)
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
    const seen = new Set();
    const titleMatches = [];

    // Book title / series / edition / subscription name hits
    books.forEach((book) => {
      const titleHit = book.title?.toLowerCase().includes(q) || book.seriesName?.toLowerCase().includes(q);
      const editionHit = book.editions?.some((e) =>
        e.editionName?.toLowerCase().includes(q) || e.subscriptionName?.toLowerCase().includes(q)
      );
      if ((titleHit || editionHit) && !seen.has(book.id)) {
        seen.add(book.id);
        titleMatches.push({ type: "book", book });
      }
    });

    // Author entity hits
    const authorMatches = [];
    const coveredByAuthorEntity = new Set();
    authors.forEach((author) => {
      if (author.name?.toLowerCase().includes(q)) {
        const authorBooks = books.filter((b) =>
          b.authorId === author.id || b.author?.toLowerCase() === author.name?.toLowerCase()
        );
        authorBooks.forEach((b) => coveredByAuthorEntity.add(b.author?.toLowerCase()));
        authorMatches.push({ type: "author", author, books: authorBooks });
      }
    });

    // Author string hits (not linked to entity)
    const authorGroupMap = {};
    books.forEach((book) => {
      if (book.author?.toLowerCase().includes(q) && !seen.has(book.id)) {
        if (!coveredByAuthorEntity.has(book.author?.toLowerCase())) {
          if (!authorGroupMap[book.author]) authorGroupMap[book.author] = [];
          authorGroupMap[book.author].push(book);
        }
      }
    });
    const authorGroups = Object.entries(authorGroupMap).map(([authorName, bks]) => ({
      type: "author-group", author: authorName, books: bks,
    }));

    // Artist entity hits
    const artistMatches = [];
    const coveredByArtistEntity = new Set();
    artists.forEach((artist) => {
      if (artist.name?.toLowerCase().includes(q)) {
        const artistBooks = books.filter((b) =>
          b.editions?.some((e) => e.artists?.some((a) =>
            a.artistId === artist.id || a.artistName?.toLowerCase() === artist.name?.toLowerCase()
          ))
        );
        artistBooks.forEach((b) => coveredByArtistEntity.add(b.id));
        artistMatches.push({ type: "artist", artist, books: artistBooks });
      }
    });

    // Artist string hits in editions (not linked to entity)
    const artistGroupMap = {};
    books.forEach((book) => {
      if (!coveredByArtistEntity.has(book.id)) {
        book.editions?.forEach((e) => {
          e.artists?.forEach((a) => {
            if (a.artistName?.toLowerCase().includes(q)) {
              if (!artistGroupMap[a.artistName]) artistGroupMap[a.artistName] = new Set();
              artistGroupMap[a.artistName].add(book.id);
            }
          });
        });
      }
    });
    const artistGroups = Object.entries(artistGroupMap).map(([artistName, bookIds]) => ({
      type: "artist-group", artistName,
      books: books.filter((b) => bookIds.has(b.id)),
    }));

    // Subscription name hits
    const subscriptionMatches = [];
    companies.forEach((company) => {
      (company.subscriptions || []).forEach((sub) => {
        if (sub.name?.toLowerCase().includes(q)) {
          subscriptionMatches.push({ type: "subscription", subscription: sub, company });
        }
      });
    });

    // Company name hits
    const companyMatches = [];
    companies.forEach((company) => {
      if (company.name?.toLowerCase().includes(q)) {
        companyMatches.push({ type: "company", company });
      }
    });

    return [...titleMatches, ...authorMatches, ...authorGroups, ...artistMatches, ...artistGroups, ...subscriptionMatches, ...companyMatches];
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

  const handleCompanySelect = (company) => {
    setQuery("");
    setOpen(false);
    if (onCompanyClick) onCompanyClick(company);
  };

  const handleSearch = () => {
    if (results.length === 0) return;
    const first = results[0];
    if (first.type === "book") handleSelect(first.book.id);
    else if (first.type === "author" && first.books.length > 0) handleSelect(first.books[0].id);
    else if (first.type === "author-group") handleSelect(first.books[0].id);
    else if (first.type === "artist" && first.books.length > 0) handleSelect(first.books[0].id);
    else if (first.type === "artist-group") handleSelect(first.books[0].id);
    else if (first.type === "company") handleCompanySelect(first.company);
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

  const renderBookRow = (book, key, onClick) => {
    const cover = book.editions?.[0]?.imageUrls?.[0];
    const badge = getInfoBadge(book);
    return (
      <button key={key} className="sr-item" onClick={onClick}>
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
          {user && onNewBook && (
            <button className="add-book-btn" onClick={onNewBook} title="Add new book">
              + ADD BOOK
            </button>
          )}
        </div>

        {open && query.trim() && results.length > 0 && (
          <div className="search-dropdown">
            {results.map((item, i) => {
              if (item.type === "book") {
                return renderBookRow(item.book, i, () => handleSelect(item.book.id));
              }

              if (item.type === "author") {
                return (
                  <div key={i} className="sr-group">
                    <div className="sr-group-label">Author</div>
                    <div className="sr-item sr-author-row">
                      <div className="sr-author-avatar">
                        {item.author.imageUrl
                          ? <img src={item.author.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                          : item.author.name?.[0]?.toUpperCase()
                        }
                      </div>
                      <div className="sr-info">
                        <span className="sr-title">{item.author.name}</span>
                        {item.author.nationality && <span className="sr-badge">{item.author.nationality}</span>}
                      </div>
                    </div>
                    {item.books.map((book, j) => renderBookRow(book, `a${i}-${j}`, () => handleSelect(book.id)))}
                  </div>
                );
              }

              if (item.type === "author-group") {
                return (
                  <div key={i} className="sr-group">
                    <div className="sr-group-label">Books by {item.author}</div>
                    {item.books.map((book, j) => renderBookRow(book, `ag${i}-${j}`, () => handleSelect(book.id)))}
                    <div className="sr-item sr-author-row">
                      <div className="sr-author-avatar">{item.author?.[0]?.toUpperCase()}</div>
                      <div className="sr-info">
                        <span className="sr-title">{item.author}</span>
                        <span className="sr-badge">Author</span>
                      </div>
                    </div>
                  </div>
                );
              }

              if (item.type === "artist") {
                return (
                  <div key={i} className="sr-group">
                    <div className="sr-group-label">Artist</div>
                    <div className="sr-item sr-author-row">
                      <div className="sr-author-avatar">
                        {item.artist.imageUrl
                          ? <img src={item.artist.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                          : item.artist.name?.[0]?.toUpperCase()
                        }
                      </div>
                      <div className="sr-info">
                        <span className="sr-title">{item.artist.name}</span>
                        {item.artist.specialty && <span className="sr-badge">{item.artist.specialty}</span>}
                      </div>
                    </div>
                    {item.books.map((book, j) => renderBookRow(book, `art${i}-${j}`, () => handleSelect(book.id)))}
                  </div>
                );
              }

              if (item.type === "artist-group") {
                return (
                  <div key={i} className="sr-group">
                    <div className="sr-group-label">Books with artist {item.artistName}</div>
                    {item.books.map((book, j) => renderBookRow(book, `artg${i}-${j}`, () => handleSelect(book.id)))}
                    <div className="sr-item sr-author-row">
                      <div className="sr-author-avatar">{item.artistName?.[0]?.toUpperCase()}</div>
                      <div className="sr-info">
                        <span className="sr-title">{item.artistName}</span>
                        <span className="sr-badge">Artist</span>
                      </div>
                    </div>
                  </div>
                );
              }

              if (item.type === "subscription") {
                return (
                  <button key={i} className="sr-item" onClick={() => handleCompanySelect(item.company)}>
                    {item.subscription.logoUrl
                      ? <img className="sr-thumb sr-thumb--square" src={item.subscription.logoUrl} alt="" onError={(e) => { e.target.style.display = "none"; }} />
                      : <div className="sr-author-avatar">{item.subscription.name?.[0]?.toUpperCase()}</div>
                    }
                    <div className="sr-info">
                      <span className="sr-title">{item.subscription.name}</span>
                      <span className="sr-badge">
                        {item.company.logoUrl && <img className="sr-badge-logo" src={item.company.logoUrl} alt="" />}
                        {item.company.name}
                      </span>
                    </div>
                  </button>
                );
              }

              if (item.type === "company") {
                return (
                  <button key={i} className="sr-item" onClick={() => handleCompanySelect(item.company)}>
                    {item.company.logoUrl
                      ? <img className="sr-thumb sr-thumb--square" src={item.company.logoUrl} alt="" onError={(e) => { e.target.style.display = "none"; }} />
                      : <div className="sr-author-avatar">{item.company.name?.[0]?.toUpperCase()}</div>
                    }
                    <div className="sr-info">
                      <span className="sr-title">{item.company.name}</span>
                      <span className="sr-badge">Book Box Company</span>
                    </div>
                  </button>
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

