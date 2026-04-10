import { useState, useEffect } from "react";
import "./BookDetailEditPage.css";
import { useI18n } from "./i18n";

const MONTH_NUMS = [1,2,3,4,5,6,7,8,9,10,11,12];

function emptyForm() {
  return {
    title: "",
    author: "",
    seriesName: "",
    volumeNumber: "",
    subscriptionName: "",
    subscriptionId: "",
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
  };
}

function toForm(data) {
  if (!data) return emptyForm();
  return {
    title: data.title || "",
    author: data.author || "",
    seriesName: data.seriesName || "",
    volumeNumber: data.volumeNumber || "",
    subscriptionName: data.subscriptionName || "",
    subscriptionId: data.subscriptionId || "",
    publisher: data.publisher || "",
    subscriptionMonth: data.subscriptionMonth != null ? String(data.subscriptionMonth) : "",
    subscriptionYear: data.subscriptionYear != null ? String(data.subscriptionYear) : "",
    firstAccessDate: data.firstAccessDate || "",
    earlyAccessDate: data.earlyAccessDate || "",
    generalSaleDate: data.generalSaleDate || "",
    basePrice: data.basePrice != null ? String(data.basePrice) : "",
    currency: data.currency || "",
    imageUrls: data.imageUrls ? [...data.imageUrls] : [],
    artists: data.artists ? data.artists.map((a) => ({ artistName: a.artistName || "", contribution: a.contribution || "" })) : [],
    bookBoxCompanyId: data.bookBoxCompanyId || "",
    bookBoxCompanyCustomName: data.bookBoxCompanyCustomName || "",
    _companySelect: data.bookBoxCompanyId ? data.bookBoxCompanyId : (data.bookBoxCompanyCustomName ? "custom" : ""),
    _subscriptionSelect: data.subscriptionId ? data.subscriptionId : (data.subscriptionName ? "custom" : ""),
  };
}

export default function BookDetailEditPage({ initialData, onSaved, onBack }) {
  const { t } = useI18n();
  const [form, setForm] = useState(() => toForm(initialData));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    fetch("http://localhost:8080/api/companies", { credentials: "include" })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setCompanies(data))
      .catch(() => {});
  }, []);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const setImageUrl = (idx, value) => setForm((f) => {
    const arr = [...f.imageUrls];
    arr[idx] = value;
    return { ...f, imageUrls: arr };
  });
  const addImageUrl = () => setForm((f) => ({ ...f, imageUrls: [...f.imageUrls, ""] }));
  const removeImageUrl = (idx) => setForm((f) => ({ ...f, imageUrls: f.imageUrls.filter((_, i) => i !== idx) }));

  const setArtist = (idx, key, value) => setForm((f) => {
    const arr = f.artists.map((a, i) => i === idx ? { ...a, [key]: value } : a);
    return { ...f, artists: arr };
  });
  const addArtist = () => setForm((f) => ({ ...f, artists: [...f.artists, { artistName: "", contribution: "" }] }));
  const removeArtist = (idx) => setForm((f) => ({ ...f, artists: f.artists.filter((_, i) => i !== idx) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      title: form.title || null,
      author: form.author || null,
      seriesName: form.seriesName || null,
      volumeNumber: form.volumeNumber || null,
      subscriptionName: form.subscriptionName || null,
      subscriptionId: form.subscriptionId || null,
      publisher: form.publisher || null,
      subscriptionMonth: form.subscriptionMonth ? parseInt(form.subscriptionMonth, 10) : null,
      subscriptionYear: form.subscriptionYear ? parseInt(form.subscriptionYear, 10) : null,
      firstAccessDate: form.firstAccessDate || null,
      earlyAccessDate: form.earlyAccessDate || null,
      generalSaleDate: form.generalSaleDate || null,
      basePrice: form.basePrice ? parseFloat(form.basePrice) : null,
      currency: form.currency || null,
      imageUrls: form.imageUrls.filter((u) => u.trim() !== ""),
      artists: form.artists.filter((a) => a.artistName.trim() !== ""),
      bookBoxCompanyId: form.bookBoxCompanyId || null,
      bookBoxCompanyCustomName: form.bookBoxCompanyCustomName || null,
    };

    const isEdit = initialData && initialData.id;
    const url = isEdit
      ? `http://localhost:8080/api/book-details/${initialData.id}`
      : "http://localhost:8080/api/book-details";
    const method = isEdit ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const result = await res.json();
      onSaved(result);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const months = t("bookDetail.months");
  const monthsArr = Array.isArray(months) ? months : [];

  const selectedCompany = form._companySelect && form._companySelect !== "custom"
    ? companies.find((c) => c.id === form._companySelect) || null
    : null;
  const companySubs = selectedCompany && Array.isArray(selectedCompany.subscriptions)
    ? selectedCompany.subscriptions
    : [];

  return (
    <div className="edit-page">
      <div className="edit-header">
        <button className="edit-back-btn" type="button" onClick={onBack}>{t("back")}</button>
        <h2 className="edit-heading">
          {initialData && initialData.id ? t("bookDetail.editBtn") : t("bookDetail.addDetails")}
        </h2>
      </div>

      {error && <p className="edit-error">{error}</p>}

      <form className="edit-form" onSubmit={handleSubmit}>
        <div className="edit-grid">
          <label className="edit-label">
            {t("col.title")}
            <input className="edit-input" value={form.title} onChange={(e) => set("title", e.target.value)} />
          </label>
          <label className="edit-label">
            {t("col.author")}
            <input className="edit-input" value={form.author} onChange={(e) => set("author", e.target.value)} />
          </label>
          <label className="edit-label">
            {t("bookDetail.series")}
            <input className="edit-input" value={form.seriesName} onChange={(e) => set("seriesName", e.target.value)} />
          </label>
          <label className="edit-label">
            {t("bookDetail.volume")}
            <input className="edit-input" value={form.volumeNumber} onChange={(e) => set("volumeNumber", e.target.value)} />
          </label>
          <label className="edit-label">
            {t("bookDetail.subscription")}
            {companySubs.length > 0 ? (
              <>
                <select
                  className="edit-select"
                  value={form._subscriptionSelect}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      setForm((f) => ({ ...f, _subscriptionSelect: "", subscriptionId: "", subscriptionName: "" }));
                    } else if (val === "custom") {
                      setForm((f) => ({ ...f, _subscriptionSelect: "custom", subscriptionId: "", subscriptionName: "" }));
                    } else {
                      const found = companySubs.find((s) => s.id === val);
                      setForm((f) => ({
                        ...f,
                        _subscriptionSelect: val,
                        subscriptionId: val,
                        subscriptionName: found ? found.name : "",
                      }));
                    }
                  }}
                >
                  <option value="">{t("company.sub.noSubscription")}</option>
                  {companySubs.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                  <option value="custom">{t("company.sub.customSubscription")}</option>
                </select>
                {form._subscriptionSelect === "custom" && (
                  <input
                    className="edit-input"
                    style={{ marginTop: "0.5rem" }}
                    value={form.subscriptionName}
                    onChange={(e) => set("subscriptionName", e.target.value)}
                    placeholder={t("bookDetail.subscription")}
                  />
                )}
              </>
            ) : (
              <input className="edit-input" value={form.subscriptionName} onChange={(e) => set("subscriptionName", e.target.value)} />
            )}
          </label>
          <label className="edit-label">
            {t("bookDetail.publisher")}
            <input className="edit-input" value={form.publisher} onChange={(e) => set("publisher", e.target.value)} />
          </label>
          <label className="edit-label">
            {t("bookDetail.subscriptionDate")} ({t("bookDetail.months")[0].slice(0, 3)}...)
            <div className="edit-month-year">
              <select className="edit-select" value={form.subscriptionMonth} onChange={(e) => set("subscriptionMonth", e.target.value)}>
                <option value="">--</option>
                {MONTH_NUMS.map((m) => (
                  <option key={m} value={m}>{monthsArr[m - 1] || m}</option>
                ))}
              </select>
              <input
                className="edit-input edit-year"
                type="number"
                min="2000"
                max="2100"
                placeholder="Year"
                value={form.subscriptionYear}
                onChange={(e) => set("subscriptionYear", e.target.value)}
              />
            </div>
          </label>
          <label className="edit-label">
            {t("bookDetail.firstAccess")}
            <input className="edit-input" type="date" value={form.firstAccessDate} onChange={(e) => set("firstAccessDate", e.target.value)} />
          </label>
          <label className="edit-label">
            {t("bookDetail.earlyAccess")}
            <input className="edit-input" type="date" value={form.earlyAccessDate} onChange={(e) => set("earlyAccessDate", e.target.value)} />
          </label>
          <label className="edit-label">
            {t("bookDetail.generalSale")}
            <input className="edit-input" type="date" value={form.generalSaleDate} onChange={(e) => set("generalSaleDate", e.target.value)} />
          </label>
          <label className="edit-label">
            {t("bookDetail.price")}
            <input className="edit-input" type="number" step="0.01" min="0" value={form.basePrice} onChange={(e) => set("basePrice", e.target.value)} />
          </label>
          <label className="edit-label">
            {t("bookDetail.currency")}
            <input className="edit-input" value={form.currency} onChange={(e) => set("currency", e.target.value)} placeholder="USD" />
          </label>
        </div>

        <div className="edit-section">
          <h3 className="edit-section-title">{t("bookDetail.images")}</h3>
          {form.imageUrls.map((url, idx) => (
            <div key={idx} className="edit-dynamic-row">
              <input
                className="edit-input edit-url-input"
                value={url}
                onChange={(e) => setImageUrl(idx, e.target.value)}
                placeholder="https://..."
              />
              <button className="edit-remove-btn" type="button" onClick={() => removeImageUrl(idx)}>&#x2715;</button>
            </div>
          ))}
          <button className="edit-add-btn" type="button" onClick={addImageUrl}>{t("bookDetail.addImage")}</button>
        </div>

        <div className="edit-section">
          <h3 className="edit-section-title">{t("bookDetail.artists")}</h3>
          {form.artists.map((artist, idx) => (
            <div key={idx} className="edit-dynamic-row">
              <input
                className="edit-input"
                value={artist.artistName}
                onChange={(e) => setArtist(idx, "artistName", e.target.value)}
                placeholder={t("bookDetail.artistName")}
              />
              <input
                className="edit-input"
                value={artist.contribution}
                onChange={(e) => setArtist(idx, "contribution", e.target.value)}
                placeholder={t("bookDetail.artistRole")}
              />
              <button className="edit-remove-btn" type="button" onClick={() => removeArtist(idx)}>&#x2715;</button>
            </div>
          ))}
          <button className="edit-add-btn" type="button" onClick={addArtist}>{t("bookDetail.addArtist")}</button>
        </div>

        <div className="edit-section">
          <h3 className="edit-section-title">{t("bookDetail.company")}</h3>
          <select
            className="edit-select"
            value={form._companySelect}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "custom") {
                setForm((f) => ({ ...f, _companySelect: "custom", bookBoxCompanyId: "", bookBoxCompanyCustomName: "", _subscriptionSelect: "", subscriptionId: "", subscriptionName: "" }));
              } else {
                setForm((f) => ({ ...f, _companySelect: val, bookBoxCompanyId: val, bookBoxCompanyCustomName: "", _subscriptionSelect: "", subscriptionId: "", subscriptionName: "" }));
              }
            }}
          >
            <option value="">{t("company.notSelected")}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value="custom">{t("company.customName")}</option>
          </select>
          {form._companySelect === "custom" && (
            <input
              className="edit-input"
              style={{ marginTop: "0.5rem" }}
              value={form.bookBoxCompanyCustomName}
              onChange={(e) => setForm((f) => ({ ...f, bookBoxCompanyCustomName: e.target.value }))}
              placeholder={t("company.customName")}
            />
          )}
        </div>

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
