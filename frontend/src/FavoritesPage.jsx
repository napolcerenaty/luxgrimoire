import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import { API } from "./api";
import "./FavoritesPage.css";

const TABS = [
  { key: "all",       labelKey: "favorites.tabAll" },
  { key: "books",     labelKey: "favorites.tabBooks" },
  { key: "editions",  labelKey: "favorites.tabEditions" },
  { key: "authors",   labelKey: "favorites.tabAuthors" },
  { key: "artists",   labelKey: "favorites.tabArtists" },
  { key: "companies", labelKey: "favorites.tabCompanies" },
];

function FavoriteCard({ item, type, onRemove, onToggleNotify, t }) {
  const name   = item.name || item.title || item.editionName || item.bookTitle || item.username || "—";
  const imgUrl = item.imageUrl || item.coverUrl || null;

  return (
    <div className="fav-card">
      <div className="fav-card-img">
        {imgUrl
          ? <img src={imgUrl} alt={name} />
          : <div className="fav-card-img-placeholder">📚</div>
        }
      </div>
      <div className="fav-card-body">
        <span className="fav-card-type-badge">{type}</span>
        <div className="fav-card-name">{name}</div>
      </div>
      <div className="fav-card-actions">
        <button
          className={`fav-notify-btn ${item.notify ? "active" : ""}`}
          title={item.notify ? t("favorites.notifyOn") : t("favorites.notifyOff")}
          onClick={() => onToggleNotify(item, type)}
        >
          {item.notify ? "🔔" : "🔕"}
        </button>
        <button
          className="fav-remove-btn"
          title={t("favorites.remove")}
          onClick={() => onRemove(item, type)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function FavoritesPage({ onBack }) {
  const { user } = useAuth();
  const { t }    = useI18n();

  const [activeTab, setActiveTab] = useState("all");
  const [data, setData] = useState({
    books: [], editions: [], authors: [], artists: [], companies: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [books, editions, authors, artists, companies] = await Promise.all([
        fetch(API.FAVORITE_BOOKS,    { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(API.FAVORITE_EDITIONS, { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(API.FAVORITE_AUTHORS,  { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(API.FAVORITE_ARTISTS,  { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(API.FAVORITE_COMPANIES,{ credentials: "include" }).then(r => r.ok ? r.json() : []),
      ]);
      setData({ books, editions, authors, artists, companies });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleRemove = async (item, type) => {
    const id = item.bookId || item.editionId || item.authorId || item.artistId || item.companyId;
    const url = {
      books:     API.FAVORITE_BOOK(id),
      editions:  API.FAVORITE_EDITION(id),
      authors:   API.FAVORITE_AUTHOR(id),
      artists:   API.FAVORITE_ARTIST(id),
      companies: API.FAVORITE_COMPANY(id),
    }[type];
    await fetch(url, { method: "DELETE", credentials: "include" });
    setData(prev => ({ ...prev, [type]: prev[type].filter(x => x.id !== item.id) }));
  };

  const handleToggleNotify = async (item, type) => {
    const id = item.bookId || item.editionId || item.authorId || item.artistId || item.companyId;
    const url = {
      books:     API.FAVORITE_BOOK_NOTIFY(id),
      editions:  API.FAVORITE_EDITION_NOTIFY(id),
      authors:   API.FAVORITE_AUTHOR_NOTIFY(id),
      artists:   API.FAVORITE_ARTIST_NOTIFY(id),
      companies: API.FAVORITE_COMPANY_NOTIFY(id),
    }[type];
    const res = await fetch(url, {
      method:  "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ notify: !item.notify }),
    });
    if (res.ok) {
      const updated = await res.json();
      setData(prev => ({
        ...prev,
        [type]: prev[type].map(x => x.id === item.id ? { ...x, notify: updated.notify } : x),
      }));
    }
  };

  const renderCards = (items, type, emptyKey) => {
    if (loading) return <div className="fav-loading">⏳</div>;
    if (!items.length) return <div className="fav-empty">{t(emptyKey)}</div>;
    return (
      <div className="fav-grid">
        {items.map(item => (
          <FavoriteCard
            key={item.id}
            item={item}
            type={type}
            onRemove={handleRemove}
            onToggleNotify={handleToggleNotify}
            t={t}
          />
        ))}
      </div>
    );
  };

  const allItems = [
    ...data.books.map(x => ({ ...x, _type: "books" })),
    ...data.editions.map(x => ({ ...x, _type: "editions" })),
    ...data.authors.map(x => ({ ...x, _type: "authors" })),
    ...data.artists.map(x => ({ ...x, _type: "artists" })),
    ...data.companies.map(x => ({ ...x, _type: "companies" })),
  ].sort((a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0));

  return (
    <div className="fav-page">
      <div className="fav-header">
        {onBack && (
          <button className="fav-back-btn" onClick={onBack}>
            {t("back")}
          </button>
        )}
        <h2 className="section-title">❤️ {t("favorites.title")}</h2>
      </div>

      <div className="fav-tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`fav-tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {t(tab.labelKey)}
            {tab.key !== "all" && data[tab.key]?.length > 0 && (
              <span className="fav-tab-count">{data[tab.key].length}</span>
            )}
            {tab.key === "all" && allItems.length > 0 && (
              <span className="fav-tab-count">{allItems.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="fav-content">
        {activeTab === "all" && (
          loading
            ? <div className="fav-loading">⏳</div>
            : !allItems.length
              ? <div className="fav-empty">{t("favorites.emptyAll")}</div>
              : <div className="fav-grid">
                  {allItems.map(item => (
                    <FavoriteCard
                      key={item.id}
                      item={item}
                      type={item._type}
                      onRemove={handleRemove}
                      onToggleNotify={handleToggleNotify}
                      t={t}
                    />
                  ))}
                </div>
        )}
        {activeTab === "books"     && renderCards(data.books,     "books",     "favorites.emptyBooks")}
        {activeTab === "editions"  && renderCards(data.editions,  "editions",  "favorites.emptyEditions")}
        {activeTab === "authors"   && renderCards(data.authors,   "authors",   "favorites.emptyAuthors")}
        {activeTab === "artists"   && renderCards(data.artists,   "artists",   "favorites.emptyArtists")}
        {activeTab === "companies" && renderCards(data.companies, "companies", "favorites.emptyCompanies")}
      </div>
    </div>
  );
}
