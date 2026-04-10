import { useState, useEffect } from "react";
import "./BookDetailEditPage.css";
import { useI18n } from "./i18n";

const MONTH_NUMS = [1,2,3,4,5,6,7,8,9,10,11,12];

function emptyBookForm() {
  return { title: "", author: "", seriesName: "", volumeNumber: "" };
}

function toBookForm(book) {
  if (!book) return emptyBookForm();
  return {
    title: book.title || "",
    author: book.author || "",
    seriesName: book.seriesName || "",
    volumeNumber: book.volumeNumber || "",
  };
}

function emptyEditionForm() {
  return {
    editionName: "",
    subscriptionName: "",
    subscriptionId: "",
    subscriptionMonthId: "",
    publisher: "",
    subscriptionMonth: "",
    subscriptionYear: "",
    firstAccessDate: "",
    earlyAccessDate: "",
    generalSaleDate: "",
    basePrice: "",
    currency: "",
    imageUrls: [],
    artists: [],
    bookBoxCompanyId: "",
    bookBoxCompanyCustomName: "",
    _companySelect: "",
    _subscriptionSelect: "",
    _monthSelect: "",
  };
}

function toEditionForm(edition) {
  if (!edition || edition === "new") return emptyEditionForm();
  return {
    editionName: edition.editionName || "",
    subscriptionName: edition.subscriptionName || "",
    subscriptionId: edition.subscriptionId || "",
    subscriptionMonthId: edition.subscriptionMonthId || "",
    publisher: edition.publisher || "",
    subscriptionMonth: edition.subscriptionMonth != null ? String(edition.subscriptionMonth) : "",
    subscriptionYear: edition.subscriptionYear != null ? String(edition.subscriptionYear) : "",
    firstAccessDate: edition.firstAccessDate || "",
    earlyAccessDate: edition.earlyAccessDate || "",
    generalSaleDate: edition.generalSaleDate || "",
    basePrice: edition.basePrice != null ? String(edition.basePrice) : "",
    currency: edition.currency || "",
    imageUrls: edition.imageUrls ? [...edition.imageUrls] : [],
    artists: edition.artists ? edition.artists.map((a) => ({ artistName: a.artistName || "", contribution: a.contribution || "" })) : [],
    bookBoxCompanyId: edition.bookBoxCompanyId || "",
    bookBoxCompanyCustomName: edition.bookBoxCompanyCustomName || "",
    _companySelect: edition.bookBoxCompanyId ? edition.bookBoxCompanyId : (edition.bookBoxCompanyCustomName ? "custom" : ""),
    _subscriptionSelect: edition.subscriptionId ? edition.subscriptionId : (edition.subscriptionName ? "custom" : ""),
    _monthSelect: edition.subscriptionMonthId || "",
  };
}

export default function BookDetailEditPage({ initialData, editingEdition, onSaved, onBack }) {
  const { t } = useI18n();

  // Determine mode
  const isNewBook = initialData === null;
  const isEditBookMeta = initialData && editingEdition === null;
  const isNewEdition = initialData && editingEdition === "new";
  const isEditEdition = initialData && editingEdition && editingEdition !== "new";

  const showBookForm = isNewBook || isEditBookMeta;
  const showEditionForm = isNewBook || isNewEdition || isEditEdition;

  const [bookForm, setBookForm] = useState(() => toBookForm(initialData));
  const [editionForm, setEditionForm] = useState(() => toEditionForm(editingEdition));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    fetch("http://localhost:8080/api/companies", { credentials: "include" })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setCompanies(data))
      .catch(() => {});
  }, []);

  const setBook = (key, value) => setBookForm((f) => ({ ...f, [key]: value }));
  const setEd = (key, value) => setEditionForm((f) => ({ ...f, [key]: value }));

  const setImageUrl = (idx, value) => setEditionForm((f) => {
    const arr = [...f.imageUrls]; arr[idx] = value; return { ...f, imageUrls: arr };
  });
  const addImageUrl = () => setEditionForm((f) => ({ ...f, imageUrls: [...f.imageUrls, ""] }));
  const removeImageUrl = (idx) => setEditionForm((f) => ({ ...f, imageUrls: f.imageUrls.filter((_, i) => i !== idx) }));

  const setArtist = (idx, key, value) => setEditionForm((f) => {
    const arr = f.artists.map((a, i) => i === idx ? { ...a, [key]: value } : a);
    return { ...f, artists: arr };
  });
  const addArtist = () => setEditionForm((f) => ({ ...f, artists: [...f.artists, { artistName: "", contribution: "" }] }));
  const removeArtist = (idx) => setEditionForm((f) => ({ ...f, artists: f.artists.filter((_, i) => i !== idx) }));

  const buildEditionPayload = () => ({
    editionName: editionForm.editionName || null,
    subscriptionName: editionForm.subscriptionName || null,
    subscriptionId: editionForm.subscriptionId || null,
    subscriptionMonthId: editionForm.subscriptionMonthId || null,
    publisher: editionForm.publisher || null,
    subscriptionMonth: editionForm.subscriptionMonth ? parseInt(editionForm.subscriptionMonth, 10) : null,
    subscriptionYear: editionForm.subscriptionYear ? parseInt(editionForm.subscriptionYear, 10) : null,
    firstAccessDate: editionForm.firstAccessDate || null,
    earlyAccessDate: editionForm.earlyAccessDate || null,
    generalSaleDate: editionForm.generalSaleDate || null,
    basePrice: editionForm.basePrice ? parseFloat(editionForm.basePrice) : null,
    currency: editionForm.currency || null,
    imageUrls: editionForm.imageUrls.filter((u) => u.trim() !== ""),
    artists: editionForm.artists.filter((a) => a.artistName.trim() !== ""),
    bookBoxCompanyId: editionForm.bookBoxCompanyId || null,
    bookBoxCompanyCustomName: editionForm.bookBoxCompanyCustomName || null,
  });

  const editionHasContent = () => {
    const e = editionForm;
    return e.editionName || e.subscriptionName || e.publisher || e.basePrice || e.generalSaleDate || e.imageUrls.filter(u => u.trim()).length > 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isNewBook) {
        // 1. Create book
        const bookRes = await fetch("http://localhost:8080/api/book-details", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: bookForm.title || null,
            author: bookForm.author || null,
            seriesName: bookForm.seriesName || null,
            volumeNumber: bookForm.volumeNumber || null,
          }),
        });
        if (!bookRes.ok) throw new Error(await bookRes.text() || `HTTP ${bookRes.status}`);
        let book = await bookRes.json();
        // 2. Optionally add edition
        if (editionHasContent()) {
          const edRes = await fetch(`http://localhost:8080/api/book-details/${book.id}/editions`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildEditionPayload()),
          });
          if (!edRes.ok) throw new Error(await edRes.text() || `HTTP ${edRes.status}`);
          book = await edRes.json();
        }
        onSaved(book);
      } else if (isEditBookMeta) {
        const res = await fetch(`http://localhost:8080/api/book-details/${initialData.id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: bookForm.title || null,
            author: bookForm.author || null,
            seriesName: bookForm.seriesName || null,
            volumeNumber: bookForm.volumeNumber || null,
          }),
        });
        if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
        const updated = await res.json();
        onSaved(updated);
      } else if (isNewEdition) {
        const res = await fetch(`http://localhost:8080/api/book-details/${initialData.id}/editions`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildEditionPayload()),
        });
        if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
        const book = await res.json();
        onSaved(book);
      } else if (isEditEdition) {
        const res = await fetch(`http://localhost:8080/api/book-details/${initialData.id}/editions/${editingEdition.id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildEditionPayload()),
        });
        if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
        const book = await res.json();
        onSaved(book);
      }
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const months = t("bookDetail.months");
  const monthsArr = Array.isArray(months) ? months : [];

  const selectedCompany = editionForm._companySelect && editionForm._companySelect !== "custom"
    ? companies.find((c) => c.id === editionForm._companySelect) || null
    : null;
  const companySubs = selectedCompany && Array.isArray(selectedCompany.subscriptions) ? selectedCompany.subscriptions : [];
  const selectedSub = editionForm._subscriptionSelect && editionForm._subscriptionSelect !== "custom"
    ? companySubs.find((s) => s.id === editionForm._subscriptionSelect) || null
    : null;
  const subMonths = selectedSub && Array.isArray(selectedSub.months) ? selectedSub.months : [];

  const heading = isNewBook ? t("bookDetail.addDetails")
    : isEditBookMeta ? t("bookDetail.editBookMeta")
    : isNewEdition ? t("bookDetail.addEdition")
    : t("bookDetail.editEditionBtn");

  return (
    <div className="edit-page">
      <div className="edit-header">
        <button className="edit-back-btn" type="button" onClick={onBack}>{t("back")}</button>
        <h2 className="edit-heading">{heading}</h2>
      </div>

      {error && <p className="edit-error">{error}</p>}

      <form className="edit-form" onSubmit={handleSubmit}>
        {/* Book fields */}
        {showBookForm && (
          <div className="edit-grid">
            <label className="edit-label">
              {t("col.title")}
              <input className="edit-input" value={bookForm.title} onChange={(e) => setBook("title", e.target.value)} />
            </label>
            <label className="edit-label">
              {t("col.author")}
              <input className="edit-input" value={bookForm.author} onChange={(e) => setBook("author", e.target.value)} />
            </label>
            <label className="edit-label">
              {t("bookDetail.series")}
              <input className="edit-input" value={bookForm.seriesName} onChange={(e) => setBook("seriesName", e.target.value)} />
            </label>
            <label className="edit-label">
              {t("bookDetail.volume")}
              <input className="edit-input" value={bookForm.volumeNumber} onChange={(e) => setBook("volumeNumber", e.target.value)} />
            </label>
          </div>
        )}

        {/* Book read-only header when editing edition */}
        {!showBookForm && initialData && (
          <div className="edit-book-info">
            <strong>{initialData.title}</strong>
            {initialData.author && <span> &mdash; {initialData.author}</span>}
          </div>
        )}

        {/* Edition fields */}
        {showEditionForm && (
          <>
            {isNewBook && <h3 className="edit-section-title" style={{ marginTop: "1rem" }}>{t("bookDetail.editions")}</h3>}
            <div className="edit-grid">
              <label className="edit-label edit-label--full">
                {t("bookDetail.editionName")}
                <input className="edit-input" value={editionForm.editionName} onChange={(e) => setEd("editionName", e.target.value)} />
              </label>
              <label className="edit-label">
                {t("bookDetail.subscription")}
                {companySubs.length > 0 ? (
                  <>
                    <select
                      className="edit-select"
                      value={editionForm._subscriptionSelect}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          setEditionForm((f) => ({ ...f, _subscriptionSelect: "", subscriptionId: "", subscriptionName: "", _monthSelect: "", subscriptionMonthId: "" }));
                        } else if (val === "custom") {
                          setEditionForm((f) => ({ ...f, _subscriptionSelect: "custom", subscriptionId: "", subscriptionName: "", _monthSelect: "", subscriptionMonthId: "" }));
                        } else {
                          const found = companySubs.find((s) => s.id === val);
                          setEditionForm((f) => ({ ...f, _subscriptionSelect: val, subscriptionId: val, subscriptionName: found ? found.name : "", _monthSelect: "", subscriptionMonthId: "" }));
                        }
                      }}
                    >
                      <option value="">{t("company.sub.noSubscription")}</option>
                      {companySubs.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                      <option value="custom">{t("company.sub.customSubscription")}</option>
                    </select>
                    {editionForm._subscriptionSelect === "custom" && (
                      <input className="edit-input" style={{ marginTop: "0.5rem" }} value={editionForm.subscriptionName} onChange={(e) => setEd("subscriptionName", e.target.value)} placeholder={t("bookDetail.subscription")} />
                    )}
                  </>
                ) : (
                  <input className="edit-input" value={editionForm.subscriptionName} onChange={(e) => setEd("subscriptionName", e.target.value)} />
                )}
              </label>
              {subMonths.length > 0 && (
                <label className="edit-label edit-label--full">
                  {t("company.sub.monthSelect")}
                  <select
                    className="edit-select"
                    value={editionForm._monthSelect}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setEditionForm((f) => ({ ...f, _monthSelect: "", subscriptionMonthId: "", subscriptionMonth: "", subscriptionYear: "" }));
                      } else {
                        const mo = subMonths.find((m) => m.id === val);
                        setEditionForm((f) => ({ ...f, _monthSelect: val, subscriptionMonthId: val, subscriptionMonth: mo ? String(mo.month) : f.subscriptionMonth, subscriptionYear: mo ? String(mo.year) : f.subscriptionYear }));
                      }
                    }}
                  >
                    <option value="">{t("company.sub.noMonth")}</option>
                    {subMonths.map((mo) => {
                      const mName = (monthsArr[mo.month - 1] || mo.month) + " " + mo.year;
                      const label = mo.theme ? `${mName} \u2014 ${mo.theme}` : mName;
                      return <option key={mo.id} value={mo.id}>{label}</option>;
                    })}
                  </select>
                </label>
              )}
              <label className="edit-label">
                {t("bookDetail.publisher")}
                <input className="edit-input" value={editionForm.publisher} onChange={(e) => setEd("publisher", e.target.value)} />
              </label>
              <label className="edit-label">
                {t("bookDetail.subscriptionDate")} ({monthsArr[0] ? monthsArr[0].slice(0, 3) : "Mon"}...)
                <div className="edit-month-year">
                  <select className="edit-select" value={editionForm.subscriptionMonth} onChange={(e) => setEd("subscriptionMonth", e.target.value)}>
                    <option value="">--</option>
                    {MONTH_NUMS.map((m) => (
                      <option key={m} value={m}>{monthsArr[m - 1] || m}</option>
                    ))}
                  </select>
                  <input className="edit-input edit-year" type="number" min="2000" max="2100" placeholder="Year" value={editionForm.subscriptionYear} onChange={(e) => setEd("subscriptionYear", e.target.value)} />
                </div>
              </label>
              <label className="edit-label">
                {t("bookDetail.firstAccess")}
                <input className="edit-input" type="date" value={editionForm.firstAccessDate} onChange={(e) => setEd("firstAccessDate", e.target.value)} />
              </label>
              <label className="edit-label">
                {t("bookDetail.earlyAccess")}
                <input className="edit-input" type="date" value={editionForm.earlyAccessDate} onChange={(e) => setEd("earlyAccessDate", e.target.value)} />
              </label>
              <label className="edit-label">
                {t("bookDetail.generalSale")}
                <input className="edit-input" type="date" value={editionForm.generalSaleDate} onChange={(e) => setEd("generalSaleDate", e.target.value)} />
              </label>
              <label className="edit-label">
                {t("bookDetail.price")}
                <input className="edit-input" type="number" step="0.01" min="0" value={editionForm.basePrice} onChange={(e) => setEd("basePrice", e.target.value)} />
              </label>
              <label className="edit-label">
                {t("bookDetail.currency")}
                <input className="edit-input" value={editionForm.currency} onChange={(e) => setEd("currency", e.target.value)} placeholder="USD" />
              </label>
            </div>

            <div className="edit-section">
              <h3 className="edit-section-title">{t("bookDetail.images")}</h3>
              {editionForm.imageUrls.map((url, idx) => (
                <div key={idx} className="edit-dynamic-row">
                  <input className="edit-input edit-url-input" value={url} onChange={(e) => setImageUrl(idx, e.target.value)} placeholder="https://..." />
                  <button className="edit-remove-btn" type="button" onClick={() => removeImageUrl(idx)}>&#x2715;</button>
                </div>
              ))}
              <button className="edit-add-btn" type="button" onClick={addImageUrl}>{t("bookDetail.addImage")}</button>
            </div>

            <div className="edit-section">
              <h3 className="edit-section-title">{t("bookDetail.artists")}</h3>
              {editionForm.artists.map((artist, idx) => (
                <div key={idx} className="edit-dynamic-row">
                  <input className="edit-input" value={artist.artistName} onChange={(e) => setArtist(idx, "artistName", e.target.value)} placeholder={t("bookDetail.artistName")} />
                  <input className="edit-input" value={artist.contribution} onChange={(e) => setArtist(idx, "contribution", e.target.value)} placeholder={t("bookDetail.artistRole")} />
                  <button className="edit-remove-btn" type="button" onClick={() => removeArtist(idx)}>&#x2715;</button>
                </div>
              ))}
              <button className="edit-add-btn" type="button" onClick={addArtist}>{t("bookDetail.addArtist")}</button>
            </div>

            <div className="edit-section">
              <h3 className="edit-section-title">{t("bookDetail.company")}</h3>
              <select
                className="edit-select"
                value={editionForm._companySelect}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "custom") {
                    setEditionForm((f) => ({ ...f, _companySelect: "custom", bookBoxCompanyId: "", bookBoxCompanyCustomName: "", _subscriptionSelect: "", subscriptionId: "", subscriptionName: "" }));
                  } else {
                    setEditionForm((f) => ({ ...f, _companySelect: val, bookBoxCompanyId: val, bookBoxCompanyCustomName: "", _subscriptionSelect: "", subscriptionId: "", subscriptionName: "" }));
                  }
                }}
              >
                <option value="">{t("company.notSelected")}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value="custom">{t("company.customName")}</option>
              </select>
              {editionForm._companySelect === "custom" && (
                <input
                  className="edit-input"
                  style={{ marginTop: "0.5rem" }}
                  value={editionForm.bookBoxCompanyCustomName}
                  onChange={(e) => setEditionForm((f) => ({ ...f, bookBoxCompanyCustomName: e.target.value }))}
                  placeholder={t("company.customName")}
                />
              )}
            </div>
          </>
        )}

        <div className="edit-form-actions">
          <button className="edit-submit-btn" type="submit" disabled={saving}>
            {saving ? t("bookDetail.saving") : t("bookDetail.saveBtn")}
          </button>
          <button className="edit-cancel-btn" type="button" onClick={onBack} disabled={saving}>
            {t("bookDetail.cancelBtn")}
          </button>
        </div>
      </form>
    </div>
  );
}
