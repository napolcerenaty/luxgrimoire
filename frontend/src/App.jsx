import { useState, useEffect } from "react";
import "./App.css";
import "./ReportModals.css";
import CollectionPage from "./CollectionPage";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./AuthContext";
import UserMenu from "./UserMenu";
import AccountPage, { CalendarSection, BookListSection, SubscriptionsSection, SettingsSection } from "./AccountPage";
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
import AllAnnouncementsPage from "./AllAnnouncementsPage";
import AdminPage from "./AdminPage";
import NotificationsPage from "./NotificationsPage";
import NotificationBell from "./NotificationBell";
import FriendsPage from "./FriendsPage";
import MessagesPage from "./MessagesPage";
import { API } from "./api";
import BugReportModal from "./BugReportModal";
import DataRequestModal from "./DataRequestModal";
import FaqPage from "./FaqPage";
import PublicProfilePage from "./PublicProfilePage";
import SubscriptionDetailPage from "./SubscriptionDetailPage";
import StaticPage from "./StaticPage";
import FavoritesPage from "./FavoritesPage";
import SpendingStatsPage from "./SpendingStatsPage";

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
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const [messageTargetUser, setMessageTargetUser] = useState(null);
  const [publicProfileUsername, setPublicProfileUsername] = useState(null);

  const [prevTab, setPrevTab] = useState("browse");
  const [notifRefreshKey, setNotifRefreshKey] = useState(0);
  const [msgRefreshKey, setMsgRefreshKey] = useState(0);
  // Subscription month context when a book is opened from a subscription month card
  // Shape: { month: number (1-12), year: number, renewalDay: number|null } or null
  const [subMonthContext, setSubMonthContext] = useState(null);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [dataRequestOpen, setDataRequestOpen] = useState(false);
  const [devBannerDismissed, setDevBannerDismissed] = useState(() => sessionStorage.getItem("devBannerDismissed") === "1");

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

  // Navigate with browser history support
  const navigate = (newTab, opts = {}) => {
    const newState = {
      tab: newTab,
      selectedBookId: opts.selectedBookId !== undefined ? opts.selectedBookId : selectedBookId,
      selectedCompany: opts.selectedCompany !== undefined ? opts.selectedCompany : selectedCompany,
      selectedAuthorId: opts.selectedAuthorId !== undefined ? opts.selectedAuthorId : selectedAuthorId,
      selectedArtistId: opts.selectedArtistId !== undefined ? opts.selectedArtistId : selectedArtistId,
      selectedSeriesBookId: opts.selectedSeriesBookId !== undefined ? opts.selectedSeriesBookId : selectedSeriesBookId,
      selectedSubscription: opts.selectedSubscription !== undefined ? opts.selectedSubscription : selectedSubscription,
      publicProfileUsername: opts.publicProfileUsername !== undefined ? opts.publicProfileUsername : publicProfileUsername,
      prevTab: opts.prevTab !== undefined ? opts.prevTab : prevTab,
      messageTargetUser: opts.messageTargetUser !== undefined ? opts.messageTargetUser : messageTargetUser,
      subMonthContext: opts.subMonthContext !== undefined ? opts.subMonthContext : subMonthContext,
    };
    if (opts.selectedBookId !== undefined) setSelectedBookId(opts.selectedBookId);
    if (opts.selectedCompany !== undefined) setSelectedCompany(opts.selectedCompany);
    if (opts.selectedAuthorId !== undefined) setSelectedAuthorId(opts.selectedAuthorId);
    if (opts.selectedArtistId !== undefined) setSelectedArtistId(opts.selectedArtistId);
    if (opts.selectedSeriesBookId !== undefined) setSelectedSeriesBookId(opts.selectedSeriesBookId);
    if (opts.selectedSubscription !== undefined) setSelectedSubscription(opts.selectedSubscription);
    if (opts.publicProfileUsername !== undefined) setPublicProfileUsername(opts.publicProfileUsername);
    if (opts.prevTab !== undefined) setPrevTab(opts.prevTab);
    if (opts.messageTargetUser !== undefined) setMessageTargetUser(opts.messageTargetUser);
    if (opts.editingBook !== undefined) setEditingBook(opts.editingBook);
    if (opts.editingEdition !== undefined) setEditingEdition(opts.editingEdition);
    if (opts.editingCompany !== undefined) setEditingCompany(opts.editingCompany);
    if (opts.subMonthContext !== undefined) setSubMonthContext(opts.subMonthContext);
    setTab(newTab);
    history.pushState(newState, "");
  };

  useEffect(() => {
    history.replaceState({ tab: "browse" }, "");
    const onPop = (e) => {
      if (!e.state) return;
      const s = e.state;
      setTab(s.tab || "browse");
      if (s.selectedBookId !== undefined) setSelectedBookId(s.selectedBookId);
      if (s.selectedCompany !== undefined) setSelectedCompany(s.selectedCompany);
      if (s.selectedAuthorId !== undefined) setSelectedAuthorId(s.selectedAuthorId);
      if (s.selectedArtistId !== undefined) setSelectedArtistId(s.selectedArtistId);
      if (s.selectedSeriesBookId !== undefined) setSelectedSeriesBookId(s.selectedSeriesBookId);
      if (s.selectedSubscription !== undefined) setSelectedSubscription(s.selectedSubscription);
      if (s.publicProfileUsername !== undefined) setPublicProfileUsername(s.publicProfileUsername);
      if (s.prevTab !== undefined) setPrevTab(s.prevTab);
      if (s.messageTargetUser !== undefined) setMessageTargetUser(s.messageTargetUser);
      if (s.subMonthContext !== undefined) setSubMonthContext(s.subMonthContext);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const handleBookClick = (bookId, subCtx = null) => {
    setEditingBook(null);
    navigate("book-detail", { selectedBookId: bookId, prevTab: tab !== "book-detail" ? tab : prevTab, subMonthContext: subCtx });
  };
  const handleEditBook = (book) => { setEditingBook(book); setEditingEdition(null); setTab("book-edit"); };
  const handleEditEdition = (book, edition) => { setEditingBook(book); setEditingEdition(edition); setTab("book-edit"); };
  const handleNewEdition = (book) => { setEditingBook(book); setEditingEdition("new"); setTab("book-edit"); };
  const handleNewBook = () => { setEditingBook(null); setEditingEdition(null); setTab("book-edit"); };
  const handleBookSaved = (saved) => { setSelectedBookId(saved.id); setEditingBook(null); setEditingEdition(null); setTab("book-detail"); };
  const handleSeriesClick = (bookId) => { navigate("series-books", { selectedSeriesBookId: bookId, prevTab: tab }); };

  const handleCompanyClick = (company) => { navigate("company-detail", { selectedCompany: company }); };
  const handleAuthorClick = (authorId) => { navigate("author-detail", { selectedAuthorId: authorId, prevTab: tab }); };
  const handleArtistClick = (artistId) => { navigate("artist-detail", { selectedArtistId: artistId, prevTab: tab }); };
  const handleNewCompany = () => { setEditingCompany(null); setTab("company-edit"); };
  const handleEditCompany = (company) => { setEditingCompany(company); setTab("company-edit"); };
  const handleCompanySaved = (saved) => { setSelectedCompany(saved); setTab("company-detail"); };

  const handleSubscriptionClick = ({ companyId, subscriptionId }) => {
    navigate("subscription-detail", { selectedSubscription: { companyId, subscriptionId }, prevTab: tab !== "subscription-detail" ? tab : prevTab });
  };

  useEffect(() => {
    fetch(API.BOOKS + "?page=0&size=100")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
        return res.json();
      })
      .then((data) => { setBooks(data.content ?? data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  const isDetailPage = tab === "book-detail" || tab === "book-edit" || tab === "company-detail" || tab === "company-edit" || tab === "author-detail" || tab === "artist-detail" || tab === "series-books" || tab === "faq" || tab === "privacy" || tab === "terms" || tab === "subscription-detail";

  // Library tabs = any account section rendered inside AccountPage
  const LIBRARY_SECTIONS = ["calendar","collection","iso","interested","subscriptions","favorites","spending","settings","sold","library"];
  const COMMUNITY_SECTIONS = ["friends","messages","community"];
  const isLibraryTab   = LIBRARY_SECTIONS.includes(tab);
  const isCommunityTab = COMMUNITY_SECTIONS.includes(tab);
  // Which section should AccountPage open to
  const librarySection = isLibraryTab && tab !== "library" ? tab : "collection";

  // Community sub-tab state (friends / messages)
  const communitySubTab = tab === "messages" ? "messages" : "friends";

  const navActiveTab = (() => {
    if (["company-detail", "company-edit", "subscription-detail"].includes(tab)) return "company-list";
    if (LIBRARY_SECTIONS.includes(tab)) return "library";
    if (COMMUNITY_SECTIONS.includes(tab)) return "community";
    return tab;
  })();

  return (
    <div className="app">
      {!devBannerDismissed && (
        <div className="dev-banner">
          <span className="dev-banner-text">
            {t("devBanner.text")}{" "}
            <button className="dev-banner-link" onClick={() => setBugReportOpen(true)}>
              {t("devBanner.link")}
            </button>
          </span>
          <button className="dev-banner-dismiss" onClick={() => {
            sessionStorage.setItem("devBannerDismissed", "1");
            setDevBannerDismissed(true);
          }} title={t("devBanner.dismiss")}>✕</button>
        </div>
      )}

      <div className="app-header-wrap">
        <header className="header">
          <h1
            className="header-logo"
            onClick={() => navigate("browse")}
            title="LuxGrimoire – Strona główna"
          >LuxGrimoire</h1>
          <SearchPanel
            compact
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
            onRequestData={() => setDataRequestOpen(true)}
            onSubscriptionClick={handleSubscriptionClick}
          />
          <div className="header-controls">
            {user && <NotificationBell onOpenPage={() => navigate("notifications")} refreshKey={notifRefreshKey} />}
            <ThemePicker />
            <LanguagePicker />
            <UserMenu onNavigate={(t) => navigate(t)} msgRefreshKey={msgRefreshKey} />
          </div>
        </header>

        <nav className="main-nav">
          <button
            className={`main-nav-item${navActiveTab === "browse" ? " active" : ""}`}
            onClick={() => navigate("browse")}
          >
            {t("nav.discover")}
          </button>
          <button
            className={`main-nav-item${navActiveTab === "company-list" ? " active" : ""}`}
            onClick={() => navigate("company-list")}
          >
            {t("nav.bookBoxes")}
          </button>
          {user && (
            <button
              className={`main-nav-item${navActiveTab === "library" ? " active" : ""}`}
              onClick={() => navigate("library")}
            >
              {t("nav.library")}
            </button>
          )}
          {user && (
            <button
              className={`main-nav-item${navActiveTab === "community" ? " active" : ""}`}
              onClick={() => navigate("friends")}
            >
              {t("nav.community")}
            </button>
          )}
          {user && (
            user.role === "admin" || user.role === "superadmin" ||
            user.role === "moderator" || user.role === "company_manager" ||
            (user.adminPermissions && user.adminPermissions.trim().length > 0)
          ) && (
            <button
              className={`main-nav-item admin-nav-item${tab === "admin" ? " active" : ""}`}
              onClick={() => navigate("admin")}
            >
              {t("nav.admin")}
            </button>
          )}
        </nav>
      </div>

      {!isDetailPage && tab !== "admin" && !isLibraryTab && !isCommunityTab && (
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
          onRequestData={() => setDataRequestOpen(true)}
          onSubscriptionClick={handleSubscriptionClick}
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
              <RecentAnnouncements onSeeMore={() => navigate("all-announcements", { prevTab: "browse" })} />
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
        {isLibraryTab && (
          <AccountPage
            key={librarySection}
            initialSection={librarySection}
            onBack={() => setTab("browse")}
            onBookClick={handleBookClick}
            onSectionChange={(s) => setTab(s)}
          />
        )}
        {isCommunityTab && (
          <div className="account-page">
            <aside className="account-sidebar">
              <div className="account-user-badge">
                <div className="account-avatar">
                  <span className="account-avatar-initials">
                    {[user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?"}
                  </span>
                </div>
                <div className="account-user-text">
                  <p className="account-display-name">{user?.firstName} {user?.lastName}</p>
                  <p className="account-username">@{user?.username}</p>
                </div>
              </div>
              <nav className="account-nav">
                <button className={`account-nav-item${communitySubTab === "friends" ? " active" : ""}`} onClick={() => setTab("friends")}>
                  <span className="account-nav-icon">👥</span>
                  <span className="account-nav-label">{t("friends.title")}</span>
                  <span className="account-nav-arrow">›</span>
                </button>
                <button className={`account-nav-item${communitySubTab === "messages" ? " active" : ""}`} onClick={() => setTab("messages")}>
                  <span className="account-nav-icon">💬</span>
                  <span className="account-nav-label">{t("messages.title")}</span>
                  <span className="account-nav-arrow">›</span>
                </button>
              </nav>
              <button className="account-back-site-btn" onClick={() => setTab("browse")}>
                {t("account.backToSite")}
              </button>
            </aside>
            <main className="account-content">
              {communitySubTab === "friends" && (
                <FriendsPage
                  onBack={() => setTab("browse")}
                  onMessage={(username) => { setMessageTargetUser(username); setTab("messages"); }}
                  onViewProfile={(username) => { setPublicProfileUsername(username); setTab("public-profile"); }}
                />
              )}
              {communitySubTab === "messages" && (
                <MessagesPage
                  onBack={() => { setMessageTargetUser(null); setMsgRefreshKey(k => k + 1); setTab("browse"); }}
                  initialUsername={messageTargetUser}
                  currentUsername={user?.username}
                  onRead={() => setMsgRefreshKey(k => k + 1)}
                />
              )}
            </main>
          </div>
        )}
        {tab === "admin" && <AdminPage onBack={() => { window.location.hash = ""; setTab("browse"); }} />}
        {tab === "all-announcements" && (
          <AllAnnouncementsPage onBack={() => navigate(prevTab || "browse")} />
        )}
        {tab === "notifications" && <NotificationsPage onBack={() => setTab("browse")} onRead={() => setNotifRefreshKey(k => k + 1)} onNavigate={(target) => setTab(target)} />}
        {tab === "company-list" && (
          <CompanyListPage
            onCompanyClick={handleCompanyClick}
            onNewCompany={handleNewCompany}
            onRequestData={() => setDataRequestOpen(true)}
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
            onSubscriptionClick={handleSubscriptionClick}
          />
        )}
        {tab === "subscription-detail" && selectedSubscription && (
          <SubscriptionDetailPage
            companyId={selectedSubscription.companyId}
            subscriptionId={selectedSubscription.subscriptionId}
            onBack={() => setTab(prevTab)}
            onCompanyClick={(company) => { setSelectedCompany(company); setTab("company-detail"); }}
            onBookClick={handleBookClick}
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
             subMonthContext={subMonthContext}
             onBack={() => setTab(prevTab)}
             onEdit={handleEditBook}
             onEditEdition={handleEditEdition}
             onNewEdition={handleNewEdition}
             onNavigateNew={handleNewBook}
             onCompanyClick={handleCompanyClick}
             onSeriesClick={handleSeriesClick}
             onArtistClick={handleArtistClick}
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
        {tab === "faq" && (
          <FaqPage onBack={() => setTab("browse")} />
        )}
        {tab === "privacy" && (
          <StaticPage
            pageKey="privacy_policy"
            titleKey="footer.privacyPolicy"
            onBack={() => setTab("browse")}
          />
        )}
        {tab === "terms" && (
          <StaticPage
            pageKey="terms_of_use"
            titleKey="footer.termsOfUse"
            onBack={() => setTab("browse")}
          />
        )}
        {tab === "public-profile" && publicProfileUsername && (
          <PublicProfilePage
            username={publicProfileUsername}
            onBack={() => setTab(prevTab)}
          />
        )}
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="footer-logo">LuxGrimoire</span>
            <span className="footer-tagline">{t("app.tagline")}</span>
          </div>

          <div className="footer-links">
            <div className="footer-col">
              <span className="footer-col-title">{t("footer.discoverTitle")}</span>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.browseEditions")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); setTab("company-list"); }}>{t("footer.bookBoxes")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.announcements")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.luckyDraw")}</a>
            </div>

            {user && (
              <div className="footer-col">
                <span className="footer-col-title">{t("footer.accountTitle")}</span>
                <a href="#" className="footer-link" onClick={e => { e.preventDefault(); setTab("collection"); }}>{t("footer.myCollection")}</a>
                <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.mySubscriptions")}</a>
                <a href="#" className="footer-link" onClick={e => { e.preventDefault(); setTab("settings"); }}>{t("footer.profileSettings")}</a>
              </div>
            )}

            <div className="footer-col">
              <span className="footer-col-title">{t("footer.helpTitle")}</span>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); setTab("faq"); }}>{t("footer.faq")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.howItWorks")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.contact")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); setBugReportOpen(true); }}>{t("footer.reportIssue")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); setDataRequestOpen(true); }}>{t("footer.requestData")}</a>
            </div>

            <div className="footer-col">
              <span className="footer-col-title">{t("footer.legalTitle")}</span>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); setTab("privacy"); }}>{t("footer.privacyPolicy")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); setTab("terms"); }}>{t("footer.termsOfUse")}</a>
              <a href="#" className="footer-link" onClick={e => { e.preventDefault(); }}>{t("footer.cookiePolicy")}</a>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          &copy; {new Date().getFullYear()} LuxGrimoire — {t("app.footer")}
        </div>
      </footer>

      <button
        className="floating-bug-btn"
        onClick={() => setBugReportOpen(true)}
        title={t("report.bugTitle")}
      >
        <span className="floating-bug-btn-icon">🐛</span>
        <span className="floating-bug-btn-text">{t("report.floatingBtnLabel")}</span>
      </button>

      {bugReportOpen && <BugReportModal onClose={() => setBugReportOpen(false)} />}
      {dataRequestOpen && <DataRequestModal onClose={() => setDataRequestOpen(false)} />}
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
