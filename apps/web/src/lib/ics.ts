// Minimal RFC 5545 (.ics) writer — shared by the public global sales calendar and the private
// per-user calendar so both "Download <Month Year> events" buttons produce identical, correctly
// formed files without pulling in an external dependency for what's a handful of VEVENT blocks.

export interface CalendarExportEvent {
  id: string
  title: string
  description?: string
  url?: string
  /** Absolute instant (e.g. a sale tier's drop time) — written as a timed UTC event so every
   *  calendar app converts it to the viewer's own device timezone on import. Mutually exclusive
   *  with `allDayDate`. */
  date?: Date | string
  /** Day-only event (e.g. a subscription renewal, which has no meaningful time-of-day) — written
   *  as an all-day event so no timezone conversion is ever applied. */
  allDayDate?: { year: number; month: number; day: number }
}

const CRLF = '\r\n'

// RFC 5545 requires lines folded at 75 octets, continued with CRLF + a leading space.
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const chunks: string[] = []
  let rest = line
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75))
    rest = ' ' + rest.slice(75)
  }
  chunks.push(rest)
  return chunks.join(CRLF)
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function formatUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function formatAllDayDate(d: { year: number; month: number; day: number }): string {
  const mm = String(d.month).padStart(2, '0')
  const dd = String(d.day).padStart(2, '0')
  return `${d.year}${mm}${dd}`
}

/** Adds `days` to an all-day date, for computing DTEND (exclusive) on all-day events. */
function addDaysToAllDay(d: { year: number; month: number; day: number }, days: number): { year: number; month: number; day: number } {
  const dt = new Date(Date.UTC(d.year, d.month - 1, d.day + days))
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() }
}

export function buildIcsCalendar(events: CalendarExportEvent[], calendarName: string): string {
  const now = new Date()
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LuxGrimoire//Sales & Renewals Calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ]

  for (const event of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(foldLine(`UID:${event.id}@luxgrimoire.com`))
    lines.push(`DTSTAMP:${formatUtcStamp(now)}`)

    if (event.allDayDate) {
      lines.push(`DTSTART;VALUE=DATE:${formatAllDayDate(event.allDayDate)}`)
      lines.push(`DTEND;VALUE=DATE:${formatAllDayDate(addDaysToAllDay(event.allDayDate, 1))}`)
    } else if (event.date) {
      const d = typeof event.date === 'string' ? new Date(event.date) : event.date
      lines.push(`DTSTART:${formatUtcStamp(d)}`)
    }

    lines.push(foldLine(`SUMMARY:${escapeText(event.title)}`))
    if (event.description) lines.push(foldLine(`DESCRIPTION:${escapeText(event.description)}`))
    if (event.url) lines.push(foldLine(`URL:${event.url}`))
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join(CRLF) + CRLF
}

/** Triggers a browser download of the given events as a .ics file. */
export function downloadIcsCalendar(events: CalendarExportEvent[], calendarName: string, filename: string): void {
  const ics = buildIcsCalendar(events, calendarName)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
