import { useState, useEffect, useRef } from "react";
import { API } from "./api";
import "./NotificationBell.css";

const TYPE_ICON = { INFO: "ℹ️", ANNOUNCEMENT: "📢", WARNING: "⚠️" };

function relativeTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "przed chwilą";
  if (diffMin < 60) return `${diffMin} min temu`;
  if (diffHour < 24) return `${diffHour} godz. temu`;
  if (diffDay === 1) return "wczoraj";
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [expanded, setExpanded] = useState(null);
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
  }, []);

  const handleOpen = () => {
    if (!open) {
      fetchNotifs();
      setCount(0);
    }
    setOpen((o) => !o);
  };

  const markRead = (id) => {
    fetch(API.NOTIFICATION_READ(id), { method: "POST", credentials: "include" }).then(() =>
      setNotifications((n) =>
        n.map((x) => (x.id === id ? { ...x, readAt: new Date().toISOString() } : x))
      )
    );
    setExpanded((e) => (e === id ? null : id));
  };

  const markAllRead = () => {
    fetch(API.NOTIFICATIONS_READ_ALL, { method: "POST", credentials: "include" }).then(() =>
      setNotifications((n) =>
        n.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() }))
      )
    );
    setCount(0);
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
      >
        🔔
        {count > 0 && (
          <span className="notif-bell-badge">{count > 99 ? "99+" : count}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span>Powiadomienia</span>
            {notifications.some((n) => !n.readAt) && (
              <button className="notif-mark-all-btn" onClick={markAllRead}>
                Oznacz wszystkie
              </button>
            )}
          </div>
          <div className="notif-list">
            {notifications.length === 0 && (
              <div className="notif-empty">Brak powiadomień</div>
            )}
            {notifications.slice(0, 10).map((n) => (
              <div
                key={n.id}
                className={`notif-item${!n.readAt ? " notif-item--unread" : ""}${
                  expanded === n.id ? " notif-item--expanded" : ""
                }`}
                onClick={() => markRead(n.id)}
              >
                <div className="notif-item-icon">{TYPE_ICON[n.type] || "ℹ️"}</div>
                <div className="notif-item-body">
                  <div className="notif-item-title">{n.title}</div>
                  <div
                    className={`notif-item-msg${
                      expanded === n.id ? " notif-item-msg--full" : ""
                    }`}
                  >
                    {n.message}
                  </div>
                  <div className="notif-item-time">{relativeTime(n.createdAt)}</div>
                </div>
                {!n.readAt && <div className="notif-unread-dot" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
