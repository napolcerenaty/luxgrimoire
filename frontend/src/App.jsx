import { useState, useEffect } from "react";
import "./App.css";
import CollectionPage from "./CollectionPage";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./AuthContext";
import UserMenu from "./UserMenu";
import AccountPage from "./AccountPage";
import { I18nProvider, useI18n } from "./i18n";
import LanguagePicker from "./LanguagePicker";
import { ThemeProvider } from "./ThemeContext";
import ThemePicker from "./ThemePicker";
import BookDetailPage from "./BookDetailPage";
import BookDetailEditPage from "./BookDetailEditPage";
import CompanyListPage from "./CompanyListPage";
import CompanyPage from "./CompanyPage";
import CompanyEditPage from "./CompanyEditPage";
import AuthorPage from "./AuthorPage";
import ArtistPage from "./ArtistPage";
import SearchPanel from "./SearchPanel";
import RecentAnnouncements from "./RecentAnnouncements";
import AdminPage from "./AdminPage";
import { API } from "./api";

function BookCard({ book, onClick }) {
  const coverUrl = book.coverUrl
    || book.editions?.[0]?.imageUrls?.[0]
    || "https://placehold.co/300x450/060d18/00b4d0?text=No+Cover";
  const seriesLabel = book.seriesName
    ? `${book.seriesName}${book.volumeNumber ? ` #${book.volumeNumber}` : ""}`
    : null;

  return (
    <article
      className={`book-card${onClick ? " book-card--clickable" : ""}`}
      onClick={onClick ? () => onClick(book.id) : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick(book.id) : undefined}
    >
      <div className="book-cover">
        <img
          src={coverUrl}
          alt={`Cover of ${book.title}`}
          onError={(e) => {
            e.target.src = "https://placehold.co/300x450/060d18/00b4d0?text=No+Cover";
          }}
        />
        {seriesLabel && <span className="book-genre-badge">{seriesLabel}</span>}
      </div>
      <div className="book-info">
        <h2 className="book-title">{book.title}</h2>
        <p className="book-author">{book.author}</p>
      </div>
    </article>
  );
}

function SeriesBooksPage({ sourceBookId, onBack, onBookClick }) {
  const { t } = useI18n();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sourceBookId) return;
    setLoading(true);
    setError(null);
    fetch(API.BOOK_SERIES_BOOKS(sourceBookId), { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setBooks(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [sourceBookId]);

  const seriesName = books[0]?.seriesName;

  return (
    <div className="series-books-page">
      <div className="detail-actions-top">
        <button className="detail-back-btn" onClick={onBack}>{t("back")}</button>
      </div>

      {loading ? (
        <div className="status-container">
          <div className="spinner" />
          <span>{t("browse.loading")}</span>
        </div>
      ) : error ? (
        <div className="status-container">
          <p className="error-text">{t("browse.error", { msg: error })}</p>
        </div>
      ) : (
        <>
          <h2 className="section-title">{seriesName || t("bookDetail.seriesBooksTitle")}</h2>
          {books.length > 0 ? (
            <div className="book-grid">
              {books.map((book) => <BookCard key={book.id} book={book} onClick={onBookClick} />)}
            </div>
          ) : (
            <p className="search-no-results">{t("bookDetail.noSeriesBooks")}</p>
          )}
        </>
      )}
    </div>
  );
}

function AppInner() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [tab, setTab] = useState("browse");
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBookId, setSelectedBookId] = useState(null);
  const [editingBook, setEditingBook] = useState(null);
  const [editingEdition, setEditingEdition] = useState(null);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [editingCompany, setEditingCompany] = useState(null);
  const [selectedAuthorId, setSelectedAuthorId] = useState(null);
  const [selectedArtistId, setSelectedArtistId] = useState(null);
  const [selectedSeriesBookId, setSelectedSeriesBookId] = useState(null);

  const [prevTab, setPrevTab] = useState("browse");
  const [accountSection, setAccountSection] = useState("calendar");

  // Hash-based navigation: /#admin opens admin panel if user is admin
  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === "#admin") {
        setTab("admin");
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const handleBookClick = (bookId) => {
    setSelectedBookId(bookId);
    setEditingBook(null);
    if (tab !== "book-detail") setPrevTab(tab);
    setTab("book-detail");
  };
  const handleEditBook = (book) => { setEditingBook(book); setEditingEdition(null); setTab("book-edit"); };
  const handleEditEdition = (book, edition) => { setEditingBook(book); setEditingEdition(edition); setTab("book-edit"); };
  const handleNewEdition = (book) => { setEditingBook(book); setEditingEdition("new"); setTab("book-edit"); };
  const handleNewBook = () => { setEditingBook(null); setEditingEdition(null); setTab("book-edit"); };
  const handleBookSaved = (saved) => { setSelectedBookId(saved.id); setEditingBook(null); setEditingEdition(null); setTab("book-detail"); };
  const handleSeriesClick = (bookId) => { setSelectedSeriesBookId(bookId); setPrevTab(tab); setTab("series-books"); };

  const handleCompanyClick = (company) => { setSelectedCompany(company); setTab("company-detail"); };
  const handleAuthorClick = (authorId) => { setSelectedAuthorId(authorId); setPrevTab(tab); setTab("author-detail"); };
  const handleArtistClick = (artistId) => { setSelectedArtistId(artistId); setPrevTab(tab); setTab("artist-detail"); };
  const handleNewCompany = () => { setEditingCompany(null); setTab("company-edit"); };
  const handleEditCompany = (company) => { setEditingCompany(company); setTab("company-edit"); };
  const handleCompanySaved = (saved) => { setSelectedCompany(saved); setTab("company-detail"); };

  useEffect(() => {
    fetch(API.BOOKS + "?page=0&size=100")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
        return res.json();
      })
      .then((data) => { setBooks(data.content ?? data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  const isUserPage = tab === "account" || tab === "admin";
  const isDetailPage = tab === "book-detail" || tab === "book-edit" || tab === "company-detail" || tab === "company-edit" || tab === "author-detail" || tab === "artist-detail" || tab === "series-books";

  return (
    <div className="app">
      <header className="header">
        <div className="header-controls">
          <ThemePicker />
          <LanguagePicker />
          <UserMenu onNavigate={setTab} />
        </div>
        <h1
          className="header-logo"
          onClick={() => setTab("browse")}
          title="LuxGrimoire – Strona główna"
        >✶ LuxGrimoire ✶</h1>
      </header>

      {!isUserPage && !isDetailPage && (
        <SearchPanel
          books={books}
          onBookClick={handleBookClick}
          onCompanyClick={handleCompanyClick}
          onAuthorClick={handleAuthorClick}
          onArtistClick={handleArtistClick}
          user={user}
          onNewBook={handleNewBook}
          onAdd={(filter) => {
            if (filter === "companies") { handleNewCompany(); }
            else { handleNewBook(); }
          }}
        />
      )}

      <main>
        {tab === "browse" && (
          loading ? (
            <div className="status-container">
              <div className="spinner" />
              <span>{t("browse.loading")}</span>
            </div>
          ) : error ? (
            <div className="status-container">
              <p className="error-text">{t("browse.error", { msg: error })}</p>
              <p>{t("browse.errorHint")}</p>
            </div>
          ) : (
            <>
              <RecentAnnouncements />
              {books.length > 0 && (
                <>
                  <h2 className="section-title">{t("browse.sectionTitle")}</h2>
                  <div className="book-grid">
                    {books.map((book) => (
                      <BookCard key={book.id} book={book} onClick={handleBookClick} />
                    ))}
                  </div>
                </>
              )}
            </>
          )
        )}
        {tab === "collection" && <CollectionPage onBookClick={handleBookClick} />}
        {tab === "account"    && <AccountPage
            onBack={() => setTab("browse")}
            initialSection={accountSection}
            onSectionChange={setAccountSection}
            onBookClick={(bookId) => { setSelectedBookId(bookId); setEditingBook(null); setPrevTab("account"); setTab("book-detail"); }}
          />}
        {tab === "admin" && <AdminPage onBack={() => { window.location.hash = ""; setTab("browse"); }} />}
        {tab === "company-list" && (
          <CompanyListPage
            onCompanyClick={handleCompanyClick}
            onNewCompany={handleNewCompany}
            user={user}
          />
        )}
        {tab === "company-detail" && (
          <CompanyPage
            company={selectedCompany}
            onBack={() => setTab("company-list")}
            onEdit={handleEditCompany}
            onDelete={() => setTab("company-list")}
            user={user}
          />
        )}
        {tab === "company-edit" && (
          <CompanyEditPage
            initialData={editingCompany}
            onSaved={handleCompanySaved}
            onBack={() => setTab(editingCompany ? "company-detail" : "company-list")}
            user={user}
          />
        )}
         {tab === "book-detail" && (
           <BookDetailPage
             bookId={selectedBookId}
             onBack={() => setTab(prevTab)}
             onEdit={handleEditBook}
             onEditEdition={handleEditEdition}
             onNewEdition={handleNewEdition}
             onNavigateNew={handleNewBook}
             onCompanyClick={handleCompanyClick}
             onSeriesClick={handleSeriesClick}
            />
          )}
        {tab === "series-books" && (
          <SeriesBooksPage
            sourceBookId={selectedSeriesBookId}
            onBack={() => setTab(prevTab)}
            onBookClick={handleBookClick}
          />
        )}
        {tab === "book-edit" && (
          <BookDetailEditPage
            initialData={editingBook}
            editingEdition={editingEdition}
            onSaved={handleBookSaved}
            onBack={() => {
              if (editingBook) {
                setSelectedBookId(editingBook.id);
                setTab("book-detail");
              } else {
                setTab(prevTab);
              }
            }}
          />
        )}
        {tab === "author-detail" && (
          <AuthorPage
            authorId={selectedAuthorId}
            onBack={() => setTab(prevTab)}
            onBookClick={handleBookClick}
          />
        )}
        {tab === "artist-detail" && (
          <ArtistPage
            artistId={selectedArtistId}
            onBack={() => setTab(prevTab)}
            onBookClick={handleBookClick}
          />
        )}
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="footer-logo">✶ LuxGrimoire ✶</span>
            <span className="footer-tagline">{t("app.tagline")}</span>
          </div>

          <div className="footer-links">
            <div className="footer-col">
              <span className="footer-col-title">{t("footer.discoverTitle")}</span>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.browseEditions")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.bookBoxes")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.announcements")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.luckyDraw")}</a>
            </div>

            {user && (
              <div className="footer-col">
                <span className="footer-col-title">{t("footer.accountTitle")}</span>
                <a href="#" className="footer-link" onClick={e => { e.preventDefault(); setTab("collection"); }}>{t("footer.myCollection")}</a>
                <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.mySubscriptions")}</a>
                <a href="#" className="footer-link" onClick={e => { e.preventDefault(); setTab("account"); }}>{t("footer.profileSettings")}</a>
              </div>
            )}

            <div className="footer-col">
              <span className="footer-col-title">{t("footer.helpTitle")}</span>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.faq")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.howItWorks")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.contact")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.reportIssue")}</a>
            </div>

            <div className="footer-col">
              <span className="footer-col-title">{t("footer.legalTitle")}</span>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.privacyPolicy")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.termsOfUse")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.cookiePolicy")}</a>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          &copy; {new Date().getFullYear()} LuxGrimoire — {t("app.footer")}
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <I18nProvider>
          <AppInner />
        </I18nProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
