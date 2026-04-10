import { useState, useRef, useEffect } from "react";
import { LANGUAGES, useI18n } from "./i18n";
import "flag-icons/css/flag-icons.min.css";
import "./LanguagePicker.css";

function FlagIcon({ countryCode, size = "md" }) {
  return (
    <span
      className={`fi fi-${countryCode} flag-icon flag-icon--${size}`}
      aria-hidden="true"
    />
  );
}

export default function LanguagePicker() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="lang-picker" ref={ref}>
      <button
        className="lang-btn"
        onClick={() => setOpen((v) => !v)}
        title={current.label}
        aria-label="Wybierz język / Select language"
      >
        <FlagIcon countryCode={current.countryCode} size="sm" />
        <span className="lang-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="lang-dropdown">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              className={`lang-option${l.code === lang ? " active" : ""}`}
              onClick={() => { setLang(l.code); setOpen(false); }}
            >
              <FlagIcon countryCode={l.countryCode} size="md" />
              <span className="lang-option-label">{l.label}</span>
              {l.code === lang && <span className="lang-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
