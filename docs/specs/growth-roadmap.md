# Growth roadmap — zakodowalne dźwignie pozyskiwania użytkowników

Status: **draft / not started** · Utworzono: 2026-09-06 · Branch docelowy: `development`

Żywy checklist. Odhaczaj `[x]`, dopisuj/przestawiaj fazy. Szczegóły OG images +
publicznego profilu: [og-images-and-public-profile.md](og-images-and-public-profile.md).

Zasady wykonania (CLAUDE.md): każdy krok = commit+push na `development`; migracje
aplikowane do `luxgrimoire_v2` i `luxgrimoire_test`; weryfikacja `tsc --noEmit` +
testy (vitest web / jest api), bez przeglądarki.

Szacunek: solo ~6–8 tygodni, jeśli Fazy 4 i 5 lecą równolegle do Fazy 3.

---

## Ścieżka krytyczna

```
0 → 1 → 2 → 3 → 6 → 7 → 9
         └→ 4 → 8
    └────────→ 5   (TWA: równolegle po Fazie 1)
```

---

## Faza 0 — Pomiar i fundament (~1–2 dni)

Cel: bez tego nie odróżnisz, co działa.

- [x] Atrybucja źródła: `middleware.ts` łapie `utm_*` / `?ref=` → cookie `lg_src` (first-touch, 30 dni) → `signupSource String?` na `User` przy rejestracji (email/hasło: body; OAuth: `?src=` → `oauth_src` cookie hop w `GoogleInitGuard`). Event `signup` z etykietą źródła. Migracja `20260906130000_add_signup_source` napisana — **NIE zaaplikowana** (dedykowany branch; aplikacja do v2+test po merge do `development`). Testy: `auth.service.spec.ts`, `attribution.test.ts`.
- [x] Eventy lejka aktywacji do `SUPPORTED_EVENT_TYPES` (`apps/api/src/modules/analytics/analytics.dto.ts`): `signup`, `added_first_edition`, `imported_collection`, `enabled_notifications`
- [x] Wpięcie `analyticsService.track()`: `added_first_edition` (`POST /collection`, tylko przy 1. nie-wishlist entry), `imported_collection` (`POST /reading-import/execute` gdy `imported > 0`), `enabled_notifications` (`PUT /notifications/preferences` na przejściu off→on)

Zależy od: nic.
Gotowe gdy: nowa rejestracja ma źródło w DB; admin analytics grupuje `signup` po źródle.
Branch: `feature/growth-faza-0-attribution`. Po merge do `development`: zaaplikować migrację do `luxgrimoire_v2` i `luxgrimoire_test`.

## Faza 1 — SSR/ISR na public stronach (~2–3 dni)

- [ ] Serwerowy `serverFetch` bez `cache: 'no-store'` (`next: { revalidate }`); `apiFetch` zostaje dla klienta
- [ ] `editions/[slug]`, `series/[slug]`, `companies/[slug]`, `books/[slug]`, `sales-calendar` → `export const revalidate = 3600` + `generateStaticParams` gdzie sensowne
- [ ] Audyt PWA przy okazji: `manifest.webmanifest`, ikony, service worker, Lighthouse (pod Fazę 5)

Zależy od: nic.
Gotowe gdy: `curl` public strony zwraca pełny HTML z treścią; Lighthouse SEO/Perf > 90.

## Faza 2 — OG images (~2–3 dni)

- [ ] `_og/`: fonty OFL, `loadFonts.ts`, `template.tsx`, `ogImage.ts`; wariant `cloudinaryUrl` z `f_png`
- [ ] `coverAllowedForOg` jako współdzielony util (`apps/web/src/lib/`) — reguła praw do okładek
- [ ] Route'y: `app/opengraph-image.tsx`, `editions/[slug]/opengraph-image.tsx`, `series/[slug]/opengraph-image.tsx`, `sales-calendar/opengraph-image.tsx`
- [ ] Usunąć ręczny `openGraph.images` z `editions/[slug]` `generateMetadata`
- [ ] Testy vitest (render → 200 `image/png`; tabela `coverAllowedForOg`)

Zależy od: Faza 1 (cache/ISR).
Gotowe gdy: link edycji wklejony na Discord pokazuje kartę z okładką + datą preorderu.

## Faza 3 — Publiczny profil kolekcji (~4–6 dni)

Realizacja [og-images-and-public-profile.md](og-images-and-public-profile.md) część 2.
Strategia okładek (poniżej, sekcja „Strategia okładek") wbudowana od startu, nie jako polish.

- [ ] Rozstrzygnąć 5 otwartych decyzji ze spec (ścieżka `/u/`, domyślne toggle, wartość kolekcji, indeksacja, redirecty username)
- [ ] **PR A:** `isProfilePublic` + `profileSettings` (schema + migracja v2/test), `UpdateProfileDto`, zakładka „Public profile" w ustawieniach (toggle + tekst zgody, brak strony)
- [ ] **PR B:** API `/profile/:username` (OptionalAuth + 404 dla prywatnych), `/profile/:username/collection`, `/stats`, event `public_profile_view`; testy jest (projekcja nie przecieka `basePrice`/`orderNumber`/itd.)
- [ ] **PR B:** rozszerzyć `resolveEditionCoverRaw` ([editionCover.ts](../../apps/web/src/lib/editionCover.ts)) o 3. fallback — okładka bazowej książki (Open Library / Google Books, oba już w series-discovery); zwracać znacznik źródła (`official` / `community` / `base-book` / `none`)
- [ ] **PR C:** web `/u/[username]` (`page.tsx` ISR 300s + `PublicCollectionGrid` + `opengraph-image.tsx` + `not-found.tsx`), `robots.ts` (`/u` do `allow`), `sitemap.ts` + `sitemap.service.ts` (`publicProfiles`)
- [ ] **PR C:** dopracowany kafelek generatywny (rozwinięcie fallbacku w [EditionCard.tsx](../../apps/web/src/components/books/EditionCard.tsx) — typografia tytuł+autor, wordmark wydawcy, kolor z `brandColors[0]` / hash tytułu, tekstura, cień grzbietu)
- [ ] **PR C:** okładka bazowej książki renderowana przygaszona + wstążka „Special edition — no photo yet"
- [ ] **PR C:** `PublicCollectionGrid` adaptuje layout do gęstości zdjęć — wysoki udział realnych okładek → ściana okładek; niski → layout „półki" (grupy serii + paski kompletności, klastry wydawców, badge signed/variant)
- [ ] **PR C:** celowany prompt „dodaj zdjęcie" pokazywany tylko właścicielowi danej edycji (strona edycji + własna kolekcja)

Zależy od: Faza 2 (`coverAllowedForOg`, template OG).
Gotowe gdy: włączam profil → `/u/<ja>` renderuje siatkę, link ma kartę OG, jest w sitemapie, flip-off daje 404 w ≤5 min; kolekcja z małą liczbą zdjęć wygląda celowo, nie jak ściana pustych boxów.

## Faza 4 — Konwersja ruchu z SEO (~3–4 dni) — równolegle do Fazy 3

- [ ] „Powiadom mnie" dla niezalogowanych na stronach edycji + w kalendarzu → `@OptionalAuth()` endpoint, e-mail do `SubscriptionWaitlistEntry` (+ `entityId` edycji)
- [ ] Programmatic SEO landing pages: `/publishers/[slug]/special-editions`, `/series/[slug]/special-editions`, `/on-sale/[month]` — szablon z istniejących danych, w sitemapie, własne OG
- [ ] Rozszerzony JSON-LD (`Product`/`Offer` z datą preorderu, `Event` dla dat sprzedaży, `BreadcrumbList`) na stronach edycji i landing pages

Zależy od: Faza 1.
Gotowe gdy: landing pages w sitemapie, „powiadom mnie" zapisuje lead, Google Rich Results Test przechodzi.

## Faza 5 — TWA / Google Play (~2–3 dni) — równolegle od końca Fazy 1

- [ ] Route `/.well-known/assetlinks.json` z SHA-256 fingerprintem klucza podpisującego
- [ ] Wygenerować paczkę: **PWABuilder** (prościej) albo **Bubblewrap** (CLI Google); klucz podpisujący do bezpiecznego schowka (NIE do repo)
- [ ] Konto Play Console ($25), formularz Data Safety, content rating, podpięcie polityki prywatności
- [ ] Assety listingu: ikona, feature graphic, 4–8 screenshotów mobile, tytuł + krótki/długi opis pod ASO (frazy: „special edition books", „FairyLoot tracker", „book subscription tracker", „TBR tracker")
- [ ] Custom „Add to Home Screen" prompt w web dla iOS (TWA nie pokrywa iPhone'ów)
- [ ] Wypuścić najpierw na kanał **internal testing**

Zależy od: Faza 1 (audyt manifest/ikony/SW).
Gotowe gdy: apka z internal testing instaluje się jako pełnoekranowy TWA bez paska URL (= `assetlinks` weryfikuje się poprawnie).

## Faza 6 — Sharing przy „wow" + kolekcja jako obrazek (~2–3 dni)

- [ ] `components/share/ShareButton.tsx` — `navigator.share()` + fallback copy-link + intenty X/Bluesky
- [ ] Wstawić: `/u/[username]`, strona edycji, ekran po powiadomieniu series-continuation / sale-start
- [ ] „Pobierz kolekcję jako obrazek" — dużo realnych okładek → mozaika (12–24); za mało → karta statystyk w stylu Wrapped („47 editions · 12 series complete · 8 signed · 6 publishers"). Przycisk na `/u/[username]` i w prywatnej kolekcji
- [ ] Zapytanie admin: firmy bez zgody na obraz posortowane po liczbie **posiadanych** edycji w kolekcjach userów (kolumna w widoku image-permissions) — priorytetyzuje ręczny outreach

Zależy od: Faza 2 (infra OG), Faza 3 (profil).
Gotowe gdy: „Udostępnij" z telefonu otwiera natywny arkusz; „Pobierz obrazek" daje sensowny PNG także dla kolekcji bez okładek.

## Faza 7 — Pętla referralowa (~3–4 dni)

- [ ] Schema: `referralCode String @unique` na `User` (backfill istniejących), `referredByUserId String?`; migracja v2 + test
- [ ] `/join?ref=CODE` → cookie → przypięcie przy rejestracji, event `referral_signup`
- [ ] Logika nagrody dla obu stron + mini-dashboard „X znajomych dołączyło" w ustawieniach
- [ ] „Zaproś znajomego" CTA z momentu „wow"

Zależy od: Faza 0 (atrybucja), Faza 6 (share infra).
Gotowe gdy: rejestracja z `?ref=` linkuje obu userów i przyznaje nagrodę.

## Faza 8 — Retencja (~2–3 dni)

- [ ] Subskrybowalny feed kalendarza: `GET /calendar/feed/:token.ics` (`@Public()`, token per user), `webcal://` link + „Add to Google/Apple Calendar" w UI
- [ ] Cotygodniowy e-mail digest „drops this week" (cron + moduł `mail`) — zalogowani + anonimowi z „powiadom mnie"; opt-out w każdym mailu
- [ ] Web push „preorder się otwiera" — sprawdzić podpięcie do `PushSubscription`, prompt opt-in po pierwszym dodaniu edycji

Zależy od: Faza 4 (leady „powiadom mnie").
Gotowe gdy: subskrypcja `webcal` pokazuje śledzone dropy w kalendarzu telefonu; digest wychodzi w poniedziałek.

## Faza 9 — Sezonowe: „Wrapped" (~2–3 dni, start ~listopad)

- [ ] `/u/[username]/wrapped/[year]` + dedykowana karta OG + przycisk „udostępnij"
- [ ] Z `UserStatsSnapshot`; publiczne tylko jeśli `isProfilePublic` albo osobny opt-in

Zależy od: Faza 2, Faza 3, Faza 6.
Gotowe gdy: strona generuje kartę roku i ma udostępnianie.

---

## Strategia okładek (rozwiązanie rzadkości zdjęć)

Problem: duża część edycji nie ma zdjęcia — brak zgód wydawcy, brak mocków dla subskrypcji,
za mało userów dodających community photos. Ściana pustych kafelków zabija sens profilu.
Rozwiązanie = trzy dźwignie łącznie, wpięte w Fazy 3 i 6:

### Dźwignia 1 — placeholder jako zaprojektowany obiekt
Rozwinięcie istniejącego fallbacku w [EditionCard.tsx](../../apps/web/src/components/books/EditionCard.tsx)
(`brandGradientStyle` + tytuł serif) do poziomu „wygląda celowo":
- tytuł + autor złożone typograficznie, wordmark/nazwa wydawcy
- kolor z `company.brandColors[0]` lub deterministyczny hash tytułu, tekstura papieru, cień grzbietu
- badge `variantLabel` (już jest)
- cel: ściana kafelków czyta się jak zaprojektowany katalog biblioteki (wzór: Libib / StoryGraph / Bookwyrm)
- czysto front-end, ~80% rozwiązania

### Dźwignia 2 — layout adaptuje się do gęstości zdjęć
- policz udział edycji z realnym zdjęciem w kolekcji
- wysoki → ściana okładek; niski → layout „półki" (grupy serii + paski kompletności, klastry
  wydawców, badge signed/variant, oś czasu nabytków) — gra danymi, które są
- „kolekcja jako obrazek": dużo okładek → mozaika; za mało → karta statystyk w stylu Wrapped

### Dźwignia 3 — podaż, celowana
- **okładka bazowej książki jako warstwa pośrednia** — z Open Library / Google Books (oba już
  w series-discovery); renderowana przygaszona + wstążka „Special edition — no photo yet".
  Rozszerza `resolveEditionCoverRaw` w [editionCover.ts](../../apps/web/src/lib/editionCover.ts) o 3. fallback
- **celowany prompt community photo** — „masz tę edycję, brak zdjęcia — dodaj?" tylko dla
  właścicieli tej konkretnej edycji (nie generyczny nag)
- **outreach o zgody sterowany danymi** — sortuj firmy bez zgody po liczbie posiadanych
  edycji w kolekcjach userów; te gonić najpierw (praca manualna z planu marketingowego)
- **mocki subskrypcji bez grafiki** — kafelek generatywny z brandem boxa + miesiąc/temat;
  „subscription box, art TBA" jako pełnoprawny stan wizualny, nie porażka

## Otwarte wątki produktowe (nie blokują startu, wymagają decyzji)

- (brak — rzadkość okładek rozpisana wyżej)
