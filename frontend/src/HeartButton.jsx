import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import { API } from "./api";
import "./FavoritesPage.css"; // reuses .heart-btn styles

/**
 * Reusable heart/favorite button.
 * Props:
 *   type: "editions" | "books" | "authors" | "artists" | "companies"
 *   id:   entity numeric id
 */
export default function HeartButton({ type, id }) {
  const { user }  = useAuth();
  const { t }     = useI18n();
  const [favorited, setFavorited] = useState(false);
  const [count, setCount]         = useState(0);
  const [loading, setLoading]     = useState(false);

  const statusUrl = {
    editions:  API.FAVORITE_EDITION_STATUS(id),
    books:     API.FAVORITE_BOOK_STATUS(id),
    authors:   API.FAVORITE_AUTHOR_STATUS(id),
    artists:   API.FAVORITE_ARTIST_STATUS(id),
    companies: API.FAVORITE_COMPANY_STATUS(id),
  }[type];

  const addUrl = {
    editions:  API.FAVORITE_EDITION(id),
    books:     API.FAVORITE_BOOK(id),
    authors:   API.FAVORITE_AUTHOR(id),
    artists:   API.FAVORITE_ARTIST(id),
    companies: API.FAVORITE_COMPANY(id),
  }[type];

  const removeUrl = {
    editions:  API.FAVORITE_EDITION(id),
    books:     API.FAVORITE_BOOK(id),
    authors:   API.FAVORITE_AUTHOR(id),
    artists:   API.FAVORITE_ARTIST(id),
    companies: API.FAVORITE_COMPANY(id),
  }[type];

  const idKey = {
    editions:  "editionId",
    books:     "bookId",
    authors:   "authorId",
    artists:   "artistId",
    companies: "companyId",
  }[type];

  const fetchStatus = useCallback(async () => {
    if (!user || !id) return;
    const res = await fetch(statusUrl, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setFavorited(data.favorited ?? false);
      setCount(data.count ?? 0);
    }
  }, [user, id, statusUrl]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleClick = async () => {
    if (!user) { alert(t("favorites.loginRequired")); return; }
    if (loading) return;
    setLoading(true);
    try {
      if (favorited) {
        const res = await fetch(removeUrl, { method: "DELETE", credentials: "include" });
        if (res.ok) { setFavorited(false); setCount(c => Math.max(0, c - 1)); }
      } else {
        const res = await fetch(addUrl, {
          method:  "POST",
          credentials: "include",
        });
        if (res.ok) { setFavorited(true); setCount(c => c + 1); }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className={`heart-btn ${favorited ? "favorited" : ""}`}
      onClick={handleClick}
      disabled={loading}
      title={favorited ? t("favorites.remove") : "❤️"}
    >
      <span>{favorited ? "❤️" : "🤍"}</span>
      {count > 0 && <span className="heart-count">{count}</span>}
    </button>
  );
}
