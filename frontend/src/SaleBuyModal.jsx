import { useState, useEffect } from "react";
import { API } from "./api";

function fmt(value, currency) {
  if (value == null) return "—";
  const num = parseFloat(value);
  if (isNaN(num)) return "—";
  return num.toLocaleString("en-GB", {
    style: "currency",
    currency: currency || "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function SaleBuyModal({ sale, onClose, onBought }) {
  const [editionDetails, setEditionDetails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!sale?.id) return;
    setLoading(true);
    fetch(API.SALE_EDITIONS(sale.id), { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(async (editions) => {
        const details = await Promise.all(
          editions.map((e) =>
            fetch(API.BOOK_BY_EDITION(e.editionId), { credentials: "include" })
              .then((r) => r.ok ? r.json() : null)
              .then((book) => ({ ...e, bookTitle: book?.title || e.editionId }))
              .catch(() => ({ ...e, bookTitle: e.editionId }))
          )
        );
        setEditionDetails(details);
      })
      .catch(() => setEditionDetails([]))
      .finally(() => setLoading(false));
  }, [sale?.id]);

  const handleBuy = async () => {
    setBuying(true);
    setError(null);
    try {
      const res = await fetch(API.USER_SALE_INTEREST(sale.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "BOUGHT" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSuccess(true);
      onBought && onBought(sale.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBuying(false);
    }
  };

  if (!sale) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, width: "90%", padding: "1.5rem" }}
      >
        <button
          onClick={onClose}
          style={{ float: "right", background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer" }}
        >
          ✕
        </button>
        <h2 style={{ marginTop: 0 }}>🛒 {sale.title}</h2>
        <div style={{ color: "var(--text-muted, #666)", marginBottom: "0.75rem" }}>
          Sale date: <strong>{sale.saleDate}</strong>
        </div>
        {sale.basePrice && (
          <div style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "1rem" }}>
            Total: {fmt(sale.basePrice, sale.currency)}
          </div>
        )}

        <div style={{ marginBottom: "1rem" }}>
          <strong>Included editions:</strong>
          {loading ? (
            <p style={{ color: "var(--text-muted, #666)" }}>Loading...</p>
          ) : editionDetails.length === 0 ? (
            <p style={{ color: "var(--text-muted, #666)" }}>No editions listed.</p>
          ) : (
            <ul style={{ paddingLeft: "1.25rem", margin: "0.5rem 0 0" }}>
              {editionDetails.map((e) => (
                <li key={e.id}>{e.bookTitle}</li>
              ))}
            </ul>
          )}
        </div>

        {sale.description && (
          <p style={{ color: "var(--text-muted, #666)", marginBottom: "1rem" }}>{sale.description}</p>
        )}

        {success ? (
          <div style={{ color: "#16a34a", fontWeight: 600 }}>
            ✅ Purchase recorded! Books added to your collection.
          </div>
        ) : (
          <>
            {error && <div style={{ color: "#dc2626", marginBottom: "0.5rem" }}>{error}</div>}
            <button
              onClick={handleBuy}
              disabled={buying}
              style={{
                width: "100%",
                padding: "0.75rem",
                background: "#7c3aed",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontSize: "1rem",
                fontWeight: 600,
                cursor: buying ? "not-allowed" : "pointer",
              }}
            >
              {buying ? "Processing..." : "Confirm Purchase"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
