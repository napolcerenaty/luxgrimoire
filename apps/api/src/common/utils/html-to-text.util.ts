/**
 * Strips scripts/styles/nav/header/footer from raw HTML and converts what's left
 * into readable plain text — used both as AI-extraction input (ai.service.ts) and,
 * per the news-aggregator spec section 4.3, as the admin's human-readable fallback
 * view of a raw ingested source (email/blog HTML is otherwise unreadable as-is).
 */
export function extractTextFromHtml(html: string, maxChars = 15_000): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    // Replace block-level tags with newlines
    .replace(/<\/(p|div|section|article|li|h[1-6]|br|tr|td|th|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Strip all remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    // Collapse whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + '\n[content truncated]';
  }
  return text;
}
