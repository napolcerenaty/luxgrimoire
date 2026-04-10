import { useState, useEffect } from "react";
import "./BookDetailPage.css";
import BookCarousel from "./BookCarousel";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";

export default function BookDetailPage({ bookTitle, onBack, onEdit, onEditEdition, onNewEdition, onNavigateNew, onCompanyClick }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [book, setBook] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deletingEditionId, setDeletingEditionId] = useState(null);
  const [companies, setCompanies] = useState([]);

  // per-edition add-to-collection state
  const [ownedBooks, setOwnedBooks] = useState([]);
  const [addingEditionId, setAddingEditionId] = useState(null);
  const [addedEditionId, setAddedEditionId] = useState(null);
  const [confirmDupe, setConfirmDupe] = useState(null); // { editionId, count }

  useEffect(() => {
    if (!bookTitle) return;
    setLoading(true);
    setNotFound(false);
    setBook(null);
    fetch(`http://localhost:8080/api/book-details/by-title?title=${encodeURIComponent(bookTitle)}`, {
      credentials: "include",
    })
      .then((res) => {
        if (res.status === 404) { setNotFound(true); setLoading(false); return null; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => { if (data) { setBook(data); setLoading(false); } })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [bookTitle]);

  useEffect(() => {
    fetch("http://localhost:8080/api/companies", { credentials: "include" })
      .then((res) => res.ok ? res.json() : [])
      .then(setCompanies)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) { setOwnedBooks([]); return; }
    fetch("http://localhost:8080/api/user/books", { credentials: "include" })
      .then((res) => res.ok ? res.json() : [])
      .then(setOwnedBooks)
      .catch(() => setOwnedBooks([]));
  }, [user]);

  const doAddEdition = async (edition) => {
    if (!book || !edition) return;
    setAddingEditionId(edition.id);
    try {
      const res = await fetch("http://localhost:8080/api/user/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ bookId: book.id, editionId: edition.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setOwnedBooks((prev) => [...prev, data.entry]);
        setAddedEditionId(edition.id);
        setTimeout(() => setAddedEditionId(null), 3000);
      }
    } finally {
      setAddingEditionId(null);
      setConfirmDupe(null);
    }
  };

  const handleAddEdition = (edition) => {
    if (!user || !edition) return;
    const count = ownedBooks.filter((e) => e.editionId === edition.id).length;
    if (count > 0) {
      setConfirmDupe({ editionId: edition.id, count });
    } else {
      doAddEdition(edition);
    }
  };

  const handleDeleteBook = async () => {
    if (!window.confirm(t("bookDetail.deleteConfirm"))) return;
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
        setBook((prev) => ({ ...prev, editions: prev.editions.filter((e) => e.id !== edition.id) }));
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
          <h2 className="detail-title">{bookTitle}</h2>
          <p className="detail-no-details">{t("bookDetail.noDetails")}</p>
          {user && (
            <button className="detail-action-btn" onClick={onNavigateNew}>
              {t("bookDetail.addDetails")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const confirmDupeEdition = confirmDupe
    ? (book?.editions || []).find((e) => e.id === confirmDupe.editionId)
    : null;

  return (
    <div className="book-detail-page">
      {/* duplicate confirmation dialog */}
      {confirmDupe && confirmDupeEdition && (
        <div className="uc-confirm-overlay">
          <div className="uc-confirm-dialog">
            <p>{t("userCollection.alreadyOwned", { count: confirmDupe.count })}</p>
            <div className="uc-confirm-btns">
              <button className="uc-confirm-yes" onClick={() => doAddEdition(confirmDupeEdition)} disabled={addingEditionId === confirmDupe.editionId}>
                {t("userCollection.confirmYes")}
              </button>
              <button className="uc-confirm-no" onClick={() => setConfirmDupe(null)}>
                {t("userCollection.confirmNo")}
              </button>
            </div>
          </div>
        </div>
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
          {user?.username === "admin" && (
            <button className="detail-action-btn detail-delete-btn" onClick={handleDeleteBook} disabled={deleting}>
              {t("bookDetail.deleteBtn")}
            </button>
          )}
        </div>
      </div>

      {/* Book header */}
      <div className="detail-book-header">
        <h1 className="detail-title">{book.title}</h1>
        {book.author && <p className="detail-author">{book.author}</p>}
        {book.seriesName && (
          <div className="detail-fields" style={{ marginTop: "0.5rem" }}>
            <div className="detail-field">
              <span className="detail-label">{t("bookDetail.series")}</span>
              <span className="detail-value">{book.seriesName}</span>
            </div>
            {book.volumeNumber && (
              <div className="detail-field">
                <span className="detail-label">{t("bookDetail.volume")}</span>
                <span className="detail-value">{book.volumeNumber}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Editions */}
      <div className="detail-editions-list">
        {book.editions && book.editions.length > 0 ? (
          book.editions.map((edition) => {
            const company = getCompanyForEdition(edition);
            const subDate = formatSubscriptionDate(edition.subscriptionMonth, edition.subscriptionYear);
            const hasSaleDates = edition.firstAccessDate || edition.earlyAccessDate || edition.generalSaleDate;
            const isAdding = addingEditionId === edition.id;
            const wasAdded = addedEditionId === edition.id;

            return (
              <div key={edition.id} className="detail-edition-card">
                <div className="detail-edition-header">
                  <h3 className="detail-edition-name">{edition.editionName || t("bookDetail.defaultEdition")}</h3>
                  <div className="detail-edition-actions">
                    {user && (
                      <button
                        className="detail-action-btn detail-add-collection-btn"
                        onClick={() => handleAddEdition(edition)}
                        disabled={isAdding}
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
                    {user?.username === "admin" && (
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
                      {edition.artists.map((a, idx) => (
                        <li key={idx} className="detail-artist-card">
                          <span className="detail-artist-name">{a.artistName}</span>
                          <span className="detail-artist-role">{a.contribution}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <p className="detail-no-editions">{t("bookDetail.noEditions")}</p>
        )}
      </div>
    </div>
  );
}
