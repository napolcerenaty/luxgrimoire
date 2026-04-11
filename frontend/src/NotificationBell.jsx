import { useState, useEffect, useRef } from "react";
import { API } from "./api";
import "./NotificationBell.css";

const TYPE_META = {
  INFO:         { icon: "✶", cls: "notif-chip--info" },
  ANNOUNCEMENT: { icon: "✶", cls: "notif-chip--ann"  },
  WARNING:      { icon: "◈", cls: "notif-chip--warn" },
};

function relativeTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs   = now - date;
  const diffMin  = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay  = Math.floor(diffMs / 86400000);
  if (diffMin  < 1)   return "przed chwilą";
  if (diffMin  < 60)  return `${diffMin} min temu`;
  if (diffHour < 24)  return `${diffHour} godz. temu`;
  if (diffDay  === 1) return "wczoraj";
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

export default function NotificationBell({ onOpenPage, refreshKey = 0 }) {
  const [count, setCount]                 = useState(0);
  const [open, setOpen]                   = useState(false);
  const [notifications, setNotifications] = useState([]);
  const ref = useRef(null);

  const fetchCount = () =>
    fetch(API.NOTIFICATIONS_UNREAD_COUNT, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => setCount(d.count))
      .catch(() => {});

  const fetchNotifs = () =>
    fetch(API.NOTIFICATIONS, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setNotifications(Array.isArray(d) ? d : []))
      .catch(() => {});

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  const handleOpen = () => {
    if (!open) fetchNotifs();
    setOpen((o) => !o);
  };

  const handleItemClick = (n) => {
    // Mark as read then go to full page
    if (!n.readAt) {
      fetch(API.NOTIFICATION_READ(n.id), { method: "POST", credentials: "include" });
      setCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    onOpenPage();
  };

  const markAllRead = (e) => {
    e.stopPropagation();
    fetch(API.NOTIFICATIONS_READ_ALL, { method: "POST", credentials: "include" });
    setNotifications((n) => n.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
    setCount(0);
  };

  const goToPage = (e) => {
    e.stopPropagation();
    setOpen(false);
    onOpenPage();
  };

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button
        className={`notif-bell-btn${count > 0 ? " notif-bell-btn--active" : ""}`}
        onClick={handleOpen}
        title="Powiadomienia"
        aria-label={`Powiadomienia${count > 0 ? ` (${count} nieprzeczytanych)` : ""}`}
      >
        {/* SVG bell styled to match site */}
        <svg className="notif-bell-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5.5 17.5H18.5C18.5 17.5 17 15.5 17 10.5C17 7.186 14.761 4.5 12 4.5C9.239 4.5 7 7.186 7 10.5C7 15.5 5.5 17.5 5.5 17.5Z" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M10 17.5C10 18.6046 10.8954 19.5 12 19.5C13.1046 19.5 14 18.6046 14 17.5"/>
          <line x1="12" y1="2" x2="12" y2="4.5" strokeLinecap="round"/>
        </svg>
        {count > 0 && (
          <span className="notif-bell-badge">{count > 99 ? "99+" : count}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span className="notif-panel-title">Powiadomienia</span>
            <div className="notif-panel-actions">
              {notifications.some((n) => !n.readAt) && (
                <button className="notif-mark-all-btn" onClick={markAllRead}>
                  Oznacz wszystkie
                </button>
              )}
              <button className="notif-view-all-btn" onClick={goToPage}>
                Pokaż wszystkie →
              </button>
            </div>
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">
                <span className="notif-empty-icon">✶</span>
                Brak powiadomień
              </div>
            ) : (
              notifications.slice(0, 6).map((n) => {
                const meta = TYPE_META[n.type] || TYPE_META.INFO;
                return (
                  <div
                    key={n.id}
                    className={`notif-item${!n.readAt ? " notif-item--unread" : ""}`}
                    onClick={() => handleItemClick(n)}
                  >
                    <span className={`notif-chip ${meta.cls}`}>{meta.icon}</span>
                    <div className="notif-item-body">
                      <div className="notif-item-title">{n.title}</div>
                      <div className="notif-item-msg">{n.message}</div>
                      <div className="notif-item-time">{relativeTime(n.createdAt)}</div>
                    </div>
                    {!n.readAt && <div className="notif-unread-dot" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

