import { NextResponse } from 'next/server'
import { getPage } from '@/lib/ghost'

export interface LegalDocVersion {
  version: string
  summary: string | null
}

export interface LegalVersionsResponse {
  terms: LegalDocVersion | null
  privacy: LegalDocVersion | null
}

// Ghost's updated_at IS the version identifier — no manual bump needed, the editor just
// publishes a change in Ghost. custom_excerpt doubles as the "what changed" summary shown
// on the re-consent screen. Either doc failing to fetch (Ghost down, page not yet created)
// resolves to null — callers must fail open (never block a user over a CMS outage).
export async function GET() {
  const [terms, privacy] = await Promise.all([
    getPage('terms-of-use'),
    getPage('privacy-policy'),
  ])

  const body: LegalVersionsResponse = {
    terms: terms ? { version: terms.updated_at, summary: terms.custom_excerpt } : null,
    privacy: privacy ? { version: privacy.updated_at, summary: privacy.custom_excerpt } : null,
  }

  return NextResponse.json(body)
}
