import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Client } from 'typesense'
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections'

const SCHEMAS: CollectionCreateSchema[] = [
  {
    name: 'books',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'title', type: 'string' },
      { name: 'seriesName', type: 'string', optional: true },
      { name: 'authorNames', type: 'string[]' },
      { name: 'genres', type: 'string[]' },
      { name: 'createdAt', type: 'int64' },
    ],
    default_sorting_field: 'createdAt',
  },
  {
    name: 'editions',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'bookId', type: 'string' },
      { name: 'bookTitle', type: 'string' },
      { name: 'authorNames', type: 'string[]' },
      { name: 'publisher', type: 'string', optional: true },
      { name: 'companyName', type: 'string', optional: true },
      { name: 'companySlug', type: 'string', optional: true },
      { name: 'createdAt', type: 'int64' },
    ],
    default_sorting_field: 'createdAt',
  },
  {
    name: 'authors',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'slug', type: 'string' },
      { name: 'nationality', type: 'string', optional: true },
    ],
  },
  {
    name: 'artists',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'slug', type: 'string' },
      { name: 'specialty', type: 'string', optional: true },
    ],
  },
  {
    name: 'subscriptions',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'slug', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'companyName', type: 'string', optional: true },
      { name: 'type', type: 'string', optional: true },
      { name: 'isDiscontinued', type: 'bool' },
    ],
  },
  {
    name: 'companies',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'slug', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'country', type: 'string', optional: true },
    ],
  },
  {
    name: 'sales',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'title', type: 'string' },
      { name: 'companyName', type: 'string', optional: true },
      { name: 'companySlug', type: 'string', optional: true },
      { name: 'generalSaleDate', type: 'int64', optional: true },
    ],
  },
]

@Injectable()
export class TypesenseService implements OnModuleInit {
  private readonly logger = new Logger(TypesenseService.name)
  private client!: Client
  private available = false

  onModuleInit() {
    const host = process.env.TYPESENSE_HOST ?? 'localhost'
    const port = parseInt(process.env.TYPESENSE_PORT ?? '8108', 10)
    const apiKey = process.env.TYPESENSE_API_KEY ?? ''

    if (!apiKey) {
      this.logger.warn('TYPESENSE_API_KEY not set — Typesense disabled')
      return
    }

    this.client = new Client({
      nodes: [{ host, port, protocol: 'http' }],
      apiKey,
      connectionTimeoutSeconds: 2,
      numRetries: 0,
    })

    void this.initCollections()
  }

  private async initCollections() {
    try {
      await this.client.health.retrieve()
      this.available = true
    } catch {
      this.logger.warn('Typesense health check failed — search will use Postgres fallback')
      return
    }

    for (const schema of SCHEMAS) {
      try {
        await this.client.collections(schema.name).retrieve()
      } catch {
        try {
          await this.client.collections().create(schema)
          this.logger.log(`Created Typesense collection: ${schema.name}`)
        } catch (err) {
          this.logger.error(`Failed to create collection ${schema.name}`, err)
        }
      }
    }
  }

  isAvailable(): boolean {
    return this.available
  }

  async upsertDocument(collection: string, doc: Record<string, unknown>): Promise<void> {
    if (!this.available) return
    try {
      await this.client.collections(collection).documents().upsert(doc)
    } catch (err) {
      this.logger.error(`Typesense upsert failed [${collection}/${doc['id']}]`, err)
    }
  }

  async deleteDocument(collection: string, id: string): Promise<void> {
    if (!this.available) return
    try {
      await this.client.collections(collection).documents(id).delete()
    } catch (err) {
      this.logger.error(`Typesense delete failed [${collection}/${id}]`, err)
    }
  }

  async multiSearch(
    searches: Array<{ collection: string; q: string; query_by: string; per_page: number; drop_tokens_threshold?: number }>,
  ): Promise<any[]> {
    const result = await this.client.multiSearch.perform({ searches } as any)
    return (result as any).results ?? []
  }
}
