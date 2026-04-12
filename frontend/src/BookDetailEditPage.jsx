import { useState, useEffect, useRef } from "react";
import "./BookDetailEditPage.css";
import { useI18n } from "./i18n";
import { API } from "./api";
import { BOOK_LANGUAGES } from "./bookLanguages";

// ── Combobox for authors / artists ────────────────────────────────────────────

function NameCombobox({ value, items, onSelect, onAddNew, placeholder, addingNew }) {
  const [input, setInput] = useState(value || "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => { setInput(value || ""); }, [value]);

  const filtered = input.trim()
    ? items.filter((a) => a.name.toLowerCase().includes(input.toLowerCase()))
    : items;
  const exactMatch = items.some((a) => a.name.toLowerCase() === input.trim().toLowerCase());

  const handleChange = (e) => {
    setInput(e.target.value);
    setOpen(true);
    onSelect(null, e.target.value);
  };

  const selectItem = (item) => {
    setInput(item.name);
    setOpen(false);
    onSelect(item, item.name);
  };

  const handleAddNew = () => {
    setOpen(false);
    onAddNew(input.trim());
  };

  return (
    <div className="combobox" ref={wrapRef}>
      <input
        className="edit-input"
        value={input}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && (filtered.length > 0 || (!exactMatch && input.trim())) && (
        <div className="combobox-dropdown">
          {filtered.map((a) => (
            <div key={a.id} className="combobox-option" onMouseDown={() => selectItem(a)}>
              {a.name}
            </div>
          ))}
          {!exactMatch && input.trim() && (
            <div className="combobox-option combobox-add" onMouseDown={handleAddNew}>
              {addingNew ? "Adding..." : `+ Add "${input.trim()}" as new`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyBookForm() {
  return { title: "", author: "", authorId: "", seriesName: "", volumeNumber: "" };
}

function toBookForm(book) {
  if (!book) return emptyBookForm();
  return {
    title: book.title || "",
    author: book.author || "",
    authorId: book.authorId || "",
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
    language: "",
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
    language: edition.language || "",
    subscriptionMonth: edition.subscriptionMonth != null ? String(edition.subscriptionMonth) : "",
    subscriptionYear: edition.subscriptionYear != null ? String(edition.subscriptionYear) : "",
    firstAccessDate: edition.firstAccessDate || "",
    earlyAccessDate: edition.earlyAccessDate || "",
    generalSaleDate: edition.generalSaleDate || "",
    basePrice: edition.basePrice != null ? String(edition.basePrice) : "",
    currency: edition.currency || "",
    imageUrls: edition.imageUrls ? [...edition.imageUrls] : [],
    artists: edition.artists ? edition.artists.map((a) => ({
      artistName: a.artistName || "",
      contribution: a.contribution || "",
      artistId: a.artistId || "",
    })) : [],
    bookBoxCompanyId: edition.bookBoxCompanyId || "",
    bookBoxCompanyCustomName: edition.bookBoxCompanyCustomName || "",
    _companySelect: edition.bookBoxCompanyId ? edition.bookBoxCompanyId : (edition.bookBoxCompanyCustomName ? "custom" : ""),
    _subscriptionSelect: edition.subscriptionId ? edition.subscriptionId : (edition.subscriptionName ? "custom" : ""),
    _monthSelect: edition.subscriptionMonthId || "",
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BookDetailEditPage({ initialData, editingEdition, onSaved, onBack }) {
  const { t } = useI18n();

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
  const [authors, setAuthors] = useState([]);
  const [artists, setArtists] = useState([]);
  const [seriesNames, setSeriesNames] = useState([]);
  const [contributionTypes, setContributionTypes] = useState([]);
  const [addingAuthor, setAddingAuthor] = useState(false);
  const [addingArtistIdx, setAddingArtistIdx] = useState(null);

  useEffect(() => {
    const opts = { credentials: "include" };
    const base = "http://localhost:8080/api";
    Promise.all([
      fetch(`${base}/companies`, opts).then((r) => r.ok ? r.json() : []),
      fetch(`${base}/authors`, opts).then((r) => r.ok ? r.json() : []),
      fetch(`${base}/artists`, opts).then((r) => r.ok ? r.json() : []),
      fetch(`${base}/book-details/series-names`, opts).then((r) => r.ok ? r.json() : []),
      fetch(`${base}/book-details/contributions`, opts).then((r) => r.ok ? r.json() : []),
    ]).then(([c, au, ar, sn, ct]) => {
      setCompanies(c);
      setAuthors(au);
      setArtists(ar);
      setSeriesNames(sn);
      setContributionTypes(ct);
    }).catch(() => {});
  }, []);

  const setBook = (key, val) => setBookForm((f) => ({ ...f, [key]: val }));
  const setEd = (key, val) => setEditionForm((f) => ({ ...f, [key]: val }));

  // ── Author inline add ────────────────────────────────────────────────────────
  const handleAuthorSelect = (item, typedText) => {
    if (item) {
      setBookForm((f) => ({ ...f, author: item.name, authorId: item.id }));
    } else {
      setBookForm((f) => ({ ...f, author: typedText, authorId: "" }));
    }
  };

  const handleAddNewAuthor = async (name) => {
    if (!name) return;
    setAddingAuthor(true);
    try {
      const res = await fetch("http://localhost:8080/api/authors", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const newA = await res.json();
        setAuthors((prev) => [...prev, newA]);
        setBookForm((f) => ({ ...f, author: newA.name, authorId: newA.id }));
      }
    } finally {
      setAddingAuthor(false);
    }
  };

  // ── Artist inline add ─────────────────────────────────────────────────────────
  const handleArtistSelect = (idx, item, typedText) => {
    setEditionForm((f) => {
      const arr = f.artists.map((a, i) => i === idx ? {
        ...a,
        artistName: item ? item.name : typedText,
        artistId: item ? item.id : "",
      } : a);
      return { ...f, artists: arr };
    });
  };

  const handleAddNewArtist = async (idx, name) => {
    if (!name) return;
    setAddingArtistIdx(idx);
    try {
      const res = await fetch("http://localhost:8080/api/artists", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const newA = await res.json();
        setArtists((prev) => [...prev, newA]);
        setEditionForm((f) => {
          const arr = f.artists.map((a, i) => i === idx ? { ...a, artistName: newA.name, artistId: newA.id } : a);
          return { ...f, artists: arr };
        });
      }
    } finally {
      setAddingArtistIdx(null);
    }
  };

  // ── Image helpers ────────────────────────────────────────────────────────────
  const fileInputRef = useRef(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const moveImageUp = (idx) => setEditionForm((f) => {
    if (idx === 0) return f;
    const arr = [...f.imageUrls];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    return { ...f, imageUrls: arr };
  });

  const moveImageDown = (idx) => setEditionForm((f) => {
    if (idx === f.imageUrls.length - 1) return f;
    const arr = [...f.imageUrls];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    return { ...f, imageUrls: arr };
  });

  const removeImageUrl = (idx) => setEditionForm((f) => ({
    ...f, imageUrls: f.imageUrls.filter((_, i) => i !== idx),
  }));

  const handleImageFilePicked = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setUploadingImage(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(API.BOOK_IMAGE_UPLOAD, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      const data = await res.json();
      setEditionForm((f) => ({ ...f, imageUrls: [...f.imageUrls, data.url] }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  // ── Artist row helpers ───────────────────────────────────────────────────────
  const setArtistField = (idx, key, val) => setEditionForm((f) => ({
    ...f, artists: f.artists.map((a, i) => i === idx ? { ...a, [key]: val } : a),
  }));
  const addArtist = () => setEditionForm((f) => ({ ...f, artists: [...f.artists, { artistName: "", contribution: "", artistId: "" }] }));
  const removeArtist = (idx) => setEditionForm((f) => ({ ...f, artists: f.artists.filter((_, i) => i !== idx) }));

  // ── Derived values ───────────────────────────────────────────────────────────
  const months = t("bookDetail.months");
  const monthsArr = Array.isArray(months) ? months : [];

  const selectedCompany = editionForm._companySelect && editionForm._companySelect !== "custom"
    ? companies.find((c) => c.id === editionForm._companySelect) || null : null;
  const companySubs = selectedCompany?.subscriptions ?? [];
  const selectedSub = editionForm._subscriptionSelect && editionForm._subscriptionSelect !== "custom"
    ? companySubs.find((s) => s.id === editionForm._subscriptionSelect) || null : null;
  const subMonths = selectedSub?.months ?? [];

  const monthLocked = !!editionForm._monthSelect;

  const buildEditionPayload = () => {
    let generalSaleDate = editionForm.generalSaleDate || null;
    if (monthLocked && editionForm.subscriptionYear && editionForm.subscriptionMonth) {
      const y = editionForm.subscriptionYear;
      const m = String(editionForm.subscriptionMonth).padStart(2, "0");
      generalSaleDate = `${y}-${m}-01`;
    }
    return {
      editionName: editionForm.editionName || null,
      subscriptionName: editionForm.subscriptionName || null,
      subscriptionId: editionForm.subscriptionId || null,
      subscriptionMonthId: editionForm.subscriptionMonthId || null,
      publisher: editionForm.publisher || null,
      language: editionForm.language || null,
      subscriptionMonth: editionForm.subscriptionMonth ? parseInt(editionForm.subscriptionMonth, 10) : null,
      subscriptionYear: editionForm.subscriptionYear ? parseInt(editionForm.subscriptionYear, 10) : null,
      firstAccessDate: monthLocked ? null : (editionForm.firstAccessDate || null),
      earlyAccessDate: monthLocked ? null : (editionForm.earlyAccessDate || null),
      generalSaleDate,
      basePrice: editionForm.basePrice ? parseFloat(editionForm.basePrice) : null,
      currency: editionForm.currency || null,
      imageUrls: editionForm.imageUrls.filter((u) => u.trim() !== ""),
      artists: editionForm.artists.filter((a) => a.artistName.trim() !== "").map((a) => ({
        artistName: a.artistName, contribution: a.contribution, artistId: a.artistId || null,
      })),
      bookBoxCompanyId: editionForm.bookBoxCompanyId || null,
      bookBoxCompanyCustomName: editionForm.bookBoxCompanyCustomName || null,
    };
  };

  const editionHasContent = () => {
    const e = editionForm;
    return e.editionName || e.subscriptionName || e.publisher || e.basePrice || e.generalSaleDate
      || e.imageUrls.filter((u) => u.trim()).length > 0;
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const base = "http://localhost:8080/api/book-details";
      const opts = (method, body) => ({
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (isNewBook) {
        const bookRes = await fetch(base, opts("POST", {
          title: bookForm.title || null, author: bookForm.author || null,
          authorId: bookForm.authorId || null, seriesName: bookForm.seriesName || null,
          volumeNumber: bookForm.volumeNumber || null,
        }));
        if (!bookRes.ok) throw new Error(await bookRes.text() || `HTTP ${bookRes.status}`);
        let book = await bookRes.json();
        if (editionHasContent()) {
          const edRes = await fetch(`${base}/${book.id}/editions`, opts("POST", buildEditionPayload()));
          if (!edRes.ok) throw new Error(await edRes.text() || `HTTP ${edRes.status}`);
          book = await edRes.json();
        }
        onSaved(book);
      } else if (isEditBookMeta) {
        const res = await fetch(`${base}/${initialData.id}`, opts("PUT", {
          title: bookForm.title || null, author: bookForm.author || null,
          authorId: bookForm.authorId || null, seriesName: bookForm.seriesName || null,
          volumeNumber: bookForm.volumeNumber || null,
        }));
        if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
        onSaved(await res.json());
      } else if (isNewEdition) {
        const res = await fetch(`${base}/${initialData.id}/editions`, opts("POST", buildEditionPayload()));
        if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
        onSaved(await res.json());
      } else if (isEditEdition) {
        const res = await fetch(`${base}/${initialData.id}/editions/${editingEdition.id}`, opts("PUT", buildEditionPayload()));
        if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
        onSaved(await res.json());
      }
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

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
              <NameCombobox
                value={bookForm.author}
                items={authors}
                onSelect={handleAuthorSelect}
                onAddNew={handleAddNewAuthor}
                placeholder="Author name"
                addingNew={addingAuthor}
              />
            </label>

            <label className="edit-label">
              {t("bookDetail.series")}
              <NameCombobox
                value={bookForm.seriesName}
                items={seriesNames.map((s) => ({ id: s, name: s }))}
                onSelect={(item, text) => setBook("seriesName", item ? item.name : text)}
                onAddNew={(name) => setBook("seriesName", name)}
                placeholder="Series name"
                addingNew={false}
              />
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
            <h3 className="edit-section-title">{t("bookDetail.bookMeta")}</h3>
            <div className="edit-book-info-grid">
              <div className="edit-book-info-item">
                <span className="edit-book-info-label">{t("col.title")}</span>
                <strong>{initialData.title}</strong>
              </div>
              {initialData.author && (
                <div className="edit-book-info-item">
                  <span className="edit-book-info-label">{t("col.author")}</span>
                  <span>{initialData.author}</span>
                </div>
              )}
              {initialData.seriesName && (
                <div className="edit-book-info-item">
                  <span className="edit-book-info-label">{t("bookDetail.series")}</span>
                  <span>{initialData.seriesName}</span>
                </div>
              )}
              <div className="edit-book-info-item">
                <span className="edit-book-info-label">{t("bookDetail.seriesPosition")}</span>
                <span>{initialData.volumeNumber || t("bookDetail.standalone")}</span>
              </div>
            </div>
          </div>
        )}

        {/* Edition fields */}
        {showEditionForm && (
          <>
            {isNewBook && (
              <h3 className="edit-section-title" style={{ marginTop: "1rem" }}>
                {t("bookDetail.editionDetails")}
              </h3>
            )}

            {/* Company / subscription — top of edition */}
            <div className="edit-grid">
              <label className="edit-label edit-label--full">
                {t("bookDetail.company")}
                <select
                  className="edit-select"
                  value={editionForm._companySelect}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "custom") {
                      setEditionForm((f) => ({ ...f, _companySelect: "custom", bookBoxCompanyId: "", bookBoxCompanyCustomName: "", _subscriptionSelect: "", subscriptionId: "", subscriptionName: "", _monthSelect: "", subscriptionMonthId: "" }));
                    } else {
                      setEditionForm((f) => ({ ...f, _companySelect: val, bookBoxCompanyId: val, bookBoxCompanyCustomName: "", _subscriptionSelect: "", subscriptionId: "", subscriptionName: "", _monthSelect: "", subscriptionMonthId: "" }));
                    }
                  }}
                >
                  <option value="">{t("company.notSelected")}</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="custom">{t("company.customName")}</option>
                </select>
                {editionForm._companySelect === "custom" && (
                  <input
                    className="edit-input"
                    style={{ marginTop: "0.5rem" }}
                    value={editionForm.bookBoxCompanyCustomName}
                    onChange={(e) => setEd("bookBoxCompanyCustomName", e.target.value)}
                    placeholder={t("company.customName")}
                  />
                )}
              </label>

              {(companySubs.length > 0 || editionForm._companySelect === "custom") && (
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
                            setEditionForm((f) => ({
                              ...f,
                              _subscriptionSelect: val,
                              subscriptionId: val,
                              subscriptionName: found ? found.name : "",
                              _monthSelect: "",
                              subscriptionMonthId: "",
                              basePrice: found?.basePrice != null ? String(found.basePrice) : f.basePrice,
                            }));
                          }
                        }}
                      >
                        <option value="">{t("company.sub.noSubscription")}</option>
                        {companySubs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        <option value="custom">{t("company.sub.customSubscription")}</option>
                      </select>
                      {editionForm._subscriptionSelect === "custom" && (
                        <input className="edit-input" style={{ marginTop: "0.5rem" }} value={editionForm.subscriptionName}
                          onChange={(e) => setEd("subscriptionName", e.target.value)} placeholder={t("bookDetail.subscription")} />
                      )}
                    </>
                  ) : (
                    <input className="edit-input" value={editionForm.subscriptionName}
                      onChange={(e) => setEd("subscriptionName", e.target.value)} />
                  )}
                </label>
              )}

              {subMonths.length > 0 && (
                <label className="edit-label">
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
                      return <option key={mo.id} value={mo.id}>{mo.theme ? `${mName} — ${mo.theme}` : mName}</option>;
                    })}
                  </select>
                </label>
              )}
            </div>

            {/* Publisher + Language */}
            <div className="edit-grid">
              <label className="edit-label">
                {t("bookDetail.publisher")}
                <input className="edit-input" value={editionForm.publisher}
                  onChange={(e) => setEd("publisher", e.target.value)} />
              </label>
              <label className="edit-label">
                {t("bookDetail.language")}
                <select className="edit-select" value={editionForm.language}
                  onChange={(e) => setEd("language", e.target.value)}>
                  <option value="">—</option>
                  {BOOK_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Free-text subscription month/year (when no structured months available) */}
            {subMonths.length === 0 && (
              <div className="edit-grid">
                <label className="edit-label">
                  {t("bookDetail.subscriptionDate")}
                  <div className="edit-month-year">
                    <select className="edit-select" value={editionForm.subscriptionMonth}
                      onChange={(e) => setEd("subscriptionMonth", e.target.value)}>
                      <option value="">—</option>
                      {monthsArr.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
                    </select>
                    <input className="edit-input edit-year" type="number" min="2000" max="2100" placeholder="Year"
                      value={editionForm.subscriptionYear} onChange={(e) => setEd("subscriptionYear", e.target.value)} />
                  </div>
                </label>
              </div>
            )}

            {/* Dates — hidden when subscription month is locked */}
            {!monthLocked && (
              <div className="edit-grid">
                <label className="edit-label">
                  {t("bookDetail.firstAccess")}
                  <input className="edit-input" type="date" value={editionForm.firstAccessDate}
                    onChange={(e) => setEd("firstAccessDate", e.target.value)} />
                </label>
                <label className="edit-label">
                  {t("bookDetail.earlyAccess")}
                  <input className="edit-input" type="date" value={editionForm.earlyAccessDate}
                    onChange={(e) => setEd("earlyAccessDate", e.target.value)} />
                </label>
                <label className="edit-label">
                  {t("bookDetail.generalSale")}
                  <input className="edit-input" type="date" value={editionForm.generalSaleDate}
                    onChange={(e) => setEd("generalSaleDate", e.target.value)} />
                </label>
              </div>
            )}
            {monthLocked && (
              <p className="edit-date-note">
                Sale date set to subscription renewal: {monthsArr[(parseInt(editionForm.subscriptionMonth, 10) || 1) - 1]} {editionForm.subscriptionYear}.
              </p>
            )}

            {/* Price */}
            <div className="edit-grid">
              <label className="edit-label">
                {t("bookDetail.price")}
                <input className="edit-input" type="number" step="0.01" min="0" value={editionForm.basePrice}
                  onChange={(e) => setEd("basePrice", e.target.value)} />
              </label>
              <label className="edit-label">
                {t("bookDetail.currency")}
                <input className="edit-input" value={editionForm.currency}
                  onChange={(e) => setEd("currency", e.target.value)} placeholder="USD" />
              </label>
            </div>

            {/* Images */}
            <div className="edit-section">
              <h3 className="edit-section-title">{t("bookDetail.images")}</h3>
              {editionForm.imageUrls.length > 0 && (
                <div className="edit-image-grid">
                  {editionForm.imageUrls.map((url, idx) => (
                    <div key={idx} className="edit-image-card">
                      {idx === 0 && (
                        <span className="edit-image-cover-badge">{t("bookDetail.cover")}</span>
                      )}
                      <img
                        className="edit-image-thumb"
                        src={url.startsWith("/uploads") ? `${API.BASE}${url}` : url}
                        alt={idx === 0 ? t("bookDetail.cover") : `${idx + 1}`}
                      />
                      <div className="edit-image-actions">
                        <button
                          type="button" className="edit-image-btn"
                          onClick={() => moveImageUp(idx)} disabled={idx === 0}
                          title="↑"
                        >↑</button>
                        <button
                          type="button" className="edit-image-btn edit-image-btn--remove"
                          onClick={() => removeImageUrl(idx)}
                        >✕</button>
                        <button
                          type="button" className="edit-image-btn"
                          onClick={() => moveImageDown(idx)}
                          disabled={idx === editionForm.imageUrls.length - 1}
                          title="↓"
                        >↓</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleImageFilePicked}
              />
              <button
                className="edit-add-btn"
                type="button"
                onClick={() => fileInputRef.current.click()}
                disabled={uploadingImage}
              >
                {uploadingImage ? t("bookDetail.uploadingImage") : t("bookDetail.addImage")}
              </button>
            </div>

            {/* Artists */}
            <div className="edit-section">
              <h3 className="edit-section-title">{t("bookDetail.artists")}</h3>
              <datalist id="contributions-datalist">
                {contributionTypes.map((c) => <option key={c} value={c} />)}
              </datalist>
              {editionForm.artists.map((artist, idx) => (
                <div key={idx} className="edit-dynamic-row edit-artist-row">
                  <div className="edit-artist-name">
                    <NameCombobox
                      value={artist.artistName}
                      items={artists}
                      onSelect={(item, text) => handleArtistSelect(idx, item, text)}
                      onAddNew={(name) => handleAddNewArtist(idx, name)}
                      placeholder={t("bookDetail.artistName")}
                      addingNew={addingArtistIdx === idx}
                    />
                  </div>
                  <input
                    className="edit-input edit-contribution"
                    list="contributions-datalist"
                    value={artist.contribution}
                    onChange={(e) => setArtistField(idx, "contribution", e.target.value)}
                    placeholder={t("bookDetail.artistRole")}
                    autoComplete="off"
                  />
                  <button className="edit-remove-btn" type="button" onClick={() => removeArtist(idx)}>&#x2715;</button>
                </div>
              ))}
              <button className="edit-add-btn" type="button" onClick={addArtist}>{t("bookDetail.addArtist")}</button>
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
