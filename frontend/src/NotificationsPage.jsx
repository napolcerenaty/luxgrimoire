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
  const [selected,      setSelected]      = useState(new Set());

  useEffect(() => {
    fetch(API.NOTIFICATIONS, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setNotifications(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const markRead = (id) => {
    const isUnread = !notifications.find(n => n.id === id)?.readAt;
    setExpanded(e => (e === id ? null : id));
    if (isUnread) {
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n)
      );
      fetch(API.NOTIFICATION_READ(id), { method: "POST", credentials: "include" })
        .then(() => { if (onRead) onRead(); });
    }
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    fetch(API.NOTIFICATIONS_READ_ALL, { method: "POST", credentials: "include" })
      .then(() => { if (onRead) onRead(); });
  };

  const markSelectedRead = () => {
    const ids = [...selected];
    setNotifications(prev =>
      prev.map(n => selected.has(n.id) ? { ...n, readAt: n.readAt || new Date().toISOString() } : n)
    );
    setSelected(new Set());
    fetch(API.NOTIFICATIONS_READ_BATCH, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).then(() => { if (onRead) onRead(); });
  };

  const deleteOne = (id, e) => {
    e.stopPropagation();
    setNotifications(prev => prev.filter(n => n.id !== id));
    setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
    const wasUnread = !notifications.find(n => n.id === id)?.readAt;
    fetch(API.NOTIFICATION_DELETE(id), { method: "DELETE", credentials: "include" })
      .then(() => { if (wasUnread && onRead) onRead(); });
  };

  const deleteSelected = () => {
    const ids = [...selected];
    const hadUnread = notifications.some(n => selected.has(n.id) && !n.readAt);
    setNotifications(prev => prev.filter(n => !selected.has(n.id)));
    setSelected(new Set());
    fetch(API.NOTIFICATIONS_DELETE_BATCH, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).then(() => { if (hadUnread && onRead) onRead(); });
  };

  const deleteAll = () => {
    const hadUnread = notifications.some(n => !n.readAt);
    setNotifications([]);
    setSelected(new Set());
    fetch(API.NOTIFICATIONS, { method: "DELETE", credentials: "include" })
      .then(() => { if (hadUnread && onRead) onRead(); });
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === notifications.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(notifications.map(n => n.id)));
    }
  };

  const unreadCount  = notifications.filter(n => !n.readAt).length;
  const allSelected  = notifications.length > 0 && selected.size === notifications.length;
  const someSelected = selected.size > 0;

  return (
    <div className="notif-page">
      <div className="notif-page-header">
        <button className="notif-page-back" onClick={onBack}>← Wróć</button>
        <h1 className="notif-page-title">✶ Powiadomienia</h1>
        <div className="notif-page-header-actions">
          {unreadCount > 0 && (
            <button className="notif-page-mark-all" onClick={markAllRead}>
              ✓ Przeczytane ({unreadCount})
            </button>
          )}
          {notifications.length > 0 && (
            <button className="notif-page-delete-all" onClick={deleteAll}>
              Usuń wszystkie
            </button>
          )}
        </div>
      </div>

      {someSelected && (
        <div className="notif-selection-bar">
          <span className="notif-selection-count">Zaznaczono: {selected.size}</span>
          <div className="notif-selection-actions">
            <button className="notif-sel-btn notif-sel-btn--read" onClick={markSelectedRead}>
              ✓ Oznacz jako przeczytane
            </button>
            <button className="notif-sel-btn notif-sel-btn--delete" onClick={deleteSelected}>
              Usuń zaznaczone
            </button>
            <button className="notif-sel-btn notif-sel-btn--clear" onClick={() => setSelected(new Set())}>
              ✕ Odznacz
            </button>
          </div>
        </div>
      )}

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
        <>
          <div className="notif-list-controls">
            <label className="notif-select-all-label">
              <input
                type="checkbox"
                className="notif-card-checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
              />
              <span>{allSelected ? "Odznacz wszystkie" : "Zaznacz wszystkie"}</span>
            </label>
          </div>

          <div className="notif-page-list">
            {notifications.map(n => {
              const meta    = TYPE_META[n.type] || TYPE_META.INFO;
              const isOpen  = expanded === n.id;
              const isChecked = selected.has(n.id);
              return (
                <article
                  key={n.id}
                  className={`notif-card${!n.readAt ? " notif-card--unread" : ""}${isOpen ? " notif-card--open" : ""}${isChecked ? " notif-card--selected" : ""}`}
                  onClick={() => markRead(n.id)}
                >
                  <input
                    type="checkbox"
                    className="notif-card-checkbox"
                    checked={isChecked}
                    onChange={() => toggleSelect(n.id)}
                    onClick={e => e.stopPropagation()}
                  />

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

                  <div className="notif-card-right">
                    {!n.readAt && <div className="notif-card-dot" />}
                    <button
                      className="notif-card-delete-btn"
                      onClick={(e) => deleteOne(n.id, e)}
                      title="Usuń powiadomienie"
                    >✕</button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
