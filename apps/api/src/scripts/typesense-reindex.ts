/**
 * Typesense full reindex script
 *
 * Required env vars:
 *   TYPESENSE_HOST=<host>        (default: localhost)
 *   TYPESENSE_PORT=8108          (default: 8108)
 *   TYPESENSE_API_KEY=<key>
 *   DATABASE_URL=<postgres url>
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

  console.log('Reindexing books...')
  const books = await prisma.book.findMany({
    where: { status: 'approved' },
    select: {
      id: true,
      title: true,
      seriesName: true,
      genres: true,
      createdAt: true,
      authors: { select: { author: { select: { name: true } } } },
    },
  })
  for (const book of books) {
    await typesense.upsertDocument('books', {
      id: book.id,
      title: book.title,
      seriesName: book.seriesName ?? '',
      authorNames: book.authors.map((a) => a.author.name),
      genres: book.genres,
      createdAt: Math.floor(new Date(book.createdAt).getTime() / 1000),
    })
  }
  console.log(`  → ${books.length} books indexed`)

  console.log('Reindexing editions...')
  const editions = await prisma.bookEdition.findMany({
    select: {
      id: true,
      publisher: true,
      createdAt: true,
      book: {
        select: {
          id: true,
          title: true,
          authors: { select: { author: { select: { name: true } } } },
        },
      },
      bookBoxCompany: { select: { name: true, slug: true } },
    },
  })
  for (const ed of editions) {
    await typesense.upsertDocument('editions', {
      id: ed.id,
      bookId: ed.book.id,
      bookTitle: ed.book.title,
      authorNames: ed.book.authors.map((a) => a.author.name),
      publisher: ed.publisher ?? '',
      companyName: ed.bookBoxCompany?.name ?? '',
      companySlug: ed.bookBoxCompany?.slug ?? '',
      createdAt: Math.floor(new Date(ed.createdAt).getTime() / 1000),
    })
  }
  console.log(`  → ${editions.length} editions indexed`)

  console.log('Reindexing authors...')
  const authors = await prisma.author.findMany({
    select: { id: true, name: true, slug: true, nationality: true },
  })
  for (const author of authors) {
    await typesense.upsertDocument('authors', {
      id: author.id,
      name: author.name,
      slug: author.slug,
      nationality: author.nationality ?? '',
    })
  }
  console.log(`  → ${authors.length} authors indexed`)

  console.log('Reindexing artists...')
  const artists = await prisma.artist.findMany({
    select: { id: true, name: true, slug: true, specialty: true },
  })
  for (const artist of artists) {
    await typesense.upsertDocument('artists', {
      id: artist.id,
      name: artist.name,
      slug: artist.slug,
      specialty: artist.specialty ?? '',
    })
  }
  console.log(`  → ${artists.length} artists indexed`)

  console.log('Reindexing subscriptions...')
  const subscriptions = await prisma.subscription.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
      isDiscontinued: true,
      company: { select: { name: true } },
    },
  })
  for (const sub of subscriptions) {
    await typesense.upsertDocument('subscriptions', {
      id: sub.id,
      slug: sub.slug,
      name: sub.name,
      companyName: sub.company?.name ?? '',
      type: sub.type ?? '',
      isDiscontinued: sub.isDiscontinued,
    })
  }
  console.log(`  → ${subscriptions.length} subscriptions indexed`)

  console.log('Reindexing companies...')
  const companies = await prisma.bookBoxCompany.findMany({
    select: { id: true, slug: true, name: true, country: true },
  })
  for (const company of companies) {
    await typesense.upsertDocument('companies', {
      id: company.id,
      slug: company.slug,
      name: company.name,
      country: company.country ?? '',
    })
  }
  console.log(`  → ${companies.length} companies indexed`)

  console.log('Reindexing sales...')
  const sales = await prisma.saleAnnouncement.findMany({
    select: {
      id: true,
      title: true,
      generalSaleDate: true,
      company: { select: { name: true, slug: true } },
    },
  })
  for (const sale of sales) {
    await typesense.upsertDocument('sales', {
      id: sale.id,
      title: sale.title,
      companyName: sale.company?.name ?? '',
      companySlug: sale.company?.slug ?? '',
      generalSaleDate: sale.generalSaleDate
        ? Math.floor(new Date(sale.generalSaleDate).getTime() / 1000)
        : undefined,
    })
  }
  console.log(`  → ${sales.length} sales indexed`)

  await app.close()
  console.log('Done!')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
