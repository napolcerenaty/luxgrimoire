import { useState, useEffect } from "react";
import "./App.css";
import CollectionPage from "./CollectionPage";
import { AuthProvider } from "./AuthContext";
import UserMenu from "./UserMenu";
import ProfilePage from "./ProfilePage";
import SettingsPage from "./SettingsPage";

function BookCard({ book }) {
  return (
    <article className="book-card">
      <div className="book-cover">
        <img
          src={book.imageUrl}
          alt={`Cover of ${book.title}`}
          onError={(e) => {
            e.target.src = "https://placehold.co/300x450/1c1208/c4943d?text=No+Cover";
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

function App() {
  const [tab, setTab] = useState("browse");
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  return (
    <AuthProvider>
      <div className="app">
        <header className="header">
          <div className="header-user-area">
            <UserMenu onNavigate={setTab} />
          </div>
          <h1 className="header-title">✦ LuxGrimoire ✦</h1>
          <p className="header-subtitle">A curated collection of extraordinary books</p>
          {!isUserPage && (
            <nav className="nav-tabs">
              <button
                className={`nav-tab${tab === "browse" ? " active" : ""}`}
                onClick={() => setTab("browse")}
              >
                📚 Przeglądaj
              </button>
              <button
                className={`nav-tab${tab === "collection" ? " active" : ""}`}
                onClick={() => setTab("collection")}
              >
                📋 Moja kolekcja
              </button>
            </nav>
          )}
        </header>

        <main>
          {tab === "browse" && (
            loading ? (
              <div className="status-container">
                <div className="spinner" />
                <span>Loading the collection…</span>
              </div>
            ) : error ? (
              <div className="status-container">
                <p className="error-text">⚠ Could not load books: {error}</p>
                <p>Make sure the Spring Boot backend is running on port 8080.</p>
              </div>
            ) : (
              <>
                <h2 className="section-title">Our Collection</h2>
                <div className="book-grid">
                  {books.map((book) => (
                    <BookCard key={book.id} book={book} />
                  ))}
                </div>
              </>
            )
          )}
          {tab === "collection" && <CollectionPage />}
          {tab === "profile"    && <ProfilePage  onBack={() => setTab("browse")} />}
          {tab === "settings"   && <SettingsPage onBack={() => setTab("browse")} />}
        </main>

        <footer className="footer">
          &copy; {new Date().getFullYear()} LuxGrimoire — All rights reserved
        </footer>
      </div>
    </AuthProvider>
  );
}

export default App;
