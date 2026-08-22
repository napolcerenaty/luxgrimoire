/**
 * One-off backfill: creates a CompanyImagePermission(status=GRANTED) row for every existing
 * BookBoxCompany that already has hasOfficialImagePermission=true — those companies had the flag
 * set directly via the old company create/edit checkbox, before the Image Permissions admin
 * workflow existed. Without this, the new admin section would show them as PENDING even though
 * permission was already effectively granted.
 *
 * Idempotent — skips any company that already has a CompanyImagePermission row (upsert semantics
 * via findFirst + create, not blind create). Safe to re-run.
 *
 * Confirmed run against production after the image-permissions feature deployed (PR #33,
 * 2026-08-21) — archived rather than wired into docker-entrypoint.sh anymore, same pattern as
 * the other backfills in this folder. Kept for history and for manually backfilling a company
 * created directly against the database (bypassing the admin form) elsewhere.
 *
 * Run manually with:
 *   node dist/scripts/archive/backfill-company-image-permissions.js [--dry-run]
 *
 * Per-company errors are caught individually (never crash the rest of the batch) and filed as a
 * BugReport (category 'data-migration') for manual follow-up, deduped by title.
 */
import { runScript } from '../run-script'
import { PrismaService } from '../../prisma/prisma.service'
import { BugReportsService } from '../../modules/bug-reports/bug-reports.service'

const DRY_RUN = process.argv.includes('--dry-run')

runScript('backfill-company-image-permissions', async app => {
  const prisma = app.get(PrismaService)
  const bugReports = app.get(BugReportsService)

  if (DRY_RUN) console.log('--- DRY RUN: no writes will be made ---')

  const companies = await prisma.bookBoxCompany.findMany({
    where: { hasOfficialImagePermission: true, imagePermission: null },
    select: { id: true, name: true },
  })

  let created = 0
  let errored = 0

  for (const company of companies) {
    try {
      if (!DRY_RUN) {
        await prisma.companyImagePermission.create({
          data: { companyId: company.id, status: 'GRANTED' },
        })
      }
      created++
    } catch (err) {
      errored++
      console.error(`[backfill-company-image-permissions] company ${company.id} (${company.name}) failed:`, err)
      if (!DRY_RUN) {
        const title = `company-image-permissions backfill failed for company ${company.id}`
        const alreadyFiled = await prisma.bugReport.findFirst({ where: { category: 'data-migration', title } })
        if (!alreadyFiled) {
          await bugReports.create({
            title,
            description:
              `BookBoxCompany ${company.id} (${company.name}) has hasOfficialImagePermission=true but failed ` +
              `to get a backing CompanyImagePermission record during backfill: ${err instanceof Error ? err.message : String(err)}. ` +
              `It will show as PENDING in the Image Permissions admin section until fixed manually or re-run successfully.`,
            category: 'data-migration',
          }).catch(() => {})
        }
      }
    }
  }

  console.log(`[backfill-company-image-permissions] ${companies.length} companies processed: ${created} created, ${errored} failed (filed as bug reports).`)
})
