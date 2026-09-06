# Drop Slides Generator — admin, karty zapowiedzi na najbliższy tydzień

Status: **draft / not started** · Utworzono: 2026-09-06 · Branch docelowy: `development`

Punkt wyjścia: prototyp-artefakt „Drop Calendar Slides" (ręcznie wklejany tekst →
karta 1080×1080 na Instagram, eksport PNG). Ten dokument planuje przeniesienie
tego do panelu admina z danymi ciągniętymi wprost z ogłoszeń sprzedaży.

Powiązania z [growth-roadmap.md](growth-roadmap.md): buduje infrastrukturę
`_og/` (fonty OFL + `loadFonts.ts` + `template.tsx`) potrzebną w **Fazie 2**
(OG images) i **Fazie 6** (kolekcja jako obrazek).

---

## 1. Przepływ

Niedziela wieczór. Admin wchodzi na `/admin/marketing/drop-slides` (**tylko ADMIN**).

1. Dwa pola dat `od` / `do` — domyślnie **najbliższy pełny tydzień**
   (poniedziałek 00:00 → niedziela 23:59). Admin może zmienić oba końce.
2. „Generuj" → zaciąga **wszystkie sales startujące lub live** w tym zakresie
   (sekcja 2).
3. **Jeden slajd 1080×1080 na każdego salea** z tego tygodnia (sekcja 3).
   Opcjonalnie slajd okładkowy z zakresem tygodnia **na początku** oraz
   slajd zamykający **o tym samym layoucie co okładkowy** na końcu karuzeli
   (wspólny toggle „okładka + zamknięcie").
4. Podgląd (filmstrip przeskalowanych slajdów) → eksport PNG + „Kopiuj opis".

**Bez filtra firmy i regionu** — zakres dat to jedyne wejście.

## 2. Które sales trafiają do karuzeli

Dedup po `SaleAnnouncement`. Sale wchodzi, jeśli:

- **startuje**: ma `SaleTier.date` w `[from, to]`, **lub**
- **live**: najwcześniejszy `SaleTier.date <= to` i (`endsAt` null lub `endsAt >= from`).

Slajdy sortowane rosnąco po dacie startu (najwcześniejszy tier w zakresie; a gdy
sale jest tylko „live" i nie startuje w oknie — po najwcześniejszym tierze ogólnie).

`status` (`starting` / `live`) niesiony w odpowiedzi — do sortowania i do opisu,
nie na slajd.

## 3. Zawartość slajdu (jeden per sale)

- **Badge** = `saleType` → etykieta:
  `LIMITED_PREORDER` → „Limited preorder", `OPEN_PREORDER` → „Open preorder",
  `OVERSTOCK` → „Overstock", `SALE` → „Sale".
- **Znacznik reprintu** (osobno, nie badge) — z `SaleAnnouncementEdition.isReprint`:
  - brak reprintów → nic
  - wszystkie edycje salea to reprint → „Reprint"
  - część edycji → „Reprint: {tytuły tych edycji}"
- **Nazwa firmy** (`company.name`) — mniejsza, nad tytułem.
- **Nazwa salea** (`title`) — duża.
- **Pod spodem — wiersze dat**:
  - sale **z regionami**: jeden wiersz na region →
    `{nazwa regionu} · {data} {godzina} · {cena}`
  - sale **bez regionów**: jeden wiersz, **bez nazwy regionu** →
    `{data} {godzina} · {cena}`
  - `cena` = `region.basePrice ?? announcement.basePrice` + `currency`
    (opcjonalnie `· {subscriberBasePrice} subs`)
  - `data {godzina}` = najwcześniejszy tier tego regionu wpadający w zakres
    (gdy żaden nie wpada — najwcześniejszy tier tego regionu); strefa z
    `region.saleTimezone` / `announcement.saleTimezone`
  - jeśli region ma kilka istotnych tierów (First Access + General Sale itd.) —
    patrz otwarta decyzja #2
- **Stopka slajdu**: logo aplikacji (`/logo-light-text.png`, bez base64) +
  tekst `luxgrimoire.com`.

## 4. Backend — zadania

- `announcements.dto.ts`: `DropSlidesRangeQueryDto` — `from` (ISO date),
  `to` (ISO date); walidacja `from <= to`, zakres `<= 31 dni`.
- `announcements.service.ts`: `getDropSlidesForRange(from, to)` —
  `saleAnnouncement.findMany` z `where` łączącym „startuje" i „live" (sekcja 2),
  `include`: `tiers` (+`region`), `editions` (+`edition.book.title`), `regions`,
  `company`. Zbudowanie struktury per-sale: badge, znacznik reprintu, wiersze
  regionów (z fallbackiem ceny region→announcement i wyborem tieru startowego),
  `status`. Cache: ten sam bust-key co `getCalendarTiers` (te same dane bazowe).
- `announcements.controller.ts`:
  `@Get('admin/drop-slides') @Roles('ADMIN') @ApiBearerAuth()`,
  query = `DropSlidesRangeQueryDto`.
- Jest `announcements.drop-slides.spec.ts`: dobór sales na krawędziach zakresu
  (starting vs live), reguły reprintu (0 / wszystkie / część → tytuły),
  wiersze regionów (z regionami vs bez), fallback ceny, wybór tieru startowego.

## 5. Renderowanie slajdów — decyzja architektoniczna

**Rekomendacja: `next/og` `ImageResponse` (Satori), jeden komponent JSX
współdzielony przez podgląd i route.** DOM-capture (`html2canvas` /
`html-to-image`) krztusi się dokładnie tym, czego używa prototyp — `color-mix`,
`radial-gradient` w skrócie `background`, web-fonty. `next/og` daje prawdziwe,
powtarzalne, pobieralne PNG i jest tą samą infrą co Faza 2 roadmapy.

Konsekwencja: komponent slajdu pisany w podzbiorze CSS akceptowanym przez Satori
(tylko flexbox, `backgroundImage` z jawnym gradientem, brak `color-mix` — kolory
rozwinąć do stałych hexów, fonty ładowane jako `ArrayBuffer`).

Route OG renderuje tylko tekst z query-paramów w szablon — jak każdy
`opengraph-image.tsx` — więc **zostaje otwarty**; bramkowane są strona admina
(`(admin)` layout) i endpoint danych (`@Roles('ADMIN')`).

Plan B (odrzucony, do odkurzenia gdyby Satori za bardzo ograniczał layout):
port builderów slajdu do React + `html-to-image` po stronie klienta,
z bramkowaniem na `document.fonts.ready`.

## 6. Frontend — zadania

- `apps/web/src/app/(admin)/admin/marketing/drop-slides/page.tsx` (`'use client'`)
  — dwa date-pickery (domyślnie najbliższy pon–niedz), „Generuj", toggle
  „slajd okładkowy", edytowalna tabela (pola tekstowe per slajd, żeby dopieścić
  copy przed eksportem), filmstrip podglądu, siatka eksportu PNG
  (`<img src=".../og?...">` + „pobierz" / „pobierz wszystko" jako zip przez
  `client-zip`), „Kopiuj opis" + „Kopiuj hashtagi". Responsywnie: kontrolki
  w kolumnie na mobile, tabela i filmstrip w poziomym scrollu
  (`overflow-x-auto`, `scrollbar-none` z `globals.css`).
- `apps/web/src/components/admin/drop-slides/DropSlide.tsx` — warianty
  `sale` i `cover` (ten sam `cover` renderowany jako pierwszy i jako ostatni
  slajd; ostatni może dostać linię CTA `luxgrimoire.com/sales-calendar`),
  style inline w podzbiorze Satori; używany i w podglądzie
  (opakowany w `transform: scale()`), i w route OG.
- `apps/web/src/components/admin/drop-slides/slideData.ts` — typy +
  `buildCaption(slides)` + `buildHashtags()` + `saleType → label` + reguły reprintu.
- `apps/web/src/app/(admin)/admin/marketing/drop-slides/og/route.tsx` —
  `ImageResponse`, `size 1080×1080`, fonty z `_og/loadFonts`, renderuje `<DropSlide>`.
- `apps/web/src/app/_og/` — **nowa współdzielona infra**: `fonts/` (Cinzel +
  Crimson Text, OFL), `loadFonts.ts` (odczyt `fs` w route). Faza 2 roadmapy przejmuje.
- Logo: `/logo-light-text.png` z `public/`.
- Nawigacja: nowa grupa `{ heading: 'Marketing', items: [...] }` **tylko
  w `ADMIN_GROUPS`** w [layout.tsx](../../apps/web/src/app/(admin)/layout.tsx),
  pozycja `{ href: '/admin/marketing/drop-slides', label: 'Drop Slides', icon: Images }`.
- `@luxgrimoire/shared-types`: `ApiDropSlide`, `ApiDropSlideRow`, `ApiDropSlidesResponse`.
- Vitest: `buildCaption`, `saleType → label`, reguły reprintu, `DropSlide`
  renderuje każdy wariant (RTL).

## 7. Weryfikacja (bez przeglądarki — CLAUDE.md)

- `pnpm --filter @luxgrimoire/api exec tsc --noEmit` + `pnpm --filter web exec tsc --noEmit`
- jest: `announcements.drop-slides.spec.ts`
- vitest: `slideData` + `DropSlide`
- Jedyny realny render: `curl -o s.png '.../admin/marketing/drop-slides/og?variant=sale&title=Test&...'`
  → `image/png` 1080×1080.

## 8. Otwarte decyzje (rekomendacja = pierwsza)

1. **Domyślny zakres**: najbliższy pełny tydzień pon–niedz  ·  vs  dziś + 7 dni.
2. **Wiersze regionów przy kilku tierach**: jeden wiersz na region, `data` =
   najwcześniejszy tier w zakresie  ·  vs  rozwijać wszystkie tiery
   (First Access / Early Access / General Sale) jako podwiersze `{nazwa} {data} {godz.}`.
3. **Okładka + slajd zamykający** (ten sam layout, na początku i na końcu):
   opcjonalny toggle, domyślnie włączony  ·  vs  bez nich (tylko slajdy per sale).
   Slajd zamykający: ten sam layout co okładka + linia CTA
   `luxgrimoire.com/sales-calendar`  ·  vs  identyczny 1:1 z okładką.
4. **Ścieżka renderu**: `next/og` / Satori  ·  vs  klient + `html-to-image`.
5. **„Kopiuj opis"** (tekst posta z tej samej listy) — zostaje  ·  vs  tylko PNG.
