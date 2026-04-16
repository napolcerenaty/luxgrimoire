import { useState, useEffect } from "react";
import "./BookDetailPage.css";
import BookCarousel from "./BookCarousel";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";
import { getLanguageLabel } from "./bookLanguages";
import AddToCollectionModal from "./AddToCollectionModal";
import HeartButton from "./HeartButton";
import { API } from "./api";

export default function BookDetailPage({
  bookId,
  subMonthContext,
  onBack,
  onEdit,
  onEditEdition,
  onNewEdition,
  onNavigateNew,
  onCompanyClick,
  onSeriesClick,
  onArtistClick,
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [book, setBook] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deletingEditionId, setDeletingEditionId] = useState(null);
  const [companies, setCompanies] = useState([]);

  const [ownedBooks, setOwnedBooks] = useState([]);
  const [atcEdition,  setAtcEdition] = useState(null);   // edition selected for AddToCollectionModal
  const [addedEditionId, setAddedEditionId] = useState(null);
  const [confirmDupe, setConfirmDupe] = useState(null); // { bookId, editionId, count }

  // User tags per edition: { [editionId]: [{id, tag}] }
  const [editionTags, setEditionTags] = useState({});
  const [allUserTags, setAllUserTags] = useState([]);
  const [tagInputs, setTagInputs] = useState({});        // { [editionId]: string }
  const [tagDropdown, setTagDropdown] = useState(null);  // editionId with open dropdown

  const loadEditionTags = (editionId) => {
    fetch(API.USER_EDITION_TAGS(editionId), { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((tags) => setEditionTags((prev) => ({ ...prev, [editionId]: tags })))
      .catch(() => {});
  };

  const addTag = async (editionId, tag) => {
    const trimmed = tag?.trim();
    if (!trimmed) return;
    const res = await fetch(API.USER_EDITION_TAGS(editionId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tag: trimmed }),
    });
    if (res.ok) {
      loadEditionTags(editionId);
      setTagInputs((prev) => ({ ...prev, [editionId]: "" }));
      setTagDropdown(null);
      // refresh all user tags for autocomplete
      fetch(API.USER_TAGS, { credentials: "include" })
        .then((r) => r.ok ? r.json() : [])
        .then(setAllUserTags).catch(() => {});
    }
  };

  const removeTag = async (editionId, tagId) => {
    const res = await fetch(API.USER_EDITION_TAG(editionId, tagId), {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) loadEditionTags(editionId);
  };

  useEffect(() => {
    if (!bookId) return;
    setLoading(true);
    setNotFound(false);
    setBook(null);
    fetch(`http://localhost:8080/api/book-details/${encodeURIComponent(bookId)}`, {
      credentials: "include",
    })
      .then((res) => {
        if (res.status === 404) { setNotFound(true); setLoading(false); return null; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data) {
          setBook(data);
          setLoading(false);
          // load tags for each edition if user is logged in
          if (user && data.editions) {
            data.editions.forEach((ed) => loadEditionTags(ed.id));
          }
        }
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [bookId]);

  useEffect(() => {
    fetch("http://localhost:8080/api/companies", { credentials: "include" })
      .then((res) => res.ok ? res.json() : [])
      .then(setCompanies)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) { setOwnedBooks([]); setEditionTags({}); setAllUserTags([]); return; }
    fetch(API.USER_BOOKS, { credentials: "include" })
      .then((res) => res.ok ? res.json() : [])
      .then(setOwnedBooks)
      .catch(() => setOwnedBooks([]));
    // load all user tags for autocomplete
    fetch(API.USER_TAGS, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setAllUserTags).catch(() => {});
  }, [user]);

  const handleAddEdition = (edition) => {
    if (!user || !edition) return;
    const count = ownedBooks.filter((entry) => entry.editionId === edition.id).length;
    if (count > 0) {
      setConfirmDupe({ editionId: edition.id, count });
    } else {
      setAtcEdition(edition);
    }
  };

  const onPurchaseAdded = (tx) => {
    // refresh owned books to reflect the new entry
    fetch(API.USER_BOOKS, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        setOwnedBooks(data);
        const newEntry = data.find((e) => e.editionId === atcEdition?.id);
        if (newEntry) {
          setAddedEditionId(newEntry.editionId);
          setTimeout(() => setAddedEditionId(null), 3000);
        }
      })
      .catch(() => {});
    setAtcEdition(null);
  };

  const handleDeleteBook = async () => {
    if (!book || !window.confirm(t("bookDetail.deleteConfirm"))) return;
    setDeleting(true);
    try {
      const res = await fetch(`http://localhost:8080/api/book-details/${book.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) onBack();
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteEdition = async (edition) => {
    if (!window.confirm(t("bookDetail.deleteEditionConfirm"))) return;
    setDeletingEditionId(edition.id);
    try {
      const res = await fetch(`http://localhost:8080/api/book-details/${book.id}/editions/${edition.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setBook((prev) => (prev ? { ...prev, editions: (prev.editions || []).filter((item) => item.id !== edition.id) } : prev));
      }
    } finally {
      setDeletingEditionId(null);
    }
  };

  const formatSubscriptionDate = (month, year) => {
    if (!month || !year) return null;
    const months = t("bookDetail.months");
    const monthsArr = Array.isArray(months) ? months : [];
    const monthName = monthsArr[month - 1] || `${month}`;
    return `${monthName} ${year}`;
  };

  const getCompanyForEdition = (edition) => {
    if (!edition.bookBoxCompanyId) return null;
    return companies.find((c) => c.id === edition.bookBoxCompanyId) || null;
  };

  const confirmDupeEdition = confirmDupe
    ? (book?.editions || []).find((edition) => edition.id === confirmDupe.editionId)
    : null;

  const renderEditionCard = (edition) => {
    const company = getCompanyForEdition(edition);
    const subDate = formatSubscriptionDate(edition.subscriptionMonth, edition.subscriptionYear);
    const hasSaleDates = edition.firstAccessDate || edition.earlyAccessDate || edition.generalSaleDate;
    const wasAdded = addedEditionId === edition.id;

    return (
      <div key={edition.id} className="detail-edition-card">
        <div className="detail-edition-header">
          <h3 className="detail-edition-name">{edition.editionName || t("bookDetail.defaultEdition")}</h3>
          <div className="detail-edition-actions">
            <HeartButton type="editions" id={edition.id} />
            {user && (
              <button
                className="detail-action-btn detail-add-collection-btn"
                onClick={() => handleAddEdition(edition)}
              >
                {wasAdded ? t("userCollection.bookAdded") : t("userCollection.addBook")}
              </button>
            )}
            {user && (
              <button
                className="detail-action-btn"
                onClick={() => onEditEdition && onEditEdition(book, edition)}
              >
                {t("bookDetail.editEditionBtn")}
              </button>
            )}
            {(user?.role === "admin" || user?.role === "superadmin") && (
              <button
                className="detail-action-btn detail-delete-btn"
                onClick={() => handleDeleteEdition(edition)}
                disabled={deletingEditionId === edition.id}
              >
                {t("bookDetail.deleteEdition")}
              </button>
            )}
          </div>
        </div>

        <BookCarousel images={edition.imageUrls || []} />

        <div className="detail-fields">
          {edition.subscriptionName && (
            <div className="detail-field">
              <span className="detail-label">{t("bookDetail.subscription")}</span>
              <span className="detail-value">{edition.subscriptionName}</span>
            </div>
          )}
          {edition.publisher && (
            <div className="detail-field">
              <span className="detail-label">{t("bookDetail.publisher")}</span>
              <span className="detail-value">{edition.publisher}</span>
            </div>
          )}
          {edition.language && (
            <div className="detail-field">
              <span className="detail-label">{t("bookDetail.language")}</span>
              <span className="detail-value">{getLanguageLabel(edition.language)}</span>
            </div>
          )}
          {subDate && (
            <div className="detail-field">
              <span className="detail-label">{t("bookDetail.subscriptionDate")}</span>
              <span className="detail-value">{subDate}</span>
            </div>
          )}
          {edition.basePrice != null && (
            <div className="detail-field">
              <span className="detail-label">{t("bookDetail.price")}</span>
              <span className="detail-value">{edition.basePrice} {edition.currency}</span>
            </div>
          )}
          {(company || edition.bookBoxCompanyCustomName) && (
            <div className="detail-field">
              <span className="detail-label">{t("bookDetail.company")}</span>
              <span className="detail-value">
                {company ? (
                  <button
                    className="detail-company-link"
                    onClick={() => onCompanyClick && onCompanyClick(company)}
                  >
                    {company.name}
                  </button>
                ) : (
                  edition.bookBoxCompanyCustomName
                )}
              </span>
            </div>
          )}
        </div>

        {hasSaleDates && (
          <div className="detail-section">
            <h3 className="detail-section-title">{t("bookDetail.saleDates")}</h3>
            <table className="detail-dates-table">
              <tbody>
                {edition.firstAccessDate && (
                  <tr>
                    <td className="detail-date-label">{t("bookDetail.firstAccess")}</td>
                    <td className="detail-date-value">{edition.firstAccessDate}</td>
                  </tr>
                )}
                {edition.earlyAccessDate && (
                  <tr>
                    <td className="detail-date-label">{t("bookDetail.earlyAccess")}</td>
                    <td className="detail-date-value">{edition.earlyAccessDate}</td>
                  </tr>
                )}
                {edition.generalSaleDate && (
                  <tr>
                    <td className="detail-date-label">{t("bookDetail.generalSale")}</td>
                    <td className="detail-date-value">{edition.generalSaleDate}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {edition.artists && edition.artists.length > 0 && (
          <div className="detail-section">
            <h3 className="detail-section-title">{t("bookDetail.artists")}</h3>
            <ul className="detail-artists-list">
              {edition.artists.map((artist, idx) => (
                <li key={idx} className="detail-artist-card">
                  {artist.artistId && onArtistClick ? (
                    <button
                      className="detail-artist-name detail-artist-link"
                      onClick={() => onArtistClick(artist.artistId)}
                    >
                      {artist.artistName}
                    </button>
                  ) : (
                    <span className="detail-artist-name">{artist.artistName}</span>
                  )}
                  <span className="detail-artist-role">{artist.contribution}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {edition.features && edition.features.length > 0 && (
          <div className="detail-section">
            <h3 className="detail-section-title">{t("bookDetail.features")}</h3>
            <ul className="detail-features-list">
              {edition.features.map((ft, idx) => (
                <li key={idx} className="detail-feature-item">{ft}</li>
              ))}
            </ul>
          </div>
        )}

        {user && ownedBooks.some(e => e.editionId === edition.id) && (
          <div className="detail-section detail-tags-section">
            <h3 className="detail-section-title">{t("collection.tags.label")}</h3>
            <div className="detail-tags-list">
              {(editionTags[edition.id] || []).map((tg) => (
                <span key={tg.id} className="detail-tag-chip">
                  {tg.tag}
                  <button
                    className="detail-tag-remove"
                    onClick={() => removeTag(edition.id, tg.id)}
                    title={t("collection.tags.remove")}
                  >×</button>
                </span>
              ))}
              {(editionTags[edition.id] || []).length === 0 && (
                <span className="detail-tags-empty">{t("collection.tags.noTags")}</span>
              )}
            </div>
            <div className="detail-tags-input-row" style={{ position: "relative" }}>
              <input
                className="admin-form-input detail-tag-input"
                type="text"
                placeholder={t("collection.tags.placeholder")}
                value={tagInputs[edition.id] || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setTagInputs((prev) => ({ ...prev, [edition.id]: val }));
                  setTagDropdown(val.length > 0 ? edition.id : null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { addTag(edition.id, tagInputs[edition.id]); }
                  if (e.key === "Escape") { setTagDropdown(null); }
                }}
                onFocus={() => {
                  if ((tagInputs[edition.id] || "").length > 0) setTagDropdown(edition.id);
                }}
              />
              <button
                className="page-btn"
                style={{ marginLeft: "0.4rem", fontSize: "0.85rem" }}
                onClick={() => addTag(edition.id, tagInputs[edition.id])}
              >{t("collection.tags.add")}</button>
              {tagDropdown === edition.id && allUserTags.filter((tg) => tg.toLowerCase().includes((tagInputs[edition.id] || "").toLowerCase())).length > 0 && (
                <ul className="detail-tag-dropdown">
                  {allUserTags
                    .filter((tg) => tg.toLowerCase().includes((tagInputs[edition.id] || "").toLowerCase()))
                    .slice(0, 8)
                    .map((tg) => (
                      <li key={tg}
                        className="detail-tag-option"
                        onMouseDown={(e) => { e.preventDefault(); addTag(edition.id, tg); }}
                      >{tg}</li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="book-detail-page">
        <button className="detail-back-btn" onClick={onBack}>{t("back")}</button>
        <div className="status-container"><div className="spinner" /></div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="book-detail-page">
        <button className="detail-back-btn" onClick={onBack}>{t("back")}</button>
        <div className="detail-not-found">
          <h2 className="detail-title">{t("bookDetail.noDetails")}</h2>
          {user && (
            <button className="detail-action-btn" onClick={onNavigateNew}>
              {t("bookDetail.addDetails")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="book-detail-page">
      {confirmDupe && confirmDupeEdition && (
        <div className="uc-confirm-overlay">
          <div className="uc-confirm-dialog">
            <p>{t("userCollection.alreadyOwned", { count: confirmDupe.count })}</p>
            <div className="uc-confirm-btns">
              <button
                className="uc-confirm-yes"
                onClick={() => { setAtcEdition(confirmDupeEdition); setConfirmDupe(null); }}
              >
                {t("userCollection.confirmYes")}
              </button>
              <button className="uc-confirm-no" onClick={() => setConfirmDupe(null)}>
                {t("userCollection.confirmNo")}
              </button>
            </div>
          </div>
        </div>
      )}

      {atcEdition && book && (
        <AddToCollectionModal
          book={book}
          edition={atcEdition}
          subMonthContext={subMonthContext}
          onClose={() => setAtcEdition(null)}
          onAdded={onPurchaseAdded}
        />
      )}

      <div className="detail-actions-top">
        <button className="detail-back-btn" onClick={onBack}>{t("back")}</button>
        <div className="detail-actions-right">
          {user && (
            <button className="detail-action-btn" onClick={() => onNewEdition && onNewEdition(book)}>
              {t("bookDetail.addEdition")}
            </button>
          )}
          {user && (
            <button className="detail-action-btn" onClick={() => onEdit && onEdit(book)}>
              {t("bookDetail.editBookMeta")}
            </button>
          )}
          {(user?.role === "admin" || user?.role === "superadmin") && (
            <button className="detail-action-btn detail-delete-btn" onClick={handleDeleteBook} disabled={deleting}>
              {t("bookDetail.deleteBtn")}
            </button>
          )}
        </div>
      </div>

      <div className="detail-book-header">
        <h1 className="detail-title">{book.title}</h1>
        {book.author && <p className="detail-author">{book.author}</p>}
        <HeartButton type="books" id={book.id} />
        <div className="detail-fields" style={{ marginTop: "0.75rem" }}>
          {book.seriesName && (
            <div className="detail-field">
              <span className="detail-label">{t("bookDetail.series")}</span>
              <button
                className="detail-series-link"
                onClick={() => onSeriesClick && onSeriesClick(book.id)}
                type="button"
              >
                {book.seriesName}
              </button>
            </div>
          )}
          <div className="detail-field">
            <span className="detail-label">{t("bookDetail.seriesPosition")}</span>
            <span className="detail-value">
              {book.volumeNumber || t("bookDetail.standalone")}
            </span>
          </div>
        </div>
      </div>

      <div className="detail-section">
        <h2 className="detail-section-title">{t("bookDetail.editions")}</h2>
        <div className="detail-editions-list">
          {book.editions && book.editions.length > 0 ? (
            book.editions.map((edition) => renderEditionCard(edition))
          ) : (
            <p className="detail-no-editions">{t("bookDetail.noEditions")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
