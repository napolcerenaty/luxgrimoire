import PropTypes from "prop-types";

export default function BookCard({ book, onClick }) {
  const coverUrl =
    book.coverUrl ||
    book.editions?.[0]?.imageUrls?.[0] ||
    "https://placehold.co/300x450/060d18/00b4d0?text=No+Cover";
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
            e.target.src =
              "https://placehold.co/300x450/060d18/00b4d0?text=No+Cover";
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

BookCard.propTypes = {
  book: PropTypes.shape({
    id: PropTypes.string,
    title: PropTypes.string,
    author: PropTypes.string,
    seriesName: PropTypes.string,
    volumeNumber: PropTypes.string,
    editions: PropTypes.array,
  }).isRequired,
  onClick: PropTypes.func,
};
