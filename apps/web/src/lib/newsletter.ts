// Utility to check if there's an active newsletter slot
// Used by future newsletter sending logic
export async function getActiveNewsletterSlot(): Promise<{ companyId: string; notes: string } | null> {
  // This is a server-side utility
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/sponsored/active?slotType=NEWSLETTER_SLOT`,
  )
  if (!res.ok) return null
  const slots = await res.json()
  return slots[0] ?? null
}
