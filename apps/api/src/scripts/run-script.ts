/**
 * Shared bootstrap for one-off scripts that need the full AppModule (Prisma, Typesense, etc.).
 * AppModule registers several @Cron jobs whose timers keep the event loop alive even after
 * app.close() resolves — a script that relies on the process exiting naturally will hang
 * forever instead of returning control to whatever invoked it (e.g. docker-entrypoint.sh,
 * which runs startup scripts before starting the API — a hung script means the API step after
 * it never runs). This caused a full production outage on 2026-07-31. Always bootstrap through
 * this helper instead of writing a bespoke main()/app.close() so the explicit process.exit()
 * can't be forgotten.
 */
import { INestApplicationContext } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'

export async function runScript(label: string, fn: (app: INestApplicationContext) => Promise<void>): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] })
  try {
    await fn(app)
  } catch (err) {
    console.error(`[${label}] failed:`, err)
    await app.close().catch(() => {})
    process.exit(1)
  }
  await app.close()
  process.exit(0)
}
