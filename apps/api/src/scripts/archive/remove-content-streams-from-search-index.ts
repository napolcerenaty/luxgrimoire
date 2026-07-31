/**
 * One-off cleanup: content streams are parent containers, not directly joinable — only
 * their variants are — so they must never appear in the "subscriptions" Typesense
 * collection (see indexSubscription in subscriptions.service.ts, which already excludes
 * them going forward). A prior full reindex run (before that exclusion existed in
 * typesense-reindex.ts) left them sitting in the index, showing up in global search.
 *
 * Cheap and idempotent — safe to re-run, but the production cleanup already completed
 * successfully (confirmed 2026-07-31: content streams no longer appear in search), so this
 * is archived rather than wired into docker-entrypoint.sh anymore. Kept for history and for
 * manual cleanup if a future reindex ever reintroduces the issue. Run manually with:
 *   node dist/scripts/archive/remove-content-streams-from-search-index.js
 */
import { runScript } from '../run-script'
import { TypesenseService } from '../../modules/typesense/typesense.service'
import { PrismaService } from '../../prisma/prisma.service'

runScript('remove-content-streams-from-search-index', async app => {
  const typesense = app.get(TypesenseService)
  const prisma = app.get(PrismaService)

  const contentStreams = await prisma.subscription.findMany({
    where: { isContentStream: true },
    select: { id: true },
  })
  for (const cs of contentStreams) {
    await typesense.deleteDocument('subscriptions', cs.id).catch(() => {})
  }
  console.log(
    `[remove-content-streams-from-search-index] checked ${contentStreams.length} content stream(s), removed from search index if present`,
  )
})
