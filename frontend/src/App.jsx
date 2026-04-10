import { useState, useEffect } from "react";
import "./App.css";
import CollectionPage from "./CollectionPage";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./AuthContext";
import UserMenu from "./UserMenu";
import ProfilePage from "./ProfilePage";
import SettingsPage from "./SettingsPage";
import { I18nProvider, useI18n } from "./i18n";
import LanguagePicker from "./LanguagePicker";
import BookDetailPage from "./BookDetailPage";
import BookDetailEditPage from "./BookDetailEditPage";
import CompanyListPage from "./CompanyListPage";
import CompanyPage from "./CompanyPage";
import CompanyEditPage from "./CompanyEditPage";

function BookCard({ book, onClick }) {
  return (
    <article
      className={`book-card${onClick ? " book-card--clickable" : ""}`}
      onClick={onClick ? () => onClick(book.title) : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick(book.title) : undefined}
    >
      <div className="book-cover">
        <img
          src={book.imageUrl}
          alt={`Cover of ${book.title}`}
          onError={(e) => {
            e.target.src = "https://placehold.co/300x450/060d18/00b4d0?text=No+Cover";
          }}
        />
        <span className="book-genre-badge">{book.genre}</span>
      </div>
      <div className="book-info">
        <h2 className="book-title">{book.title}</h2>
        <p className="book-author">{book.author}</p>
        <p className="book-description">{book.description}</p>
      </div>
    </article>
  );
}

function AppInner() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [tab, setTab] = useState("browse");
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBookTitle, setSelectedBookTitle] = useState(null);
  const [editingBook, setEditingBook] = useState(null);
  const [editingEdition, setEditingEdition] = useState(null);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [editingCompany, setEditingCompany] = useState(null);

  const [prevTab, setPrevTab] = useState("browse");

  const handleBookClick = (title) => { setSelectedBookTitle(title); setEditingBook(null); setPrevTab(tab); setTab("book-detail"); };
  const handleEditBook = (book) => { setEditingBook(book); setEditingEdition(null); setTab("book-edit"); };
  const handleEditEdition = (book, edition) => { setEditingBook(book); setEditingEdition(edition); setTab("book-edit"); };
  const handleNewEdition = (book) => { setEditingBook(book); setEditingEdition("new"); setTab("book-edit"); };
  const handleNewBook = () => { setEditingBook(null); setEditingEdition(null); setTab("book-edit"); };
  const handleBookSaved = (saved) => { setSelectedBookTitle(saved.title); setEditingBook(null); setEditingEdition(null); setTab("book-detail"); };

  const handleCompanyClick = (company) => { setSelectedCompany(company); setTab("company-detail"); };
  const handleNewCompany = () => { setEditingCompany(null); setTab("company-edit"); };
  const handleEditCompany = (company) => { setEditingCompany(company); setTab("company-edit"); };
  const handleCompanySaved = (saved) => { setSelectedCompany(saved); setTab("company-detail"); };

  useEffect(() => {
    fetch("http://localhost:8080/api/books")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
        return res.json();
      })
      .then((data) => { setBooks(data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  const isUserPage = tab === "profile" || tab === "settings";
  const isDetailPage = tab === "book-detail" || tab === "book-edit" || tab === "company-detail" || tab === "company-edit";

  const filteredBooks = searchQuery.trim()
    ? books.filter((b) => {
        const q = searchQuery.toLowerCase();
        return (
          b.title?.toLowerCase().includes(q) ||
          b.author?.toLowerCase().includes(q) ||
          b.description?.toLowerCase().includes(q)
        );
      })
    : books;

  return (
    <div className="app">
      <header className="header">
        <div className="header-user-area">
          <LanguagePicker />
          <UserMenu onNavigate={setTab} />
        </div>
        <h1
          className="header-title"
          style={{ cursor: "pointer" }}
          onClick={() => { setTab("browse"); setSearchQuery(""); }}
          title="LuxGrimoire – Strona główna"
        >✦ LuxGrimoire ✦</h1>
        <p className="header-subtitle">{t("app.subtitle")}</p>
        {!isUserPage && !isDetailPage && (
          <div className="search-bar-wrap">
            <span className="search-icon">⚲</span>
            <input
              type="text"
              className="search-bar"
              placeholder={t("search.placeholder")}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setTab("browse"); }}
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => setSearchQuery("")} aria-label="Wyczyść">✕</button>
            )}
          </div>
        )}
        {!isUserPage && !isDetailPage && (
          <nav className="nav-tabs">
            <button
              className={`nav-tab${tab === "browse" ? " active" : ""}`}
              onClick={() => setTab("browse")}
            >
              {t("nav.browse")}
            </button>
            <button
              className={`nav-tab${tab === "collection" ? " active" : ""}`}
              onClick={() => setTab("collection")}
            >
              {t("nav.collection")}
            </button>
            <button
              className={`nav-tab${tab === "company-list" ? " active" : ""}`}
              onClick={() => setTab("company-list")}
            >
              {t("nav.companies")}
            </button>
            {user && (
              <button className="new-book-btn" onClick={handleNewBook}>{t("bookDetail.newBtn")}</button>
            )}
          </nav>
        )}
      </header>

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
              <h2 className="section-title">{t("browse.sectionTitle")}</h2>
              {searchQuery.trim() && filteredBooks.length === 0 ? (
                <p className="search-no-results">{t("search.noResults", { q: searchQuery })}</p>
              ) : (
                <div className="book-grid">
                  {filteredBooks.map((book) => (
                    <BookCard key={book.id} book={book} onClick={handleBookClick} />
                  ))}
                </div>
              )}
            </>
          )
        )}
        {tab === "collection" && <CollectionPage onBookClick={handleBookClick} />}
        {tab === "profile"    && <ProfilePage  onBack={() => setTab("browse")} />}
        {tab === "settings"   && <SettingsPage onBack={() => setTab("browse")} />}
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
            bookTitle={selectedBookTitle}
            onBack={() => setTab(prevTab)}
            onEdit={handleEditBook}
            onEditEdition={handleEditEdition}
            onNewEdition={handleNewEdition}
            onNavigateNew={handleNewBook}
            onCompanyClick={handleCompanyClick}
          />
        )}
        {tab === "book-edit" && (
          <BookDetailEditPage
            initialData={editingBook}
            editingEdition={editingEdition}
            onSaved={handleBookSaved}
            onBack={() => { if (editingBook) { setTab("book-detail"); } else { setTab(prevTab); } }}
          />
        )}
      </main>

      <footer className="footer">
        &copy; {new Date().getFullYear()} {t("app.footer")}
      </footer>
    </div>
  );
}

function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </I18nProvider>
  );
}

export default App;
