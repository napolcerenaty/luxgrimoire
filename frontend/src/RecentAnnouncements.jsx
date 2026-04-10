import { useRef } from "react";
import "./RecentAnnouncements.css";

const COMPANY_COLORS = {
  "OwlCrate":    { bg: "#0e4fa8", text: "#e8f4ff" },
  "FairyLoot":   { bg: "#7b2cbf", text: "#f3e8ff" },
  "Illumicrate": { bg: "#0d8a77", text: "#e8fff9" },
  "LitJoy Crate":{ bg: "#b5203a", text: "#ffe8ec" },
  "Bookish Box": { bg: "#a0710a", text: "#fff8e8" },
  "OwlCrate Jr": { bg: "#1a6e3c", text: "#e8fff0" },
};

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

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector(".announcement-card");
    const gap = 16;
    const step = (card ? card.offsetWidth + gap : 280) * 2;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

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
            const colors = COMPANY_COLORS[item.company] || { bg: "#183858", text: "#38d4f0" };
            const countdown = daysUntil(item.generalSaleDate);
            return (
              <article key={item.id} className="announcement-card">
                <div className="announcement-img-wrap">
                  <img
                    className="announcement-img"
                    src={item.imageUrl}
                    alt={item.title}
                    onError={(e) => {
                      e.target.src = "https://placehold.co/280x420/071428/38d4f0?text=No+Cover";
                    }}
                  />
                  <div
                    className="announcement-ribbon"
                    style={{ background: colors.bg, color: colors.text }}
                  >
                    {item.company}
                  </div>
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
    </section>
  );
}
