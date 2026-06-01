import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type ReadingStatus = 'READ' | 'READING' | 'DNF' | 'UNREAD';

interface ParsedRow {
  title: string;
  authors: string[];
  readingStatus: ReadingStatus;
  /** One entry per read-through; multiple = re-reads */
  readPeriods: { startedAt: Date | null; finishedAt: Date | null; isDnf: boolean }[];
}

export interface MatchedBook {
  title: string;
  authors: string[];
  readingStatus: ReadingStatus;
  /** One entry per read-through (re-reads produce multiple) */
  readPeriods: { startedAt: string | null; finishedAt: string | null; isDnf: boolean }[];
  entryIds: string[];
  editionSlugs: string[];
}

export interface ImportPreview {
  format: 'storygraph' | 'goodreads';
  total: number;
  matched: MatchedBook[];
  unmatched: { title: string; authors: string[] }[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

// Minimal but correct quoted-CSV parser (handles escaped double-quotes "")
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = parseCsvLine(lines[0] ?? '');
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });
    rows.push(row);
  }
  return { headers, rows };
}

function parseDate(raw: string): Date | null {
  const m = raw?.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
}

function detectFormat(headers: string[]): 'storygraph' | 'goodreads' | null {
  const h = new Set(headers.map((x) => x.toLowerCase()));
  if (h.has('read status') && h.has('authors')) return 'storygraph';
  if (h.has('exclusive shelf') && h.has('author')) return 'goodreads';
  return null;
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseStoryGraph(rows: Record<string, string>[]): ParsedRow[] {
  return rows
    .map((row): ParsedRow | null => {
      const title = row['Title']?.trim();
      if (!title) return null;
      const authorsRaw = row['Authors']?.trim() ?? '';
      const authors = authorsRaw
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      const status = row['Read Status']?.trim().toLowerCase();

      let readingStatus: ReadingStatus = 'UNREAD';
      let isDnf = false;
      if (status === 'read') readingStatus = 'READ';
      else if (status === 'currently-reading') readingStatus = 'READING';
      else if (status === 'did-not-finish') {
        readingStatus = 'DNF';
        isDnf = true;
      }

      // Parse all date ranges from "Dates Read" — each range = one read-through (re-reads)
      // StoryGraph separates ranges with "| " or ", "
      const datesRead = row['Dates Read']?.trim();
      let readPeriods: { startedAt: Date | null; finishedAt: Date | null; isDnf: boolean }[] = [];

      if (datesRead) {
        const rawRanges = datesRead.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
        readPeriods = rawRanges.map((range, idx) => {
          const rangeMatch = range.match(/^(\d{4}\/\d{2}\/\d{2})-(\d{4}\/\d{2}\/\d{2})$/);
          if (rangeMatch) {
            return {
              startedAt: parseDate(rangeMatch[1]),
              finishedAt: parseDate(rangeMatch[2]),
              // Only mark the most-recent (first in list) period as DNF
              isDnf: isDnf && idx === 0,
            };
          }
          // Single date — treat as finish date only
          const singleDate = parseDate(range);
          return {
            startedAt: null,
            finishedAt: singleDate,
            isDnf: isDnf && idx === 0,
          };
        });
      }

      // Fallback: if no Dates Read but there is a Last Date Read
      if (readPeriods.length === 0 && readingStatus !== 'UNREAD') {
        const finishedAt = parseDate(row['Last Date Read'] ?? '');
        readPeriods = [{ startedAt: null, finishedAt, isDnf }];
      }

      // For READING status, ensure at least one open period exists
      if (readingStatus === 'READING' && readPeriods.length === 0) {
        readPeriods = [{ startedAt: null, finishedAt: null, isDnf: false }];
      }

      return { title, authors, readingStatus, readPeriods };
    })
    .filter((r): r is ParsedRow => r !== null);
}

function parseGoodreads(rows: Record<string, string>[]): ParsedRow[] {
  return rows
    .map((row): ParsedRow | null => {
      const title = row['Title']?.trim();
      if (!title) return null;
      const primaryAuthor = row['Author']?.trim() ?? '';
      const additionalRaw = row['Additional Authors']?.trim() ?? '';
      const authors = [primaryAuthor, ...additionalRaw.split(',').map((a) => a.trim())].filter(Boolean);
      const shelf = row['Exclusive Shelf']?.trim().toLowerCase();

      let readingStatus: ReadingStatus = 'UNREAD';
      let isDnf = false;
      if (shelf === 'read') readingStatus = 'READ';
      else if (shelf === 'currently-reading') readingStatus = 'READING';
      else if (shelf === 'did-not-finish') {
        readingStatus = 'DNF';
        isDnf = true;
      }

      const finishedAt = parseDate(row['Date Read'] ?? '');
      // Goodreads does not provide start date
      const readPeriods = readingStatus !== 'UNREAD'
        ? [{ startedAt: null, finishedAt, isDnf }]
        : [];
      return { title, authors, readingStatus, readPeriods };
    })
    .filter((r): r is ParsedRow => r !== null);
}

type EntryInfo = {
  id: string;
  readingStatus: string;
  editionSlug: string;
  bookTitle: string;
  authorNames: string[];
};

@Injectable()
export class ReadingImportService {
  constructor(private readonly prisma: PrismaService) {}

  private parseRows(csvContent: string): { format: 'storygraph' | 'goodreads'; rows: ParsedRow[] } {
    const { headers, rows } = parseCsv(csvContent);
    const format = detectFormat(headers);
    if (!format) throw new Error('Unrecognized CSV format. Please upload a Goodreads or StoryGraph export.');
    const parsed = format === 'storygraph' ? parseStoryGraph(rows) : parseGoodreads(rows);
    return { format, rows: parsed };
  }

  private async getUserEntryMap(userId: string): Promise<Map<string, EntryInfo[]>> {
    const entries = await this.prisma.userBookEntry.findMany({
      where: { userId, isWishlist: false },
      select: {
        id: true,
        readingStatus: true,
        book: {
          select: {
            title: true,
            authors: { select: { author: { select: { name: true } } } },
          },
        },
        edition: { select: { slug: true } },
      },
    });

    const map = new Map<string, EntryInfo[]>();
    for (const e of entries) {
      const normTitle = normalise(e.book.title);
      const authorNames = e.book.authors.map((a) => a.author.name);
      if (!map.has(normTitle)) map.set(normTitle, []);
      map.get(normTitle)!.push({
        id: e.id,
        readingStatus: e.readingStatus,
        editionSlug: e.edition?.slug ?? '',
        bookTitle: e.book.title,
        authorNames,
      });
    }
    return map;
  }

  private matchRows(
    parsedRows: ParsedRow[],
    entryMap: Map<string, EntryInfo[]>,
  ): { matched: MatchedBook[]; unmatched: { title: string; authors: string[] }[] } {
    const matched: MatchedBook[] = [];
    const unmatched: { title: string; authors: string[] }[] = [];
    const actionable = parsedRows.filter((r) => r.readingStatus !== 'UNREAD');

    for (const row of actionable) {
      const normTitle = normalise(row.title);
      const candidates = entryMap.get(normTitle);
      if (!candidates || candidates.length === 0) {
        unmatched.push({ title: row.title, authors: row.authors });
        continue;
      }

      // Author match: at least one CSV author overlaps at least one entry author (substring)
      const normCsvAuthors = row.authors.map(normalise);
      const entryAuthors = candidates[0].authorNames.map(normalise);
      const authorMatch =
        row.authors.length === 0 ||
        normCsvAuthors.some((ca) => entryAuthors.some((ea) => ea.includes(ca) || ca.includes(ea)));

      if (!authorMatch) {
        unmatched.push({ title: row.title, authors: row.authors });
        continue;
      }

      matched.push({
        title: candidates[0].bookTitle,
        authors: candidates[0].authorNames,
        readingStatus: row.readingStatus,
        readPeriods: row.readPeriods.map((p) => ({
          startedAt: p.startedAt?.toISOString() ?? null,
          finishedAt: p.finishedAt?.toISOString() ?? null,
          isDnf: p.isDnf,
        })),
        entryIds: candidates.map((c) => c.id),
        editionSlugs: candidates.map((c) => c.editionSlug).filter(Boolean),
      });
    }

    return { matched, unmatched };
  }

  async preview(userId: string, csvContent: string): Promise<ImportPreview> {
    const { format, rows } = this.parseRows(csvContent);
    const entryMap = await this.getUserEntryMap(userId);
    const { matched, unmatched } = this.matchRows(rows, entryMap);
    return {
      format,
      total: rows.filter((r) => r.readingStatus !== 'UNREAD').length,
      matched,
      unmatched,
    };
  }

  async execute(userId: string, csvContent: string): Promise<ImportResult> {
    const { rows } = this.parseRows(csvContent);
    const entryMap = await this.getUserEntryMap(userId);
    const { matched } = this.matchRows(rows, entryMap);

    let imported = 0;
    let skipped = 0;

    for (const book of matched) {
      for (const entryId of book.entryIds) {
        try {
          await this.prisma.userBookEntry.update({
            where: { id: entryId },
            data: { readingStatus: book.readingStatus },
          });
          // Create one ReadingHistory entry per read-through (re-reads = multiple periods)
          for (const period of book.readPeriods) {
            await this.prisma.readingHistory.create({
              data: {
                userBookEntryId: entryId,
                startedAt: period.startedAt ? new Date(period.startedAt) : null,
                finishedAt: period.finishedAt ? new Date(period.finishedAt) : null,
                isDnf: period.isDnf,
              },
            });
          }
          imported++;
        } catch {
          skipped++;
        }
      }
    }

    return { imported, skipped };
  }
}
