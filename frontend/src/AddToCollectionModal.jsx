import { useState, useEffect } from "react";
import { useI18n } from "./i18n";
import { API } from "./api";
import "./AddToCollectionModal.css";

const OWNERSHIP_STATUSES = ["OWNED", "WISHLIST", "PREORDER", "LOANED_OUT", "SOLD", "GIFTED_AWAY"];
const CONDITIONS         = ["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"];

/**
 * Compute the best default purchase date (priority order):
 *  1. subMonthContext (subscription page) – month + year + renewalDay
 *  2. edition.generalSaleDate            – explicit sale date stored on edition
 *  3. edition.subscriptionYear/Month     – first of the subscription month
 *  4. today
 */
function computeDefaultDate(subMonthContext, edition) {
  // 1. Subscription page context
  if (subMonthContext?.month && subMonthContext?.year) {
    const day = subMonthContext.renewalDay ?? 1;
    const daysInMonth = new Date(subMonthContext.year, subMonthContext.month, 0).getDate();
    const d = Math.min(day, daysInMonth);
    return `${subMonthContext.year}-${String(subMonthContext.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  // 2. General sale date on edition
  if (edition?.generalSaleDate) return edition.generalSaleDate.slice(0, 10);
  // 3. Subscription month/year on edition (fall back to 1st of month)
  if (edition?.subscriptionYear && edition?.subscriptionMonth) {
    return `${edition.subscriptionYear}-${String(edition.subscriptionMonth).padStart(2, "0")}-01`;
  }
  // 4. Today
  return new Date().toISOString().slice(0, 10);
}

/**
 * Modal for adding one or more books to the user's collection in a single purchase.
 *
 * Props:
 *  book        – full book object (with .editions[])
 *  edition     – pre-selected edition (single-book mode), or null for bundle mode
 *  onClose     – called when modal should close
 *  onAdded     – called with the saved PurchaseTransaction after successful save
 */
export default function AddToCollectionModal({ book, edition, subMonthContext, onClose, onAdded }) {
  const { t } = useI18n();

  // ── shared purchase fields ─────────────────────────────────────────────────
  const [purchaseDate, setPurchaseDate] = useState(
    computeDefaultDate(subMonthContext, edition)
  );

  // Safety net: if context/edition arrive after mount, re-apply the default
  // (only if user hasn't changed the date yet)
  const initialDate = computeDefaultDate(subMonthContext, edition);
  useEffect(() => {
    setPurchaseDate(initialDate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subMonthContext?.month, subMonthContext?.year, subMonthContext?.renewalDay, edition?.id]);
  const [basePrice,       setBasePrice]       = useState("");
  const [taxesAndFees,    setTaxesAndFees]    = useState("");
  const [shipping,        setShipping]        = useState("");
  const [currency,        setCurrency]        = useState("PLN");
  const [source,          setSource]          = useState("");
  const [notes,           setNotes]           = useState("");

  // ── bundle: list of selected editions ─────────────────────────────────────
  const initialBooks = edition
    ? [{ bookId: book.id, editionId: edition.id, allocatedPrice: "", ownershipStatus: "OWNED", condition: "NEW" }]
    : [];
  const [bookEntries, setBookEntries] = useState(initialBooks);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);
  const [success, setSuccess] = useState(false);

  // Auto-split basePrice evenly across all entries (taxes/shipping stay at transaction level)
  useEffect(() => {
    const parsed = parseFloat(basePrice);
    if (!isNaN(parsed) && bookEntries.length > 0) {
      const split = (parsed / bookEntries.length).toFixed(2);
      setBookEntries((prev) => prev.map((e) => ({ ...e, allocatedPrice: split })));
    }
  }, [basePrice, bookEntries.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const editions = book?.editions || [];

  const addEditionEntry = () => {
    setBookEntries((prev) => [
      ...prev,
      { bookId: book.id, editionId: "", allocatedPrice: "", ownershipStatus: "OWNED", condition: "NEW" },
    ]);
  };

  const removeEditionEntry = (idx) => {
    setBookEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateEntry = (idx, field, value) => {
    setBookEntries((prev) => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };

  const handleSave = async () => {
    if (bookEntries.length === 0) { setError(t("collection.modal.noBooks")); return; }
    const invalidEdition = bookEntries.some((e) => !e.editionId);
    if (invalidEdition) { setError(t("collection.modal.selectEdition")); return; }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(API.USER_PURCHASES, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          purchaseDate: purchaseDate || null,
          basePrice:    basePrice    ? parseFloat(basePrice)    : null,
          taxesAndFees: taxesAndFees ? parseFloat(taxesAndFees) : null,
          shipping:     shipping     ? parseFloat(shipping)     : null,
          currency,
          source,
          notes,
          books: bookEntries.map((e) => ({
            bookId:          e.bookId,
            editionId:       e.editionId,
            allocatedPrice:  e.allocatedPrice ? parseFloat(e.allocatedPrice) : null,
            ownershipStatus: e.ownershipStatus,
            condition:       e.condition,
          })),
        }),
      });
      if (res.ok) {
        const tx = await res.json();
        setSuccess(true);
        setTimeout(() => { onAdded?.(tx); onClose(); }, 1500);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || t("collection.modal.saveFailed"));
      }
    } catch {
      setError(t("collection.modal.networkError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="atc-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="atc-modal" role="dialog" aria-modal="true">
        <button className="atc-close" onClick={onClose}>✕</button>
        <h2 className="atc-title">{t("collection.modal.title")}</h2>

        {success ? (
          <p className="atc-success">{t("collection.modal.saved")}</p>
        ) : (
          <>
            {/* ── Books in purchase ──────────────────────────────────────── */}
            <section className="atc-section">
              <h3 className="atc-section-title">{t("collection.modal.booksTitle")}</h3>
              {bookEntries.map((entry, idx) => (
                <div key={idx} className="atc-book-row">
                  {!edition && (
                    <select
                      className="atc-select atc-edition-select"
                      value={entry.editionId}
                      onChange={(e) => {
                        const ed = editions.find((ed) => ed.id === e.target.value);
                        updateEntry(idx, "editionId", e.target.value);
                        if (ed) updateEntry(idx, "bookId", book.id);
                      }}
                    >
                      <option value="">{t("collection.modal.selectEditionPlaceholder")}</option>
                      {editions.map((ed) => (
                        <option key={ed.id} value={ed.id}>{ed.editionName || t("bookDetail.defaultEdition")}</option>
                      ))}
                    </select>
                  )}
                  {edition && (
                    <span className="atc-edition-name">
                      {edition.editionName || t("bookDetail.defaultEdition")}
                    </span>
                  )}

                  <select
                    className="atc-select"
                    value={entry.ownershipStatus}
                    onChange={(e) => updateEntry(idx, "ownershipStatus", e.target.value)}
                  >
                    {OWNERSHIP_STATUSES.map((s) => (
                      <option key={s} value={s}>{t(`collection.ownership.${s}`)}</option>
                    ))}
                  </select>

                  <select
                    className="atc-select"
                    value={entry.condition}
                    onChange={(e) => updateEntry(idx, "condition", e.target.value)}
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>{t(`collection.condition.${c}`)}</option>
                    ))}
                  </select>

                  <input
                    className="atc-input atc-price-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={t("collection.modal.allocatedPrice")}
                    value={entry.allocatedPrice}
                    onChange={(e) => updateEntry(idx, "allocatedPrice", e.target.value)}
                  />

                  {bookEntries.length > 1 && (
                    <button className="atc-remove-btn" onClick={() => removeEditionEntry(idx)} title={t("common.remove")}>✕</button>
                  )}
                </div>
              ))}
              {!edition && (
                <button className="atc-add-book-btn" onClick={addEditionEntry}>
                  + {t("collection.modal.addAnotherEdition")}
                </button>
              )}
            </section>

            {/* ── Purchase details ───────────────────────────────────────── */}
            <section className="atc-section">
              <h3 className="atc-section-title">{t("collection.modal.purchaseDetails")}</h3>
              <div className="atc-fields">
                <label className="atc-label">
                  {t("collection.modal.purchaseDate")}
                  <input className="atc-input" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
                </label>
                <label className="atc-label">
                  {t("collection.modal.basePrice")}
                  <div className="atc-price-group">
                    <input
                      className="atc-input atc-price-total"
                      type="number" min="0" step="0.01"
                      placeholder="0.00"
                      value={basePrice}
                      onChange={(e) => setBasePrice(e.target.value)}
                    />
                    <select className="atc-select atc-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                      {["PLN","EUR","USD","GBP","SEK","NOK","DKK"].map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </label>
                <label className="atc-label">
                  {t("collection.modal.taxesAndFees")}
                  <input
                    className="atc-input"
                    type="number" min="0" step="0.01"
                    placeholder="0.00"
                    value={taxesAndFees}
                    onChange={(e) => setTaxesAndFees(e.target.value)}
                  />
                </label>
                <label className="atc-label">
                  {t("collection.modal.shipping")}
                  <input
                    className="atc-input"
                    type="number" min="0" step="0.01"
                    placeholder="0.00"
                    value={shipping}
                    onChange={(e) => setShipping(e.target.value)}
                  />
                </label>
                <label className="atc-label">
                  {t("collection.modal.source")}
                  <input className="atc-input" type="text" placeholder={t("collection.modal.sourcePlaceholder")} value={source} onChange={(e) => setSource(e.target.value)} />
                </label>
                <label className="atc-label atc-label-full">
                  {t("collection.modal.notes")}
                  <textarea className="atc-input atc-notes" rows={2} placeholder={t("collection.modal.notesPlaceholder")} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
              </div>
            </section>

            {error && <p className="atc-error">{error}</p>}

            <div className="atc-actions">
              <button className="atc-btn atc-btn-secondary" onClick={onClose}>{t("common.cancel")}</button>
              <button className="atc-btn atc-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? t("common.saving") : t("collection.modal.save")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
