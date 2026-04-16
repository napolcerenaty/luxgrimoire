import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";

const FALLBACK = "https://placehold.co/300x450/060d18/00b4d0?text=No+Cover";
const CYCLE_INTERVAL = 1500;

export default function BookCard({ book, onClick }) {
  // One representative image per edition (+ book coverUrl), deduplicated
  const images = [...new Set([
    ...(book.coverUrl ? [book.coverUrl] : []),
    ...(book.editions?.map((e) => e.imageUrls?.[0]).filter(Boolean) || []),
  ])];

  if (images.length === 0) images.push(FALLBACK);

  const [hovered, setHovered] = useState(false);
  const [index, setIndex] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (hovered && images.length > 1) {
      timerRef.current = setInterval(() => {
        setIndex((i) => (i + 1) % images.length);
      }, CYCLE_INTERVAL);
    } else {
      clearInterval(timerRef.current);
      if (!hovered) setIndex(0);
    }
    return () => clearInterval(timerRef.current);
  }, [hovered, images.length]);

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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="book-cover">
        {/* On hover render all edition covers stacked; otherwise only the primary */}
        {(hovered ? images : [images[0]]).map((src, i) => (
          <img
            key={src}
            src={src}
            alt={i === 0 ? `Cover of ${book.title}` : ""}
            className={(!hovered || i === index) ? "active" : ""}
            onError={(e) => { e.target.src = FALLBACK; }}
          />
        ))}
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
