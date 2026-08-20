/**
 * Auto-backfill: re-tags existing users to a fixed Terms of Use / Privacy Policy baseline
 * version (see auth.service.ts saveConsent/register and apps/web/src/lib/consent.ts for how
 * those versions gate re-consent).
 *
 * Why this exists: publishing terms-of-use/privacy-policy as Ghost Pages for the first time
 * gives them a fresh `updated_at`, which becomes the new version. Without this script, that
 * baseline would never match any existing user's stored termsVersion/privacyVersion, and
 * *every* existing user would be forced through /consent on their next login — even though the
 * content didn't meaningfully change, it just moved from hardcoded JSX into Ghost. This script
 * re-tags existing users to that baseline without touching termsAcceptedAt/privacyAcceptedAt
 * (it's a version-label realignment, not a new consent event, so no PolicyAcceptance row is
 * written either — only users who already have a non-null accepted-at are touched; brand-new/
 * never-consented users are left alone and still correctly get sent through /consent).
 *
 * Fetches the CURRENT version straight from Ghost's Content API — no manual curl/copy-paste of
 * the version string needed. Wired unconditionally into docker-entrypoint.sh (runs on every
 * deploy) and made safe to do so via a one-time-per-doc guard: an `AppSetting` marker row
 * (policyBaselineTermsBackfilledAt / policyBaselinePrivacyBackfilledAt) is written the first
 * time a doc is successfully backfilled, and checked before doing any work on every subsequent
 * run. This is what makes "just fetch whatever Ghost currently has" safe long-term: a doc is
 * only ever retagged the very first time it's found published — a *later*, genuine content
 * change is never retroactively backfilled, so the feature keeps working as intended for real
 * future ToS/Privacy updates. If a doc isn't published in Ghost yet, its half is silently
 * skipped and retried on the next deploy. Per-doc failures don't affect the other doc.
 *
 * Manual/local testing:
 *   node dist/scripts/backfill-policy-baseline-version.js [--dry-run]
 *   node dist/scripts/backfill-policy-baseline-version.js --terms-version="..." --dry-run
 * (--terms-version=/--privacy-version= override the Ghost fetch entirely for a given doc — the
 * AppSetting guard still applies, so this only does something the first time.)
 */
import { runScript } from './run-script'
import { PrismaService } from '../prisma/prisma.service'
import { BugReportsService } from '../modules/bug-reports/bug-reports.service'

const DRY_RUN = process.argv.includes('--dry-run')

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`
  const match = process.argv.find(a => a.startsWith(prefix))
  return match?.slice(prefix.length)
}

async function fetchGhostPageVersion(slug: string): Promise<string | null> {
  const GHOST_URL = (process.env.GHOST_API_URL ?? 'http://localhost:2368').replace(/\/$/, '')
  const GHOST_KEY = process.env.GHOST_CONTENT_API_KEY
  if (!GHOST_KEY) return null
  try {
    const url = `${GHOST_URL}/ghost/api/content/pages/slug/${slug}/?key=${GHOST_KEY}&fields=updated_at`
    const res = await fetch(url)
    if (!res.ok) return null // 404 = not published yet; treat any failure as "not ready", not fatal
    const data = (await res.json()) as { pages?: { updated_at: string }[] }
    return data.pages?.[0]?.updated_at ?? null
  } catch {
    return null
  }
}

const DOCS = [
  {
    docType: 'TERMS' as const,
    slug: 'terms-of-use',
    field: 'termsVersion' as const,
    acceptedAtField: 'termsAcceptedAt' as const,
    settingKey: 'policyBaselineTermsBackfilledAt',
    override: argValue('terms-version'),
  },
  {
    docType: 'PRIVACY' as const,
    slug: 'privacy-policy',
    field: 'privacyVersion' as const,
    acceptedAtField: 'privacyAcceptedAt' as const,
    settingKey: 'policyBaselinePrivacyBackfilledAt',
    override: argValue('privacy-version'),
  },
]

runScript('backfill-policy-baseline-version', async app => {
  const prisma = app.get(PrismaService)
  const bugReports = app.get(BugReportsService)

  if (DRY_RUN) console.log('--- DRY RUN: no writes will be made ---')

  for (const doc of DOCS) {
    try {
      const alreadyDone = await prisma.appSetting.findUnique({ where: { key: doc.settingKey } })
      if (alreadyDone) {
        console.log(`[backfill-policy-baseline-version] ${doc.docType}: already backfilled to ${alreadyDone.value} on ${alreadyDone.updatedAt.toISOString()}, skipping`)
        continue
      }

      const version = doc.override ?? (await fetchGhostPageVersion(doc.slug))
      if (!version) {
        console.log(`[backfill-policy-baseline-version] ${doc.docType}: not published in Ghost yet, skipping (will retry next deploy)`)
        continue
      }

      const matching = await prisma.user.count({
        where: { [doc.acceptedAtField]: { not: null }, [doc.field]: { not: version } },
      })

      if (DRY_RUN) {
        console.log(`[backfill-policy-baseline-version] ${doc.docType}: would retag ${matching} user(s) to version ${version} (dry run — marker not written, would still be pending next run)`)
        continue
      }

      const { count } = await prisma.user.updateMany({
        where: { [doc.acceptedAtField]: { not: null }, [doc.field]: { not: version } },
        data: { [doc.field]: version },
      })
      await prisma.appSetting.upsert({
        where: { key: doc.settingKey },
        create: { key: doc.settingKey, value: version },
        update: { value: version },
      })
      console.log(`[backfill-policy-baseline-version] ${doc.docType}: retagged ${count} user(s) to version ${version} (acceptedAt left untouched), marked complete — will never run again for this doc`)
    } catch (err) {
      console.error(`[backfill-policy-baseline-version] ${doc.docType} backfill failed:`, err)
      const title = `policy-baseline-version backfill failed for ${doc.docType}`
      const alreadyFiled = await prisma.bugReport.findFirst({ where: { category: 'data-migration', title } })
      if (!alreadyFiled) {
        await bugReports.create({
          title,
          description:
            `Backfilling existing users' ${doc.field} to the Ghost baseline version failed: ` +
            `${err instanceof Error ? err.message : String(err)}. No AppSetting marker was written, ` +
            `so this will automatically retry on the next deploy.`,
          category: 'data-migration',
        }).catch(() => {})
      }
    }
  }
})
