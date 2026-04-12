// ISO 639-1 language codes with display names (Polish UI labels)
export const BOOK_LANGUAGES = [
  { code: "pl", label: "Polski" },
  { code: "en", label: "Angielski" },
  { code: "de", label: "Niemiecki" },
  { code: "fr", label: "Francuski" },
  { code: "es", label: "Hiszpański" },
  { code: "it", label: "Włoski" },
  { code: "pt", label: "Portugalski" },
  { code: "ru", label: "Rosyjski" },
  { code: "uk", label: "Ukraiński" },
  { code: "cs", label: "Czeski" },
  { code: "sk", label: "Słowacki" },
  { code: "hu", label: "Węgierski" },
  { code: "ro", label: "Rumuński" },
  { code: "nl", label: "Niderlandzki" },
  { code: "sv", label: "Szwedzki" },
  { code: "no", label: "Norweski" },
  { code: "da", label: "Duński" },
  { code: "fi", label: "Fiński" },
  { code: "ja", label: "Japoński" },
  { code: "zh", label: "Chiński" },
  { code: "ko", label: "Koreański" },
  { code: "ar", label: "Arabski" },
  { code: "tr", label: "Turecki" },
  { code: "hr", label: "Chorwacki" },
  { code: "sr", label: "Serbski" },
  { code: "bg", label: "Bułgarski" },
];

/** Returns the display label for a given language code, or the code itself as fallback. */
export function getLanguageLabel(code) {
  if (!code) return null;
  return BOOK_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
