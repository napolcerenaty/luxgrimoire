/**
 * Backfill: re-tags existing users to a fixed Terms of Use / Privacy Policy baseline version
 * (see auth.service.ts saveConsent/register and apps/web/src/lib/consent.ts for how those
 * versions gate re-consent).
 *
 * Why this exists: publishing terms-of-use/privacy-policy as Ghost Pages for the first time
 * gives them a fresh `updated_at`, which becomes the new version. Without this script, that
 * baseline would never match any existing user's stored termsVersion/privacyVersion, and
 * *every* existing user would be forced through /consent on their next login — even though the
 * content didn't meaningfully change, it just moved from hardcoded JSX into Ghost. This script
 * re-tags existing users to the given baseline version without touching
 * termsAcceptedAt/privacyAcceptedAt (it's a version-label realignment, not a new consent event,
 * so no PolicyAcceptance row is written either — only users who already have a non-null
 * accepted-at are touched; brand-new/never-consented users are left alone and still correctly
 * get sent through /consent).
 *
 * Get the exact version strings from the running app *after* publishing in Ghost:
 *   curl https://<web-host>/api/legal/versions
 * Use the *ISO* updated_at value from that response, not whatever Ghost's admin UI displays.
 *
 * IDEMPOTENT BY DESIGN — this is what makes it safe to wire into docker-entrypoint.sh instead
 * of running by hand: it only ever updates rows where the stored version differs from the
 * given target (`prisma.user.updateMany({ where: { ...field: { not: version } } })`), so
 * running it again with the same version affects 0 rows the second time onward. It is also
 * safe to leave wired into every deploy indefinitely, because the target version is whatever
 * you pass in — fixed at the moment you publish the initial Ghost baseline — not "whatever
 * Ghost currently has." It will never chase a later, genuine content change; only that one
 * pinned baseline. (If you want a later real change to force re-consent, don't backfill it —
 * that's the feature working as intended.)
 *
 * Wired into docker-entrypoint.sh, gated behind two optional env vars so it's a no-op on every
 * deploy where they aren't set:
 *   POLICY_BASELINE_TERMS_VERSION=2026-08-20T14:32:10.000Z
 *   POLICY_BASELINE_PRIVACY_VERSION=2026-08-20T14:35:02.000Z
 * Set them once you've published the Ghost pages and know the resulting version(s); either can
 * be omitted if only one document was migrated. No manual invocation needed on deploy.
 *
 * Manual/local use (e.g. dry-run before deploying):
 *   node dist/scripts/backfill-policy-baseline-version.js \
 *     --terms-version="2026-08-20T14:32:10.000Z" \
 *     --privacy-version="2026-08-20T14:35:02.000Z" \
 *     [--dry-run]
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
