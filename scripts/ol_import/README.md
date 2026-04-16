# OL Import — Open Library bulk import for LuxGrimoire

Skrypt streamuje dane z Open Library bezpośrednio do PostgreSQL.  
Nie zapisuje plików na dysku — cały dump przechodzi przez RAM.

---

## Wymagania wstępne

### Python (jeśli nie masz)

1. Pobierz z https://www.python.org/downloads/  
   (wybierz wersję 3.10 lub nowszą)
2. Podczas instalacji **zaznacz "Add Python to PATH"**
3. Po instalacji zrestartuj terminal i sprawdź:
   ```powershell
   python --version
   ```

---

## Jednorazowa instalacja zależności

```powershell
cd scripts\ol_import
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

---

## Konfiguracja bazy

Skrypt korzysta ze zmiennych środowiskowych (lub domyślnych wartości):

| Zmienna      | Domyślna    | Opis                  |
|--------------|-------------|-----------------------|
| DB_HOST      | localhost   | host PostgreSQL       |
| DB_PORT      | 5432        | port                  |
| DB_NAME      | luxgrimoire | nazwa bazy            |
| DB_USER      | postgres    | użytkownik            |
| DB_PASSWORD  | postgres    | hasło                 |

Ustaw hasło przed uruchomieniem (w PowerShell):

```powershell
$env:DB_PASSWORD = "twoje_haslo"
```

---

## Uruchamianie

Zawsze najpierw aktywuj środowisko wirtualne:

```powershell
cd scripts\ol_import
.venv\Scripts\activate
```

### Import startowy (jednorazowy)

```powershell
python import_ol.py init
```

Pobiera:
- `ol_dump_authors_latest.txt.gz` (~0.5 GB)
- `ol_dump_works_latest.txt.gz` (~2.9 GB)

Filtruje:
- Język angielski (lub brak tagu języka = domyślnie angielski)
- Rok publikacji ≥ 1980
- Ma tytuł i co najmniej jednego autora

**Szacowany czas: 20–60 minut** (zależy od łącza).

### Miesięczna aktualizacja

```powershell
python import_ol.py diff
```

Przetwarza ten sam dump, ale pomija rekordy których `ol_modified`
nie jest nowszy niż data ostatniego importu.  
**Szacowany czas: 5–15 minut.**

### Dry run (bez zapisu — sprawdź ile rekordów pasuje)

```powershell
python import_ol.py init --dry-run
```

### Opcje dodatkowe

```powershell
python import_ol.py init --skip-authors   # pomiń dump autorów
python import_ol.py init --skip-works     # pomiń dump dzieł (przydatne przy rerunie)
```

---

## Tabele tworzone w bazie

| Tabela           | Opis                                                              |
|------------------|-------------------------------------------------------------------|
| `ol_author`      | Autorzy z OL; `author_id` do ręcznego powiązania z `author.id`   |
| `ol_book`        | Tytuły z OL; `book_id` do powiązania z `book.id`                 |
| `ol_book_author` | Relacja autor–tytuł (wiele do wielu)                              |
| `ol_import_log`  | Historia uruchomień; używana przez tryb `diff`                    |

---

## Oczekiwane wyniki

| Co               | Szacunek         |
|------------------|------------------|
| Autorzy          | 500k – 1M        |
| Tytuły           | 2M – 4M          |
| Rozmiar w DB     | ~1–1.5 GB total  |
| Wpływ na app     | zero (osobne tabele) |

---

## Powiązanie z istniejącymi danymi

Po imporcie:
- `ol_author.author_id` — można uzupełnić przez panel admina ("Połącz z OL")  
- `ol_book.book_id` — uzupełnia się automatycznie gdy admin tworzy `Book` z katalogu  
- Dopóki pola są `NULL`, rekordy OL są tylko katalogiem referencyjnym

---

## Miesięczna aktualizacja (automatyczna — Windows Task Scheduler)

1. Otwórz **Task Scheduler** → Create Basic Task
2. Trigger: Monthly, 1. dzień miesiąca, godzina 03:00
3. Action: Start a program
   - Program: `C:\Users\renat\Documents\luxgrimoire\scripts\ol_import\.venv\Scripts\python.exe`
   - Arguments: `import_ol.py diff`
   - Start in: `C:\Users\renat\Documents\luxgrimoire\scripts\ol_import`


Skrypt streamuje dane z Open Library bezpośrednio do PostgreSQL.  
Nie zapisuje plików na dysku — cały dump przechodzi przez RAM.

---

## Jednorazowa instalacja

```bash
cd scripts/ol_import
python -m venv .venv

# Windows:
.venv\Scripts\activate
# Linux/Mac:
source .venv/bin/activate

pip install -r requirements.txt
```

---

## Konfiguracja bazy

Skrypt korzysta ze zmiennych środowiskowych (lub domyślnych wartości):

| Zmienna      | Domyślna    | Opis                  |
|--------------|-------------|-----------------------|
| DB_HOST      | localhost   | host PostgreSQL       |
| DB_PORT      | 5432        | port                  |
| DB_NAME      | luxgrimoire | nazwa bazy            |
| DB_USER      | postgres    | użytkownik            |
| DB_PASSWORD  | postgres    | hasło                 |

Możesz ustawić je tymczasowo przed uruchomieniem:

```bash
# Windows PowerShell:
$env:DB_PASSWORD = "twoje_haslo"

# Linux/Mac:
export DB_PASSWORD=twoje_haslo
```

---

## Uruchamianie

### Import startowy (jednorazowy)

```bash
python import_ol.py init
```

Pobiera:
- `ol_dump_authors_latest.txt.gz` (~0.5 GB)
- `ol_dump_works_latest.txt.gz` (~2.9 GB)

Filtruje:
- Język angielski (lub brak tagu języka = domyślnie angielski)
- Rok publikacji ≥ 1980
- Ma tytuł i co najmniej jednego autora

**Szacowany czas: 20–60 minut** (zależy od łącza).

### Miesięczna aktualizacja

```bash
python import_ol.py diff
```

Przetwarza ten sam dump, ale pomija rekordy, których `ol_modified`
nie jest nowszy niż data ostatniego importu.  
**Szacowany czas: 5–15 minut.**

### Dry run (bez zapisu)

```bash
python import_ol.py init --dry-run
```

Liczy pasujące rekordy bez żadnego zapisu do bazy.

### Opcje dodatkowe

```bash
python import_ol.py init --skip-authors   # pomiń dump autorów
python import_ol.py init --skip-works     # pomiń dump dzieł
```

---

## Tabele tworzone w bazie

| Tabela          | Opis                                                        |
|-----------------|-------------------------------------------------------------|
| `ol_author`     | Autorzy z OL; pole `author_id` do ręcznego powiązania z `author.id` |
| `ol_book`       | Tytuły z OL; pole `book_id` do powiązania z `book.id`       |
| `ol_book_author`| Relacja autor–tytuł (wiele do wielu)                        |
| `ol_import_log` | Historia uruchomień; używana przez tryb `diff`              |

---

## Oczekiwane wyniki

| Co               | Szacunek         |
|------------------|------------------|
| Autorzy          | 500k – 1M        |
| Tytuły           | 2M – 4M          |
| Rozmiar w DB     | ~1–1.5 GB total  |
| Wpływ na app     | zero (osobne tabele) |

---

## Powiązanie z istniejącymi danymi

Po imporcie:
- `ol_author.author_id` można uzupełnić przez panel admina (wyszukaj autor → "Połącz z OL")  
- `ol_book.book_id` uzupełnia się automatycznie, gdy admin tworzy `Book` z katalogu OL  
- Dopóki pola są `NULL`, rekordy OL są tylko katalogiem referencyjnym

---

## Miesięczna aktualizacja (automatyczna)

Możesz dodać do harmonogramu systemowego:

```bash
# Windows Task Scheduler — uruchamiaj raz w miesiącu:
python C:\...\scripts\ol_import\import_ol.py diff

# Linux cron (1. dzień miesiąca, godzina 3:00):
0 3 1 * * cd /path/to/scripts/ol_import && .venv/bin/python import_ol.py diff
```
