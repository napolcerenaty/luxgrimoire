import { useState, useEffect } from "react";
import { API } from "./api";
import "./NotificationsPage.css";

const TYPE_META = {
  INFO:         { icon: "✶", label: "Informacja",   cls: "notif-type--info"   },
  ANNOUNCEMENT: { icon: "✶", label: "Ogłoszenie",   cls: "notif-type--ann"    },
  WARNING:      { icon: "◈", label: "Ostrzeżenie",  cls: "notif-type--warn"   },
};

function relativeTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now   = new Date();
  const diffMs   = now - date;
  const diffMin  = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay  = Math.floor(diffMs / 86400000);
  if (diffMin  < 1)  return "przed chwilą";
  if (diffMin  < 60) return `${diffMin} min temu`;
  if (diffHour < 24) return `${diffHour} godz. temu`;
  if (diffDay  === 1) return "wczoraj";
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

export default function NotificationsPage({ onBack, onRead }) {
  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [expanded,      setExpanded]      = useState(null);

  useEffect(() => {
    fetch(API.NOTIFICATIONS, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setNotifications(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const markRead = (id) => {
    setExpanded(e => (e === id ? null : id));
    setNotifications(prev => {
      const already = prev.find(n => n.id === id)?.readAt;
      if (already) return prev;
      fetch(API.NOTIFICATION_READ(id), { method: "POST", credentials: "include" });
      if (onRead) onRead();
      return prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n);
    });
  };

  const markAllRead = () => {
    fetch(API.NOTIFICATIONS_READ_ALL, { method: "POST", credentials: "include" });
    setNotifications(prev => prev.map(n => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    if (onRead) onRead();
  };

  const unreadCount = notifications.filter(n => !n.readAt).length;

  return (
    <div className="notif-page">
      <div className="notif-page-header">
        <button className="notif-page-back" onClick={onBack}>← Wróć</button>
        <h1 className="notif-page-title">✶ Powiadomienia</h1>
        {unreadCount > 0 && (
          <button className="notif-page-mark-all" onClick={markAllRead}>
            Oznacz wszystkie jako przeczytane ({unreadCount})
          </button>
        )}
      </div>

      {loading ? (
        <div className="notif-page-empty">
          <div className="spinner" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="notif-page-empty">
          <span className="notif-page-empty-icon">✶</span>
          <p>Brak powiadomień</p>
        </div>
      ) : (
        <div className="notif-page-list">
          {notifications.map(n => {
            const meta = TYPE_META[n.type] || TYPE_META.INFO;
            const isOpen = expanded === n.id;
            return (
              <article
                key={n.id}
                className={`notif-card${!n.readAt ? " notif-card--unread" : ""}${isOpen ? " notif-card--open" : ""}`}
                onClick={() => markRead(n.id)}
              >
                <div className={`notif-card-type ${meta.cls}`}>
                  <span className="notif-card-type-icon">{meta.icon}</span>
                  <span className="notif-card-type-label">{meta.label}</span>
                </div>

                <div className="notif-card-body">
                  <div className="notif-card-top">
                    <h2 className="notif-card-title">{n.title}</h2>
                    <span className="notif-card-time">{relativeTime(n.createdAt)}</span>
                  </div>
                  <p className={`notif-card-msg${isOpen ? " notif-card-msg--open" : ""}`}>{n.message}</p>
                  {!isOpen && n.message?.length > 120 && (
                    <span className="notif-card-expand">Czytaj więcej ▾</span>
                  )}
                </div>

                {!n.readAt && <div className="notif-card-dot" />}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
