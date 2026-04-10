import { useState, useEffect, useCallback } from "react";
import { useI18n } from "./i18n";
import "./BookCarousel.css";

const PLACEHOLDER = "https://placehold.co/400x600/060d18/00b4d0?text=No+Image";

export default function BookCarousel({ images }) {
  const { t } = useI18n();
  const list = images && images.length > 0 ? images : [PLACEHOLDER];
  const [currentIndex, setCurrentIndex] = useState(0);

  const prev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const next = useCallback(() => {
    setCurrentIndex((i) => Math.min(list.length - 1, i + 1));
  }, [list.length]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prev, next]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [images]);

  const showButtons = list.length > 1;

  return (
    <div className="carousel-wrapper">
      <div className="carousel-image-area">
        {showButtons && (
          <button
            className="carousel-btn carousel-prev"
            onClick={prev}
            disabled={currentIndex === 0}
            aria-label={t("carousel.prev")}
          >
            &#8249;
          </button>
        )}
        <img
          className="carousel-image"
          src={list[currentIndex]}
          alt={t("carousel.image", { n: currentIndex + 1 })}
          onError={(e) => { e.target.src = PLACEHOLDER; }}
        />
        {showButtons && (
          <button
            className="carousel-btn carousel-next"
            onClick={next}
            disabled={currentIndex === list.length - 1}
            aria-label={t("carousel.next")}
          >
            &#8250;
          </button>
        )}
      </div>
      {showButtons && (
        <div className="carousel-dots">
          {list.map((_, i) => (
            <button
              key={i}
              className={`carousel-dot${i === currentIndex ? " active" : ""}`}
              onClick={() => setCurrentIndex(i)}
              aria-label={t("carousel.goToImage", { n: i + 1 })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
