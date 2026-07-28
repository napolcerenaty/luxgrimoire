type TitleSource = { title?: string | null }
type VariantSource = { variantLabel?: string | null }

/**
 * Appends the edition's variant label to the book title, e.g. "Fourth Wing (White Edition)".
 * Single source of truth for this formatting — use everywhere an edition's display title is rendered
 * instead of reading book.title directly, so a variantLabel never gets silently dropped.
 */
export function formatEditionDisplayTitle(book: TitleSource | null | undefined, edition: VariantSource | null | undefined): string {
  const title = book?.title ?? ''
  const label = edition?.variantLabel?.trim()
  return label ? `${title} (${label})` : title
}
