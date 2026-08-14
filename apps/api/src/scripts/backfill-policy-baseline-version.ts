/**
 * One-off backfill: run once, right after the Terms of Use / Privacy Policy content is
 * migrated into Ghost Pages (slugs "terms-of-use" / "privacy-policy" — see auth.service.ts
 * saveConsent/register and apps/web/src/lib/consent.ts for how those versions gate re-consent).
 *
 * Publishing those Ghost pages for the first time gives them a fresh `updated_at`, which
 * becomes the new baseline version. Without this script, that baseline would never match any
 * existing user's stored termsVersion/privacyVersion, and *every* existing user would be forced
 * through /consent on their next login — even though the content didn't meaningfully change,
 * it just moved from hardcoded JSX into Ghost. This script re-tags existing users to the new
 * baseline version without touching termsAcceptedAt/privacyAcceptedAt (it's a version-label
 * realignment, not a new consent event, so no PolicyAcceptance row is written either — only
 * users who already have a non-null accepted-at are touched; brand-new/never-consented users
 * are left alone and still correctly get sent through /consent).
 *
 * Get the exact version strings to pass in from the running app after publishing in Ghost:
 *   curl https://<web-host>/api/legal/versions
 * (or your local dev server — see apps/web/src/app/api/legal/versions/route.ts). Use the
 * *ISO* updated_at value from that response, not whatever Ghost's admin UI displays.
 *
 * Idempotent — only updates rows where the stored version differs from the target, so it's
 * safe to re-run. Run manually (never wired into docker-entrypoint.sh — this must only run
 * after a human has actually published the Ghost pages and knows the resulting version):
 *   node dist/scripts/backfill-policy-baseline-version.js \
 *     --terms-version="2026-08-20T14:32:10.000Z" \
 *     --privacy-version="2026-08-20T14:35:02.000Z" \
 *     [--dry-run]
 *
 * Either flag can be omitted if only one document was just migrated to Ghost.
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

const TERMS_VERSION = argValue('terms-version')
const PRIVACY_VERSION = argValue('privacy-version')

runScript('backfill-policy-baseline-version', async app => {
  if (!TERMS_VERSION && !PRIVACY_VERSION) {
    throw new Error('Pass at least one of --terms-version=... / --privacy-version=...')
  }

  const prisma = app.get(PrismaService)
  const bugReports = app.get(BugReportsService)

  if (DRY_RUN) console.log('--- DRY RUN: no writes will be made ---')

  for (const [docType, version] of [['TERMS', TERMS_VERSION], ['PRIVACY', PRIVACY_VERSION]] as const) {
    if (!version) continue
    const field = docType === 'TERMS' ? 'termsVersion' : 'privacyVersion'
    const acceptedAtField = docType === 'TERMS' ? 'termsAcceptedAt' : 'privacyAcceptedAt'

    try {
      const matching = await prisma.user.count({
        where: { [acceptedAtField]: { not: null }, [field]: { not: version } },
      })

      if (DRY_RUN) {
        console.log(`[backfill-policy-baseline-version] ${docType}: would retag ${matching} user(s) to version ${version}`)
        continue
      }

      const { count } = await prisma.user.updateMany({
        where: { [acceptedAtField]: { not: null }, [field]: { not: version } },
        data: { [field]: version },
      })
      console.log(`[backfill-policy-baseline-version] ${docType}: retagged ${count} user(s) to version ${version} (acceptedAt left untouched)`)
    } catch (err) {
      console.error(`[backfill-policy-baseline-version] ${docType} backfill failed:`, err)
      const title = `policy-baseline-version backfill failed for ${docType}`
      const alreadyFiled = await prisma.bugReport.findFirst({ where: { category: 'data-migration', title } })
      if (!alreadyFiled) {
        await bugReports.create({
          title,
          description:
            `Backfilling existing users' ${field} to baseline version "${version}" failed: ` +
            `${err instanceof Error ? err.message : String(err)}. Existing users may now be force-` +
            `redirected to /consent on next login even though the content didn't meaningfully change. ` +
            `Re-run: node dist/scripts/backfill-policy-baseline-version.js --${docType === 'TERMS' ? 'terms-version' : 'privacy-version'}="${version}"`,
          category: 'data-migration',
        }).catch(() => {})
      }
    }
  }
})
