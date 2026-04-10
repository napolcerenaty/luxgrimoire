import { useRef, useState, useEffect } from "react";
import "./RecentAnnouncements.css";

const DEMO_ANNOUNCEMENTS = [
  {
    id: "1",
    title: "The Name of the Wind",
    editionName: "10th Anniversary Edition",
    generalSaleDate: "2026-05-15",
    company: "OwlCrate",
    imageUrl: "https://placehold.co/280x420/071428/38d4f0?text=The+Name+%0Aof+the+Wind",
  },
  {
    id: "2",
    title: "A Court of Thorns and Roses",
    editionName: "Collector's Deluxe Edition",
    generalSaleDate: "2026-04-30",
    company: "FairyLoot",
    imageUrl: "https://placehold.co/280x420/180a2e/d4a0f0?text=ACOTAR%0ACollector's",
  },
  {
    id: "3",
    title: "The Way of Kings",
    editionName: "Leatherbound Illustrated",
    generalSaleDate: "2026-06-01",
    company: "Illumicrate",
    imageUrl: "https://placehold.co/280x420/071e12/40f090?text=The+Way%0Aof+Kings",
  },
  {
    id: "4",
    title: "Six of Crows",
    editionName: "Limited Special Edition",
    generalSaleDate: "2026-04-25",
    company: "LitJoy Crate",
    imageUrl: "https://placehold.co/280x420/1e0810/f05080?text=Six+of%0ACrows",
  },
  {
    id: "5",
    title: "Mistborn: The Final Empire",
    editionName: "Anniversary Hardcover",
    generalSaleDate: "2026-05-05",
    company: "Bookish Box",
    imageUrl: "https://placehold.co/280x420/141018/b070f8?text=Mistborn%0AThe+Final+Empire",
  },
  {
    id: "6",
    title: "The Priory of the Orange Tree",
    editionName: "Deluxe Illustrated Edition",
    generalSaleDate: "2026-07-10",
    company: "OwlCrate",
    imageUrl: "https://placehold.co/280x420/1e100a/f08840?text=Priory+of%0Athe+Orange+Tree",
  },
  {
    id: "7",
    title: "Fourth Wing",
    editionName: "Signed Collector's Edition",
    generalSaleDate: "2026-06-20",
    company: "FairyLoot",
    imageUrl: "https://placehold.co/280x420/0e0e20/8890f8?text=Fourth%0AWing",
  },
];

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(dateStr) {
  const diff = new Date(dateStr) - new Date();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return null;
  if (days === 0) return "Today!";
  if (days === 1) return "Tomorrow";
  return `in ${days} days`;
}

export default function RecentAnnouncements() {
  const scrollRef = useRef(null);
  const [selected, setSelected] = useState(null);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector(".announcement-card");
    const gap = 16;
    const step = (card ? card.offsetWidth + gap : 280) * 2;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  // Close modal on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <section className="announcements">
      <div className="announcements-header">
        <h2 className="announcements-title">✦ Recent Announcements ✦</h2>
        <p className="announcements-subtitle">Upcoming special editions — not yet on sale</p>
      </div>

      <div className="announcements-wrapper">
        <button className="carousel-arrow carousel-arrow--left" onClick={() => scroll(-1)} aria-label="Previous">
          ‹
        </button>

        <div className="announcements-carousel" ref={scrollRef}>
          {DEMO_ANNOUNCEMENTS.map((item) => {
            const countdown = daysUntil(item.generalSaleDate);
            return (
              <article
                key={item.id}
                className="announcement-card"
                onClick={() => setSelected(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setSelected(item)}
              >
                <div className="announcement-img-wrap">
                  <img
                    className="announcement-img"
                    src={item.imageUrl}
                    alt={item.title}
                    onError={(e) => {
                      e.target.src = "https://placehold.co/280x420/071428/38d4f0?text=No+Cover";
                    }}
                  />
                  <div className="announcement-ribbon">{item.company}</div>
                  {countdown && (
                    <div className="announcement-countdown">{countdown}</div>
                  )}
                </div>
                <div className="announcement-info">
                  <p className="announcement-edition">{item.editionName}</p>
                  <h3 className="announcement-title-text">{item.title}</h3>
                  <p className="announcement-date">
                    <span className="announcement-date-label">On sale</span>
                    {formatDate(item.generalSaleDate)}
                  </p>
                </div>
              </article>
            );
          })}
        </div>

        <button className="carousel-arrow carousel-arrow--right" onClick={() => scroll(1)} aria-label="Next">
          ›
        </button>
      </div>

      {/* Edition detail modal */}
      {selected && (
        <div className="ann-modal-overlay" onClick={() => setSelected(null)}>
          <div className="ann-modal" onClick={(e) => e.stopPropagation()}>
            <button className="ann-modal-close" onClick={() => setSelected(null)} aria-label="Close">✕</button>
            <div className="ann-modal-body">
              <div className="ann-modal-cover-wrap">
                <img
                  className="ann-modal-cover"
                  src={selected.imageUrl}
                  alt={selected.title}
                  onError={(e) => { e.target.src = "https://placehold.co/280x420/071428/38d4f0?text=No+Cover"; }}
                />
                <div className="ann-modal-ribbon">{selected.company}</div>
              </div>
              <div className="ann-modal-info">
                <p className="ann-modal-edition">{selected.editionName}</p>
                <h2 className="ann-modal-title">{selected.title}</h2>
                <div className="ann-modal-divider" />
                <div className="ann-modal-meta">
                  <div className="ann-modal-meta-row">
                    <span className="ann-modal-meta-label">Publisher</span>
                    <span className="ann-modal-meta-value">{selected.company}</span>
                  </div>
                  <div className="ann-modal-meta-row">
                    <span className="ann-modal-meta-label">On Sale</span>
                    <span className="ann-modal-meta-value">{formatDate(selected.generalSaleDate)}</span>
                  </div>
                  {daysUntil(selected.generalSaleDate) && (
                    <div className="ann-modal-meta-row">
                      <span className="ann-modal-meta-label">Countdown</span>
                      <span className="ann-modal-meta-value ann-modal-countdown">
                        {daysUntil(selected.generalSaleDate)}
                      </span>
                    </div>
                  )}
                </div>
                <p className="ann-modal-note">
                  ✦ This is a demo announcement. Once linked to a real edition, full details will appear here.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
