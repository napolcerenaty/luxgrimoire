# LuxGrimoire Monorepo

Full-stack book collection app for luxury editions and subscription boxes.

## Stack
- **Frontend**: Next.js 15 (App Router, Server Components)
- **Backend**: NestJS (TypeScript)
- **Database**: PostgreSQL via Prisma
- **Cache/Queues**: Redis + BullMQ
- **Search**: Typesense
- **Images**: Cloudinary
- **Auth**: Better Auth
- **Email**: Brevo
- **UI**: Tailwind CSS + shadcn/ui
- **Deployment**: Coolify on Hetzner

## Structure

```
luxgrimoire/
├── apps/
│   ├── api/          NestJS backend
│   └── web/          Next.js 15 frontend
├── packages/
│   ├── database/     Prisma schema + client
│   └── shared-types/ TypeScript interfaces shared across apps
```

## Getting started

```bash
pnpm install
pnpm dev
```

## Environment variables

Copy `.env.example` in each app and fill in values:
- `apps/api/.env`
- `apps/web/.env.local`
