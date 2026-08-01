/**
 * One-off cleanup: content streams are parent containers, not directly joinable — only
 * their variants are — so they must never appear in the "subscriptions" Typesense
 * collection (see indexSubscription in subscriptions.service.ts, which already excludes
 * them going forward). A prior full reindex run (before that exclusion existed in
 * typesense-reindex.ts) left them sitting in the index, showing up in global search.
 *
 * Cheap and idempotent — safe to run on every deploy: just deletes any content-stream
 * documents still present, harmless no-op once the index is clean. Unlike the full
 * catalog reindex, this doesn't touch books/editions/authors/etc., so it's fine to run
 * unconditionally on every startup rather than only once.
 *
 * Run automatically from docker-entrypoint.sh. Can also be run manually:
 *   node dist/scripts/remove-content-streams-from-search-index.js
 */
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { TypesenseService } from '../modules/typesense/typesense.service'
import { PrismaService } from '../prisma/prisma.service'

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  })
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

  await app.close()
  // AppModule registers several @Cron jobs whose timers keep the event loop alive even
  // after app.close() — without an explicit exit the process hangs forever instead of
  // returning control to docker-entrypoint.sh, which means the API server after it never starts.
  process.exit(0)
}

main().catch(err => {
  console.error('[remove-content-streams-from-search-index] failed:', err)
  process.exit(1)
})
