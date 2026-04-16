import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { assetUrl } from "./api";

const FALLBACK = "https://placehold.co/300x450/060d18/00b4d0?text=No+Cover";
const CYCLE_INTERVAL = 1500;

export default function BookCard({ book, onClick }) {
  const images = [...new Set([
    ...(book.coverUrl ? [assetUrl(book.coverUrl)] : []),
    ...(book.editions?.map((e) => assetUrl(e.imageUrls?.[0])).filter(Boolean) || []),
  ])];

  if (images.length === 0) images.push(FALLBACK);

  const [index, setIndex] = useState(0);
  const timerRef = useRef(null);

  const handleMouseEnter = () => {
    if (images.length <= 1) return;
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, CYCLE_INTERVAL);
  };

  const handleMouseLeave = () => {
    clearInterval(timerRef.current);
    setIndex(0);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

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
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="book-cover">
        <img
          src={images[index]}
          alt={`Cover of ${book.title}`}
          onError={(e) => { e.target.src = FALLBACK; }}
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
    coverUrl: PropTypes.string,
    seriesName: PropTypes.string,
    volumeNumber: PropTypes.string,
    editions: PropTypes.array,
  }).isRequired,
  onClick: PropTypes.func,
};
