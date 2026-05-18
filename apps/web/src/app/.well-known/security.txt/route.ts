import { NextResponse } from 'next/server'

const SECURITY_TXT = `Contact: mailto:contact@luxgrimoire.com
Expires: 2027-05-17T00:00:00.000Z
Preferred-Languages: en, pl
`

export function GET() {
  return new NextResponse(SECURITY_TXT, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
