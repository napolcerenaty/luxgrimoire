import { useState, useEffect } from "react";
import "./App.css";

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
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("http://localhost:8080/api/books")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
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
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1 className="header-title">✦ LuxGrimoire ✦</h1>
        <p className="header-subtitle">A curated collection of extraordinary books</p>
      </header>

      <main>
        {loading ? (
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
        )}
      </main>

      <footer className="footer">
        &copy; {new Date().getFullYear()} LuxGrimoire — All rights reserved
      </footer>
    </div>
  );
}

export default App;
