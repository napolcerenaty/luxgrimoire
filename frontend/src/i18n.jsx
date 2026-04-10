import { createContext, useContext, useState, useCallback } from "react";

// ─── Supported languages ──────────────────────────────────────────────────────
export const LANGUAGES = [
  { code: "pl", label: "Polski",    flag: "🇵🇱" },
  { code: "en", label: "English",   flag: "🇬🇧" },
  { code: "de", label: "Deutsch",   flag: "🇩🇪" },
  { code: "fr", label: "Français",  flag: "🇫🇷" },
  { code: "es", label: "Español",   flag: "🇪🇸" },
];

const SUPPORTED = LANGUAGES.map((l) => l.code);
const LS_KEY = "luxgrimoire_lang";

function detectBrowserLang() {
  const lang = (navigator.language || "en").toLowerCase().split("-")[0];
  return SUPPORTED.includes(lang) ? lang : "en";
}

function loadLang() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch {}
  return detectBrowserLang();
}

// ─── Translation tables ───────────────────────────────────────────────────────
const T = {
  pl: {
    app: {
      subtitle:      "Wyselekcjonowana kolekcja wyjątkowych książek",
      footer:        "LuxGrimoire — Wszelkie prawa zastrzeżone",
    },
    nav: {
      browse:        "📚 Przeglądaj",
      collection:    "📋 Moja kolekcja",
    },
    browse: {
      loading:       "Ładowanie kolekcji…",
      error:         "⚠ Nie można załadować książek: {msg}",
      errorHint:     "Upewnij się, że backend Spring Boot działa na porcie 8080.",
      sectionTitle:  "Nasza kolekcja",
    },
    col: {
      loading:       "Ładowanie kolekcji…",
      error:         "⚠ Nie można załadować danych: {msg}",
      errorHint:     "Upewnij się, że backend Spring Boot działa na porcie 8080.",
      showing:       "Pokazuje {filtered} z {total} pozycji",
      language:      "Język",
      author:        "Autor",
      title:         "Tytuł",
      series:        "Seria",
      volume:        "Tom",
      edition:       "Edycja",
      features:      "Cechy",
      read:          "Przeczytane",
      forSale:       "Na sprzedaż",
      notes:         "Notatki",
      filterHint:    "Filtruj…",
      all:           "Wszystkie",
      yes:           "Tak",
      no:            "Nie",
    },
    user: {
      loginTooltip:  "Zaloguj się",
      menuTooltip:   "Menu użytkownika",
      loginTitle:    "Logowanie",
      username:      "Użytkownik",
      password:      "Hasło",
      loggingIn:     "Logowanie…",
      login:         "Zaloguj się",
      menuProfile:   "👤 Profil",
      menuSettings:  "⚙️ Ustawienia",
      menuLogout:    "🚪 Wyloguj",
    },
    profile: {
      title:         "Profil użytkownika",
      firstName:     "Imię",
      lastName:      "Nazwisko",
      username:      "Użytkownik",
      timezone:      "Strefa czasowa",
      editBtn:       "✎ Edytuj profil",
      saveBtn:       "Zapisz zmiany",
      saving:        "Zapisywanie…",
      saved:         "✓ Zmiany zostały zapisane",
      cancel:        "Anuluj",
    },
    settings: {
      title:         "Ustawienia",
      timezone:      "Strefa czasowa",
      browserTz:     "Wykryta strefa przeglądarki: {tz}",
      saveBtn:       "Zapisz ustawienia",
      saving:        "Zapisywanie…",
      saved:         "✓ Ustawienia zostały zapisane",
    },
    back:            "← Wróć",
  },

  en: {
    app: {
      subtitle:      "A curated collection of extraordinary books",
      footer:        "LuxGrimoire — All rights reserved",
    },
    nav: {
      browse:        "📚 Browse",
      collection:    "📋 My Collection",
    },
    browse: {
      loading:       "Loading the collection…",
      error:         "⚠ Could not load books: {msg}",
      errorHint:     "Make sure the Spring Boot backend is running on port 8080.",
      sectionTitle:  "Our Collection",
    },
    col: {
      loading:       "Loading collection…",
      error:         "⚠ Could not load data: {msg}",
      errorHint:     "Make sure the Spring Boot backend is running on port 8080.",
      showing:       "Showing {filtered} of {total} entries",
      language:      "Language",
      author:        "Author",
      title:         "Title",
      series:        "Series",
      volume:        "Volume",
      edition:       "Edition",
      features:      "Features",
      read:          "Read",
      forSale:       "For Sale",
      notes:         "Notes",
      filterHint:    "Filter…",
      all:           "All",
      yes:           "Yes",
      no:            "No",
    },
    user: {
      loginTooltip:  "Sign in",
      menuTooltip:   "User menu",
      loginTitle:    "Sign In",
      username:      "Username",
      password:      "Password",
      loggingIn:     "Signing in…",
      login:         "Sign In",
      menuProfile:   "👤 Profile",
      menuSettings:  "⚙️ Settings",
      menuLogout:    "🚪 Sign Out",
    },
    profile: {
      title:         "User Profile",
      firstName:     "First Name",
      lastName:      "Last Name",
      username:      "Username",
      timezone:      "Time Zone",
      editBtn:       "✎ Edit Profile",
      saveBtn:       "Save Changes",
      saving:        "Saving…",
      saved:         "✓ Changes saved",
      cancel:        "Cancel",
    },
    settings: {
      title:         "Settings",
      timezone:      "Time Zone",
      browserTz:     "Detected browser time zone: {tz}",
      saveBtn:       "Save Settings",
      saving:        "Saving…",
      saved:         "✓ Settings saved",
    },
    back:            "← Back",
  },

  de: {
    app: {
      subtitle:      "Eine erlesene Sammlung außergewöhnlicher Bücher",
      footer:        "LuxGrimoire — Alle Rechte vorbehalten",
    },
    nav: {
      browse:        "📚 Stöbern",
      collection:    "📋 Meine Sammlung",
    },
    browse: {
      loading:       "Sammlung wird geladen…",
      error:         "⚠ Bücher konnten nicht geladen werden: {msg}",
      errorHint:     "Stellen Sie sicher, dass das Spring Boot Backend auf Port 8080 läuft.",
      sectionTitle:  "Unsere Sammlung",
    },
    col: {
      loading:       "Sammlung wird geladen…",
      error:         "⚠ Daten konnten nicht geladen werden: {msg}",
      errorHint:     "Stellen Sie sicher, dass das Spring Boot Backend auf Port 8080 läuft.",
      showing:       "{filtered} von {total} Einträgen",
      language:      "Sprache",
      author:        "Autor",
      title:         "Titel",
      series:        "Reihe",
      volume:        "Band",
      edition:       "Ausgabe",
      features:      "Merkmale",
      read:          "Gelesen",
      forSale:       "Zu verkaufen",
      notes:         "Notizen",
      filterHint:    "Filtern…",
      all:           "Alle",
      yes:           "Ja",
      no:            "Nein",
    },
    user: {
      loginTooltip:  "Anmelden",
      menuTooltip:   "Benutzermenü",
      loginTitle:    "Anmelden",
      username:      "Benutzername",
      password:      "Passwort",
      loggingIn:     "Anmelden…",
      login:         "Anmelden",
      menuProfile:   "👤 Profil",
      menuSettings:  "⚙️ Einstellungen",
      menuLogout:    "🚪 Abmelden",
    },
    profile: {
      title:         "Benutzerprofil",
      firstName:     "Vorname",
      lastName:      "Nachname",
      username:      "Benutzername",
      timezone:      "Zeitzone",
      editBtn:       "✎ Profil bearbeiten",
      saveBtn:       "Änderungen speichern",
      saving:        "Speichern…",
      saved:         "✓ Änderungen gespeichert",
      cancel:        "Abbrechen",
    },
    settings: {
      title:         "Einstellungen",
      timezone:      "Zeitzone",
      browserTz:     "Erkannte Browser-Zeitzone: {tz}",
      saveBtn:       "Einstellungen speichern",
      saving:        "Speichern…",
      saved:         "✓ Einstellungen gespeichert",
    },
    back:            "← Zurück",
  },

  fr: {
    app: {
      subtitle:      "Une collection soigneusement choisie de livres extraordinaires",
      footer:        "LuxGrimoire — Tous droits réservés",
    },
    nav: {
      browse:        "📚 Parcourir",
      collection:    "📋 Ma collection",
    },
    browse: {
      loading:       "Chargement de la collection…",
      error:         "⚠ Impossible de charger les livres : {msg}",
      errorHint:     "Assurez-vous que le backend Spring Boot fonctionne sur le port 8080.",
      sectionTitle:  "Notre collection",
    },
    col: {
      loading:       "Chargement de la collection…",
      error:         "⚠ Impossible de charger les données : {msg}",
      errorHint:     "Assurez-vous que le backend Spring Boot fonctionne sur le port 8080.",
      showing:       "{filtered} sur {total} entrées affichées",
      language:      "Langue",
      author:        "Auteur",
      title:         "Titre",
      series:        "Série",
      volume:        "Tome",
      edition:       "Édition",
      features:      "Caractéristiques",
      read:          "Lu",
      forSale:       "À vendre",
      notes:         "Notes",
      filterHint:    "Filtrer…",
      all:           "Tous",
      yes:           "Oui",
      no:            "Non",
    },
    user: {
      loginTooltip:  "Se connecter",
      menuTooltip:   "Menu utilisateur",
      loginTitle:    "Connexion",
      username:      "Identifiant",
      password:      "Mot de passe",
      loggingIn:     "Connexion…",
      login:         "Se connecter",
      menuProfile:   "👤 Profil",
      menuSettings:  "⚙️ Paramètres",
      menuLogout:    "🚪 Déconnexion",
    },
    profile: {
      title:         "Profil utilisateur",
      firstName:     "Prénom",
      lastName:      "Nom",
      username:      "Identifiant",
      timezone:      "Fuseau horaire",
      editBtn:       "✎ Modifier le profil",
      saveBtn:       "Enregistrer les modifications",
      saving:        "Enregistrement…",
      saved:         "✓ Modifications enregistrées",
      cancel:        "Annuler",
    },
    settings: {
      title:         "Paramètres",
      timezone:      "Fuseau horaire",
      browserTz:     "Fuseau détecté par le navigateur : {tz}",
      saveBtn:       "Enregistrer les paramètres",
      saving:        "Enregistrement…",
      saved:         "✓ Paramètres enregistrés",
    },
    back:            "← Retour",
  },

  es: {
    app: {
      subtitle:      "Una colección cuidadosamente seleccionada de libros extraordinarios",
      footer:        "LuxGrimoire — Todos los derechos reservados",
    },
    nav: {
      browse:        "📚 Explorar",
      collection:    "📋 Mi colección",
    },
    browse: {
      loading:       "Cargando la colección…",
      error:         "⚠ No se pudieron cargar los libros: {msg}",
      errorHint:     "Asegúrate de que el backend Spring Boot esté ejecutándose en el puerto 8080.",
      sectionTitle:  "Nuestra colección",
    },
    col: {
      loading:       "Cargando la colección…",
      error:         "⚠ No se pudieron cargar los datos: {msg}",
      errorHint:     "Asegúrate de que el backend Spring Boot esté ejecutándose en el puerto 8080.",
      showing:       "Mostrando {filtered} de {total} entradas",
      language:      "Idioma",
      author:        "Autor",
      title:         "Título",
      series:        "Serie",
      volume:        "Tomo",
      edition:       "Edición",
      features:      "Características",
      read:          "Leído",
      forSale:       "En venta",
      notes:         "Notas",
      filterHint:    "Filtrar…",
      all:           "Todos",
      yes:           "Sí",
      no:            "No",
    },
    user: {
      loginTooltip:  "Iniciar sesión",
      menuTooltip:   "Menú de usuario",
      loginTitle:    "Iniciar sesión",
      username:      "Usuario",
      password:      "Contraseña",
      loggingIn:     "Iniciando sesión…",
      login:         "Iniciar sesión",
      menuProfile:   "👤 Perfil",
      menuSettings:  "⚙️ Configuración",
      menuLogout:    "🚪 Cerrar sesión",
    },
    profile: {
      title:         "Perfil de usuario",
      firstName:     "Nombre",
      lastName:      "Apellido",
      username:      "Usuario",
      timezone:      "Zona horaria",
      editBtn:       "✎ Editar perfil",
      saveBtn:       "Guardar cambios",
      saving:        "Guardando…",
      saved:         "✓ Cambios guardados",
      cancel:        "Cancelar",
    },
    settings: {
      title:         "Configuración",
      timezone:      "Zona horaria",
      browserTz:     "Zona horaria detectada por el navegador: {tz}",
      saveBtn:       "Guardar configuración",
      saving:        "Guardando…",
      saved:         "✓ Configuración guardada",
    },
    back:            "← Volver",
  },
};

// ─── Context ──────────────────────────────────────────────────────────────────
const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(loadLang);

  const setLang = useCallback((code) => {
    setLangState(code);
    try { localStorage.setItem(LS_KEY, code); } catch {}
  }, []);

  /** Resolve dot-path key, interpolate {placeholders} from vars object */
  const t = useCallback(
    (path, vars = {}) => {
      const table = T[lang] ?? T.en;
      const value = path.split(".").reduce((obj, k) => obj?.[k], table)
                 ?? path.split(".").reduce((obj, k) => obj?.[k], T.en)
                 ?? path;
      return Object.entries(vars).reduce(
        (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), v),
        String(value)
      );
    },
    [lang]
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
