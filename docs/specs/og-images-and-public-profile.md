# Spec: OG images + publiczny profil kolekcji

Status: **draft / not started** · Utworzono: 2026-09-06 · Branch docelowy: `development`

Kontekst biznesowy: część strategii pozyskiwania użytkowników LuxGrimoire — blok
"sharing". OG images to warunek wstępny każdego udostępnienia linku; publiczny
profil kolekcji to jednostka treści dla bookstagramu i hak pod referral.

---

## Znaleziska z kodu (stan na 2026-09-06)

- **Web**: Next 15.3 App Router + React 19 → `next/og` (`ImageResponse`) natywnie. `sharp` już w zależnościach.
- **API**: NestJS, dekoratory `@Public()` / `@OptionalAuth()` (`apps/api/src/common/decorators/auth.decorators.ts`),
  `AnalyticsService.track()` fire-and-forget. Istnieje moduł `profile` z `@Public() GET /profile/:username`,
  ale zwraca minimum (`username`, `bio`, `avatarUrl`, `createdAt`, `role`, `_count.bookEntries`).
- **Brak** publicznej strony profilu w web. `robots.ts` blokuje `/profile`.
- **User**: ma `username` (unikalny, format instagramowy 3–30 znaków), `avatarUrl`, `bio`, `displayName`. Brak flagi publiczności.
- **Okładki**: Cloudinary. Prawo do oficjalnej okładki bramkuje `company.hasOfficialImagePermission`
  (wzorzec w `apps/web/src/app/(public)/editions/[slug]/page.tsx:285`) albo zdjęcie community
  `UserEditionImage` ze `status='APPROVED' && consentGiven`.
- **Kolekcja**: `UserBookEntry` (`ownershipStatus='OWNED'`, `isWishlist`, `signatureType`, `readingStatus`, `condition`).
  `collection.service.findAll` zwraca entry z `edition→book→company`. `UserStatsSnapshot.collection`
  (year=0) trzyma policzone statystyki kolekcji.
- **SEO**: `sitemap.ts` ciągnie dane z API `/sitemap/data` (`apps/api/src/modules/sitemap/sitemap.service.ts`),
  shardowany po 45k URL; `robots.ts` musi trzymać ten sam literał `revalidate = 604800`.
- **Weryfikacja** (CLAUDE.md): `tsc --noEmit` + vitest (web ma RTL) + jest (api). Bez przeglądarki.

---

# CZĘŚĆ 1 — OG images

## 1.1 Cel

Każdy link do LuxGrimoire wklejony na Discord / Reddit / X / iMessage renderuje bogatą,
konkretną dla strony kartę podglądu.

## 1.2 Architektura — gdzie kod

Wszystko w `apps/web`, konwencja plikowa App Routera (`opengraph-image.tsx` w folderze route'u —
Next sam wstawia `og:image` + `twitter:image`).

```
apps/web/src/app/
  opengraph-image.tsx                          # generyczna karta brandowa (home + fallback)
  (public)/editions/[slug]/opengraph-image.tsx
  (public)/series/[slug]/opengraph-image.tsx
  (public)/sales-calendar/opengraph-image.tsx
  (public)/u/[username]/opengraph-image.tsx     # profil kolekcji (Część 2)
  _og/
    fonts/                                      # 2 wagi serif + 2 sans (TTF/OTF, licencja OFL!)
    template.tsx                                # wspólny layout karty
    loadFonts.ts                                # fs.readFile -> ArrayBuffer, cache w module scope
    ogImage.ts                                  # helper: new ImageResponse(<Template/>, { width:1200, height:630, fonts })
```

## 1.3 Katalog kart

| Route | Treść karty | Źródło danych |
|---|---|---|
| `/` + fallback | logo + tagline, tło brandowe | statyczne |
| `/editions/[slug]` | okładka (jeśli wolno) + tytuł + wydawca + `variantLabel` badge + badge "Preorder: 3 Oct" jeśli jest najbliższa `EditionSaleDate` | `getEdition(slug)` (jest, `cache()`) |
| `/series/[slug]` | tytuł serii + "N tomów • masz lukę?" + mozaika 3–4 okładek | API serii |
| `/sales-calendar` | "Drops in October 2026" + liczba edycji + 4 miniatury | API kalendarza |
| `/u/[username]` | avatar + `@username` + "47 editions · 12 series complete" + mozaika do 12 okładek | Część 2 |

## 1.4 Implementacja techniczna — pułapki

1. **Runtime**: `export const runtime = 'nodejs'` (żeby użyć `apiFetch`). `export const revalidate = 3600` — karty cache'owane na CDN.
2. **Fonty**: `ImageResponse` nie widzi CSS `@font-face`. Wczytać pliki przez `node:fs/promises` do `ArrayBuffer`, cache w module scope. Fonty z licencją OFL.
3. **Okładki w karcie muszą być rastrem PNG/JPG** — Satori nie zdekoduje webp/avif. NIE używać `f_auto`; wymusić `cloudinaryUrl(id, 'w_360,h_540,c_fill,f_png,q_80')`. Dodać wariant helpera / parametr.
4. **`<img>` w Satori** — tylko absolutny `src`, jawne `width`/`height`, `objectFit` przez styl. Bez `next/image`.
5. **Fallback przy błędzie**: `try/catch` w każdym route → przy braku danych zwróć `<Template>` tekstowy, nigdy nie rzucaj (crawler dostałby 500).
6. **Rozmiar**: 1200×630, `twitter:card = summary_large_image` (już w root layout).

## 1.5 Bramkowanie praw do okładek (compliance — najważniejsze)

```ts
function coverAllowedForOg(edition): string | null {
  const official = edition.additionalImages?.[0]
  if (official && edition.bookBoxCompany?.hasOfficialImagePermission)
    return cloudinaryUrl(official, 'w_360,h_540,c_fill,f_png,q_80')
  const community = edition.communityImages?.find(i => i.status === 'APPROVED' && i.consentGiven)
  if (community) return cloudinaryUrl(community.url, 'w_360,h_540,c_fill,f_png,q_80')
  return null   // -> karta tekstowa albo placeholder "spine"
}
```

W mozaikach (seria, profil, kalendarz) edycje bez prawa do okładki dostają kafelek-placeholder
(kolor z `company.brandColors[0]` + inicjały), nie są pomijane.

## 1.6 Podpięcie meta

Przy konwencji plikowej Next robi to sam. `generateMetadata` w `editions/[slug]/page.tsx` obecnie
ręcznie ustawia `openGraph.images` (linia ~164) — **usunąć tę linię**, żeby nie nadpisywała
auto-wstawionego `opengraph-image`. Zostawić `title`/`description`.

## 1.7 Testy (vitest)

- `ogImage.test.ts` — render każdego template'u z mockiem danych zwraca `Response` 200, `content-type: image/png`, długość > 5 KB.
- `coverAllowedForOg` — tabela przypadków: permission granted / brak / tylko community approved / community pending.
- Snapshot JSX template'u (bez rasteryzacji) dla regresji layoutu.

## 1.8 Checklist

- [ ] `_og/` — fonty (OFL), `loadFonts.ts`, `template.tsx`, `ogImage.ts`
- [ ] `cloudinaryUrl` — wariant `f_png` / parametr
- [ ] `app/opengraph-image.tsx` (generyczna)
- [ ] `editions/[slug]/opengraph-image.tsx` + usunięcie ręcznego `images` z `generateMetadata`
- [ ] `series/[slug]/opengraph-image.tsx`
- [ ] `sales-calendar/opengraph-image.tsx`
- [ ] `coverAllowedForOg` jako współdzielony util
- [ ] testy vitest
- [ ] `tsc --noEmit` czysto

---

# CZĘŚĆ 2 — Publiczny profil kolekcji

## 2.1 Cel

Opt-in, read-only strona `luxgrimoire.com/u/<username>` pokazująca posiadane edycje —
siatka okładek + statystyki. Domyślnie **wyłączona**.

## 2.2 Model danych + migracja

```prisma
model User {
  // ...
  isProfilePublic  Boolean  @default(false)
  profileSettings  Json?     // { showWishlist, showReadingStatus, showSignedBadges, showValueEstimate, hiddenTagIds: string[] }; null = domyślne
}
```

Migracja `packages/database/prisma/migrations/YYYYMMDDHHMMSS_add_public_profile/migration.sql`
(camelCase + double-quotes + guardy — CLAUDE.md):

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS "isProfilePublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "profileSettings" JSONB;
CREATE INDEX IF NOT EXISTS "users_isProfilePublic_idx" ON users ("isProfilePublic") WHERE "isProfilePublic" = true;
```

Feature idzie na `development` (nie dedykowany branch) → migrację od razu zaaplikować do
`luxgrimoire_v2` **i** `luxgrimoire_test` (`prisma db execute` + `migrate resolve --applied` z oboma `DATABASE_URL`).

## 2.3 API — rozszerzenie modułu `profile`

**`GET /profile/:username`** — zmienić na `@OptionalAuth()`:
- rekord nie istnieje → `404`
- `isProfilePublic === false` i viewer ≠ właściciel → `404` (nie zdradzać istnienia)
- właściciel podglądający swój prywatny profil → zwróć z `isOwnerPreview: true`
- rozszerzyć `select` o `displayName`, `isProfilePublic`, `profileSettings`, agregat OWNED

**`GET /profile/:username/collection`** — nowy, `@OptionalAuth()`, paginowany
(`?page=&pageSize=&sort=&series=&signed=`). Projekcja publiczna — tylko:
```
{ id, edition: { slug, variantLabel, book:{title,slug},
  bookBoxCompany:{name,slug,brandColors,hasOfficialImagePermission}, coverUrl },
  signatureType?, readingStatus? (jeśli showReadingStatus), condition? }
```
Filtr `ownershipStatus='OWNED'` (+ `isWishlist=true` osobna sekcja jeśli `showWishlist`).
`hiddenTagIds` wykluczają entry.
**Nigdy**: `basePrice`, `salePrice`, `orderNumber`, `trackingNumbers`, `purchaseGroup`,
`acquiredAt`, `saleNotes`, `subscriptionEntry`, `email`, `shippingCountry`.

**`GET /profile/:username/stats`** — nowy, `@OptionalAuth()`. Projekcja z
`UserStatsSnapshot.collection` (year=0): `{ totalEditions, seriesCount, seriesComplete,
seriesWithGaps, publisherCount, signedCount, valueEstimateEur? }`. `valueEstimateEur`
tylko gdy `profileSettings.showValueEstimate`. **Nigdy** danych wydatkowych.

**`PATCH /profile`** — `UpdateProfileDto` +:
```ts
@IsOptional() @IsBoolean() isProfilePublic?: boolean;
@IsOptional() @IsObject()  profileSettings?: ProfileSettingsDto; // walidowany zagnieżdżony DTO
```

**Analytics** — w `GET /profile/:username` (gdy publiczny i viewer ≠ owner):
```ts
this.analyticsService.track({
  eventType: 'public_profile_view',
  userId: viewer?.id ?? null,
  entityType: 'user', entityId: target.id, entityName: username,
});
```
Dodać `'public_profile_view'` do `SUPPORTED_EVENT_TYPES` w `apps/api/src/modules/analytics/analytics.dto.ts`.

**Testy jest** (`profile.service.spec.ts` już istnieje): prywatny→404 dla obcego,
właściciel→preview, projekcja kolekcji nie przecieka pól wrażliwych (asercja na brak kluczy),
`hiddenTagIds` wyklucza, stats bez `showValueEstimate` nie zawiera `valueEstimateEur`.

## 2.4 Web

```
apps/web/src/app/(public)/u/[username]/
  page.tsx                 # Server Component, export const revalidate = 300
  opengraph-image.tsx      # Część 1
  PublicCollectionGrid.tsx # 'use client' — sort/filtr + infinite scroll do /profile/:username/collection?page=
  not-found.tsx
```

- **`generateMetadata`**: `title: '@'+username`, `description: '${totalEditions} special editions, ${seriesComplete} series complete'`,
  `alternates.canonical = '/u/'+username`. `opengraph-image` wchodzi automatycznie.
- **`page.tsx`**: `cache()`-owany fetch profilu + strona 1 kolekcji + stats. Prywatny / nie istnieje → `notFound()`.
  Render: header (avatar, `@username`, `bio`, "Member since"), pasek statystyk, `<PublicCollectionGrid>`
  (read-only wariant istniejących kart — bez przycisków akcji), sekcja "Series complete / gaps".
- **Owner controls** — w `(private)/profile/page.tsx` nowa zakładka **"Public profile"** (`Tab` type już tam jest):
  przełącznik `isProfilePublic`, pod-przełączniki, lista tagów do ukrycia, "Copy link"
  (`https://luxgrimoire.com/u/<username>`), "Preview", jawny tekst zgody:
  > "Twoja nazwa użytkownika, bio, avatar i edycje, które posiadasz, będą widoczne dla każdego
  > z linkiem oraz w wynikach wyszukiwarek. Ceny, zamówienia, adresy i wydatki nigdy nie są pokazywane."
- **Share button** — `components/share/ShareButton.tsx` (`'use client'`): `navigator.share()` gdy dostępne,
  fallback `clipboard.writeText` + linki intent do X / Bluesky. Na `/u/[username]` i (osobny PR) w powiadomieniach.

## 2.5 Prywatność / zgody (EU, jest `legal_consent_versioning`)

- Domyślnie `false`. Zmiana tylko świadomym przełącznikiem z tekstem zgody.
- Flip `false`: strona zaczyna `404` w ≤ `revalidate` (300 s). Udokumentować opóźnienie w UI.
  Opcjonalnie hook w `PATCH /profile` woła `revalidatePath` przez wewnętrzny endpoint web — v2.
- Okładki bramkowane `coverAllowedForOg` (współdzielony util z Części 1).
- Usunięcie konta: kaskada `onDelete: Cascade` czyści wszystko.
- `displayName` pokazywane tylko jeśli ustawione (opt-in z natury).

## 2.6 SEO

- **`robots.ts`**: dodać `'/u'` do `allow` (zostawić `/profile` w `disallow`).
- **`sitemap.ts` + `apps/api/src/modules/sitemap/sitemap.service.ts`**: rozszerzyć `/sitemap/data`
  o `publicProfiles: { slug: username, updatedAt }[]` (`where isProfilePublic = true`), zmapować
  `mapEntries(baseUrl, data.publicProfiles, 'u', 0.4, 'weekly')`. Literał `revalidate = 604800` zsynchronizowany w obu plikach.
- **JSON-LD** na `/u/[username]`: `ProfilePage` + `ItemList` książek (nice-to-have).

## 2.7 Kolejność wdrożenia (osobne PR-y, każdy commit+push na `development`)

| PR | Zakres | Ryzyko |
|---|---|---|
| **A** | schema (2 pola) + migracja (v2 + test) + `UpdateProfileDto` + zakładka "Public profile" w ustawieniach (toggle działa, brak strony publicznej) | niskie, ship dark |
| **B** | API: `/profile/:username` (OptionalAuth+404), `/profile/:username/collection`, `/stats`, event `public_profile_view` + testy jest | średnie (projekcja pól) |
| **C** | Web `/u/[username]` + `PublicCollectionGrid` + `ShareButton` + `robots.ts` + `sitemap` | średnie |
| **D** | OG images (Część 1) + fonty + `coverAllowedForOg` util | niskie |

Util `coverAllowedForOg` powstaje w PR B i jest reużyty w PR C/D — rozważyć wydzielenie do `packages/shared-types` / web `lib/`.

## 2.8 Otwarte decyzje (do rozstrzygnięcia przed PR A)

1. **Ścieżka**: `/u/<username>` (rekomendacja) vs `/@<username>` vs `/collection/<username>`.
2. **Domyślne pod-przełączniki**: `showReadingStatus` i `showWishlist` — on czy off przy pierwszym włączeniu? (rekomendacja: oba **off**).
3. **"Collection worth ~EUR X"** — pokazywać szacunkową wartość kolekcji z `EditionStatsSnapshot.saleStats`? (rekomendacja: opt-in, domyślnie off).
4. **Indeksacja**: profile w sitemapie (rekomendacja) czy tylko link-to-share z `noindex`?
5. **Zmiana username** psuje stare linki — tablica przekierowań starych nazw? (rekomendacja: poza zakresem v1).
