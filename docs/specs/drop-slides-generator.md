# Drop Slides Generator — admin, generowanie kart zapowiedzi z danych aplikacji

Status: **draft / not started** · Utworzono: 2026-09-06 · Branch docelowy: `development`

Punkt wyjścia: prototyp-artefakt „Drop Calendar Slides" (ręcznie wklejany tekst →
karuzela 1080×1080 na Instagram: slajd okładkowy + slajd per drop + slajd CTA,
eksport PNG). Ten dokument planuje przeniesienie tego do panelu admina z danymi
ciągniętymi wprost z kalendarza sprzedaży zamiast ręcznego wpisywania.

Powiązania z [growth-roadmap.md](growth-roadmap.md): buduje infrastrukturę
`_og/` (fonty OFL + `loadFonts.ts` + `template.tsx`) potrzebną w **Fazie 2**
(OG images) i **Fazie 6** (kolekcja jako obrazek).

---

## 1. Zakres v1

**Jest:**
- Strona `/admin/marketing/drop-slides` — **tylko ADMIN** (nie moderator, nie company-manager).
- Wybór miesiąca (+ opcjonalny filtr firmy, + region) → tabela dropów wypełniona
  z danych aplikacji, każde pole edytowalne inline przed eksportem.
- Podgląd karuzeli (filmstrip przeskalowanych slajdów) + eksport prawdziwych
  PNG 1080×1080 (slajd okładkowy, slajd per drop, slajd CTA).
- „Kopiuj opis" — gotowy tekst posta/newslettera z tej samej listy + hashtagi.

**Nie ma (świadomie odłożone):**
- Drag-reorder slajdów, zapisywanie „zestawów slajdów" do DB.
- Harmonogram / publikacja wprost na social media.
- Warianty rozmiaru inne niż 1080² (story 1080×1920 — ewentualnie później).
- Dostęp dla moderatora.

---

## 2. Model danych — skąd biorą się dropy

Źródło: `SaleTier` (per `announcement` + `region`), tak jak
`announcements.service.ts → getCalendarTiers()`. Nowa metoda serwisu robi to samo
okno miesięczne, ale z szerszym `select` i **deduplikacją do jednego dropu na
(announcement, region)** — slajd opisuje sprzedaż, nie pojedynczy tier.

Kształt jednego dropu (`ApiDropSlide`, dodać do `@luxgrimoire/shared-types`):

| pole      | źródło |
|-----------|--------|
| `title`   | `SaleAnnouncement.title` |
| `pub`     | `company.name` |
| `status`  | derywacja (sekcja 3) |
| `when`    | najbliższy nadchodzący `SaleTier` dla (sale, region): `"{tier.name} · {data}"`; dla `live`: `"On sale now · ends {data}"` gdy `endsAt` |
| `price`   | `region.basePrice ?? announcement.basePrice` + `currency`; opcjonalnie `· {subscriberBasePrice} subs` |
| `detail`  | liczba/nazwy edycji (`"3 editions"` albo tytuł pojedynczej) lub `expectedShipping` |
| `counter` | `"01 / 06"` — index w posortowanej liście miesiąca |
| `regionName` | `region.name` gdy sprzedaż wieloregionowa |
| `href`    | `/sale-announcements/{id}` (do CTA / opisu, nie na slajd) |

Odpowiedź endpointu:
`{ year, month, monthLabel, dateRange, drops: ApiDropSlide[] }`
gdzie `dateRange` = min–max daty tierów w miesiącu (na slajd okładkowy).

## 3. Derywacja statusu (serwer)

Zgodnie z semantyką pól schematu i tokenami slajdu (`preorder` teal / `live`
zielony / `restock` blady slate / `ending` łosoś). Precedencja:

1. `ending` — `announcement.endsAt` ustawione i za ≤ 7 dni.
2. `restock` — którakolwiek `SaleAnnouncementEdition.isReprint === true`
   **lub** `saleType === 'OVERSTOCK'`.
3. `live` — najbliższy tier `date <= now` i (`endsAt` null lub `> now`),
   albo `availableForPurchase === true`.
4. `preorder` — ma tier w przyszłości (domyślny).

Testy jest (wzór „non-LLM paths"): reprint → `restock`; przeszły tier + otwarte
`endsAt` → `live`; `endsAt` za 3 dni → `ending`; sam przyszły tier → `preorder`;
`price` bierze `region` przed `announcement`.

## 4. Backend — zadania

- `announcements.dto.ts`: `DropSlidesQueryDto extends YearMonthQueryDto`
  (`companyId?`, `regionId?`).
- `announcements.service.ts`: `getDropSlideData(year, month, opts)` — jeden
  `saleTier.findMany` (okno miesiąca jak w `getCalendarTiers`), `select`
  poszerzony o `announcement.{basePrice, subscriberBasePrice, currency, endsAt,
  saleType, availableForPurchase, expectedShipping}`,
  `announcement.editions → { isReprint, edition: { book: { title } } }`,
  `region.{name, basePrice, currency}`. Dedup (announcement, region) → mapowanie
  na `ApiDropSlide` + `status`/`when`/`price`/`detail`/`counter`.
  Cache jak istniejący `CALENDAR_TIERS_TTL` (ten sam bust-key — dane te same).
- `announcements.controller.ts`:
  `@Get('admin/drop-slides') @Roles('ADMIN') @ApiBearerAuth()`.
- Analytics: opcjonalnie `admin_drop_slides_export` w `SUPPORTED_EVENT_TYPES`
  (niski priorytet — pominąć jeśli nie chcemy szumu).
- Jest: `announcements.drop-slides.spec.ts` (sekcja 3).

## 5. Renderowanie slajdów — decyzja architektoniczna

**Rekomendacja: `next/og` `ImageResponse` (Satori), jeden komponent JSX
współdzielony przez podgląd i route.** Powód: prawdziwe, powtarzalne,
pobieralne PNG bez kruchej biblioteki DOM-capture (`html2canvas`/`html-to-image`
krztuszą się dokładnie tym, czego używa prototyp — `color-mix`, `radial-gradient`
w skrócie `background`, web-fonty), i to jest ta sama infra co Faza 2 roadmapy.

Konsekwencja: komponent slajdu pisany od razu w podzbiorze CSS akceptowanym przez
Satori (tylko flexbox, `backgroundImage` z jawnym gradientem, brak `color-mix` —
kolory rozwinąć do stałych hexów, fonty ładowane jako `ArrayBuffer`).

Alternatywa (odrzucona): port builderów `coverSlide`/`dropSlide`/`ctaSlide` do
React + `html-to-image` po stronie klienta. Szybsza iteracja WYSIWYG, zero kosztu
serwera, ale ryzyko wierności rasteryzacji i konieczność bramkowania na
`document.fonts.ready`. Zostawić jako plan B, gdyby Satori za bardzo ograniczał
layout.

### Bramkowanie route'a OG

Obrazy to materiały marketingowe docelowo publiczne (Instagram), a route renderuje
tylko tekst z query-paramów w szablon — jak każdy `opengraph-image.tsx`. Plan:
**route OG zostaje otwarty** (czysty szablon), a bramkowane są: strona admina
(layout `(admin)` + realnie `@Roles('ADMIN')` na endpoincie danych). Jeśli
później uznamy to za zbyt luźne — dołożyć podpis HMAC paramów.

## 6. Frontend — zadania

- `apps/web/src/app/(admin)/admin/marketing/drop-slides/page.tsx` (`'use client'`)
  — kontrolki (stepper miesiąca, `MultiSelect` firm, select regionu, toggle
  „cover"/„CTA"), edytowalna tabela dropów, filmstrip podglądu, siatka eksportu
  PNG (`<img src=".../og?...">` per slajd + linki „pobierz" / „pobierz wszystko"
  jako zip przez `client-zip`), przyciski „Kopiuj opis" / „Kopiuj hashtagi".
  Responsywnie: kontrolki w kolumnie na mobile, tabela z poziomym scrollem,
  filmstrip `overflow-x-auto` (wzorzec z `globals.css` `scrollbar-none`).
- `apps/web/src/components/admin/drop-slides/DropSlide.tsx` — jeden JSX,
  `variant: 'cover' | 'drop' | 'cta'`, style inline w podzbiorze Satori. Używany
  i w podglądzie (opakowany w `transform: scale()`), i w route OG.
- `apps/web/src/components/admin/drop-slides/slideData.ts` — typy + `buildCaption(drops)`
  + `buildHashtags()` + mapowanie `status → label`.
- `apps/web/src/app/(admin)/admin/marketing/drop-slides/og/route.tsx` —
  `ImageResponse`, `size 1080×1080`, fonty z `_og/loadFonts`, renderuje `<DropSlide>`.
- `apps/web/src/app/_og/` — **nowa, współdzielona infra**: `fonts/` (Cinzel +
  Crimson Text, OFL, woff2/ttf), `loadFonts.ts` (odczyt `fs` w route). Faza 2
  roadmapy to przejmuje.
- Logo: `/logo-light-text.png` (już w `public/`) — bez base64.
- Nawigacja: nowa grupa `{ heading: 'Marketing', items: [...] }` **tylko w
  `ADMIN_GROUPS`** w [layout.tsx](../../apps/web/src/app/(admin)/layout.tsx),
  pozycja `{ href: '/admin/marketing/drop-slides', label: 'Drop Slides', icon: Images }`.
- `@luxgrimoire/shared-types`: `ApiDropSlide`, `ApiDropSlideData`.
- Vitest: `buildCaption` / `status → label` / `DropSlide` renderuje każdy wariant (RTL).

## 7. Weryfikacja (bez przeglądarki — CLAUDE.md)

- `pnpm --filter @luxgrimoire/api exec tsc --noEmit` + `pnpm --filter web exec tsc --noEmit`
- jest: `announcements.drop-slides.spec.ts`
- vitest: testy `slideData` + `DropSlide`
- Ręczny smoke route OG: `curl -o s.png '.../admin/marketing/drop-slides/og?variant=drop&title=Test&...'`
  → plik `image/png` 1080×1080 (jedyny krok, gdzie renderujemy realnie).

## 8. Otwarte decyzje (rekomendacja = pierwsza)

1. **Ścieżka renderu**: `next/og` / Satori  ·  vs  klient + `html-to-image`.
2. **Bramka route'a OG**: otwarty szablon  ·  vs  route handler z sesją.
3. **Umiejscowienie w nawigacji**: nowa grupa „Marketing" w `ADMIN_GROUPS`  ·  vs
   pod istniejącą „Catalogue".
4. **Wieloregionowość**: v1 tylko region domyślny + selektor dla reszty  ·  vs
   slajd per region od razu.
5. **Zakres eksportu**: PNG + kopiuj-opis  ·  vs  od razu też story 1080×1920.
6. **`admin_drop_slides_export`** jako event analityki — tak / nie.
