/** Network retrieval and last-known-good cache owner for the marketplace catalog. */

import { readFile } from 'node:fs/promises'
import { writeFileAtomic } from './atomic-write.ts'
import { parseMarketplaceCatalogText } from './catalog.ts'
import type {
  MarketplaceCatalogError,
  MarketplaceCatalogErrorCode,
  MarketplaceCatalogSnapshot,
  MarketplaceCatalogView,
} from './types.ts'

const CACHE_SCHEMA_VERSION = 1

interface MarketplaceCacheRecord {
  readonly schemaVersion: 1
  readonly sourceUrl: string
  readonly fetchedAt: string
  readonly etag: string | null
  readonly catalog: MarketplaceCatalogSnapshot
}

/** Runtime dependencies and bounded resource policy for the catalog owner. */
export interface MarketplaceCatalogClientOptions {
  readonly sourceUrl: string
  readonly cachePath: string
  readonly maxAgeMs: number
  readonly timeoutMs: number
  readonly maxBytes: number
  readonly fetchImpl?: typeof fetch
  readonly now?: () => Date
}

class CatalogClientFailure extends Error {
  constructor(readonly code: MarketplaceCatalogErrorCode, message: string) {
    super(message)
    this.name = 'CatalogClientFailure'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseCacheRecord(text: string, sourceUrl: string): MarketplaceCacheRecord {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new CatalogClientFailure('cache-invalid', 'The saved marketplace catalog is invalid.')
  }
  if (!isRecord(value)
    || value.schemaVersion !== CACHE_SCHEMA_VERSION
    || value.sourceUrl !== sourceUrl
    || typeof value.fetchedAt !== 'string'
    || !(typeof value.etag === 'string' || value.etag === null)
    || !isRecord(value.catalog)) {
    throw new CatalogClientFailure('cache-invalid', 'The saved marketplace catalog is invalid.')
  }
  let catalog: MarketplaceCatalogSnapshot
  try {
    catalog = parseMarketplaceCatalogText(JSON.stringify(value.catalog))
  } catch {
    throw new CatalogClientFailure('cache-invalid', 'The saved marketplace catalog is invalid.')
  }
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    sourceUrl,
    fetchedAt: value.fetchedAt,
    etag: value.etag,
    catalog,
  }
}

function serializeCacheRecord(record: MarketplaceCacheRecord): string {
  return `${JSON.stringify(record)}\n`
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = response.headers.get('content-length')
  if (declared !== null && Number(declared) > maxBytes) {
    throw new CatalogClientFailure('payload-too-large', 'The marketplace catalog is larger than the configured limit.')
  }
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new CatalogClientFailure('payload-too-large', 'The marketplace catalog is larger than the configured limit.')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const content = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    content.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content)
  } catch {
    throw new CatalogClientFailure('catalog-invalid', 'The marketplace catalog is not valid UTF-8.')
  }
}

function publicError(error: unknown): MarketplaceCatalogError {
  if (error instanceof CatalogClientFailure) return { code: error.code, message: error.message }
  return { code: 'network-error', message: 'The marketplace catalog could not be refreshed.' }
}

/** Single lifecycle owner for cache loading, conditional refresh, and disposal. */
export class MarketplaceCatalogClient {
  private readonly fetchImpl: typeof fetch
  private readonly now: () => Date
  private readonly closeController = new AbortController()
  private catalog: MarketplaceCatalogSnapshot | null = null
  private source: MarketplaceCatalogView['source'] = 'none'
  private fetchedAt: string | null = null
  private etag: string | null = null
  private error: MarketplaceCatalogError | null = null
  private refreshPromise: Promise<MarketplaceCatalogView> | null = null
  private disposed = false

  constructor(private readonly options: MarketplaceCatalogClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? (() => new Date())
  }

  /** Load only a valid cache record; network I/O remains an explicit refresh. */
  async initialize(): Promise<void> {
    try {
      const record = parseCacheRecord(await readFile(this.options.cachePath, 'utf8'), this.options.sourceUrl)
      this.catalog = record.catalog
      this.source = 'cache'
      this.fetchedAt = record.fetchedAt
      this.etag = record.etag
      this.error = null
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return
      this.error = publicError(error instanceof CatalogClientFailure
        ? error
        : new CatalogClientFailure('cache-invalid', 'The saved marketplace catalog could not be read.'))
    }
  }

  /**
   * Current projection; staleness is recomputed so a long-running Host does not freeze time.
   * @returns Current last-known-good catalog and freshness metadata.
   */
  view(): MarketplaceCatalogView {
    const stale = this.catalog === null
      ? false
      : this.now().getTime() - Date.parse(this.catalog.generatedAt) > this.options.maxAgeMs
    return {
      status: this.catalog === null ? 'unavailable' : this.catalog.entries.length === 0 ? 'empty' : 'ready',
      source: this.source,
      sourceUrl: this.options.sourceUrl,
      lastSuccessfulFetchAt: this.fetchedAt,
      stale,
      catalog: this.catalog,
      error: this.error,
    }
  }

  /**
   * Run at most one conditional refresh and preserve the old catalog on every failure.
   * @returns Shared refresh result projected through the last-known-good state.
   */
  refresh(): Promise<MarketplaceCatalogView> {
    if (this.refreshPromise !== null) return this.refreshPromise
    if (this.disposed) {
      this.error = { code: 'service-disposed', message: 'The marketplace catalog service is stopping.' }
      return Promise.resolve(this.view())
    }
    const pending = this.refreshOnce().finally(() => {
      if (this.refreshPromise === pending) this.refreshPromise = null
    })
    this.refreshPromise = pending
    return pending
  }

  private async refreshOnce(): Promise<MarketplaceCatalogView> {
    const attempts = 2
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await this.pull()
        return this.view()
      } catch (error) {
        const failure = publicError(error)
        const retry = !this.disposed
          && attempt < attempts
          && (failure.code === 'network-error' || failure.code === 'http-error')
        if (!retry) {
          this.error = failure
          return this.view()
        }
      }
    }
    return this.view()
  }

  private async pull(): Promise<void> {
    if (this.options.sourceUrl.trim().length === 0) {
      throw new CatalogClientFailure(
        'catalog-url-unconfigured',
        'The marketplace catalog URL is not configured.',
      )
    }
    const timeout = AbortSignal.timeout(this.options.timeoutMs)
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': 'deepseek-harness-plugin-marketplace',
    }
    if (this.etag !== null) headers['if-none-match'] = this.etag
    const response = await this.fetchImpl(this.options.sourceUrl, {
      headers,
      signal: AbortSignal.any([timeout, this.closeController.signal]),
    })
    const fetchedAt = this.now().toISOString()
    if (response.status === 304) {
      if (this.catalog === null) {
        throw new CatalogClientFailure('catalog-invalid', 'The catalog server returned not-modified without a saved catalog.')
      }
      await this.commit({
        schemaVersion: CACHE_SCHEMA_VERSION,
        sourceUrl: this.options.sourceUrl,
        fetchedAt,
        etag: this.etag,
        catalog: this.catalog,
      })
      this.source = 'network'
      this.fetchedAt = fetchedAt
      this.error = null
      return
    }
    if (!response.ok) {
      throw new CatalogClientFailure('http-error', `The marketplace catalog server returned HTTP ${String(response.status)}.`)
    }
    let catalog: MarketplaceCatalogSnapshot
    try {
      catalog = parseMarketplaceCatalogText(await readBoundedText(response, this.options.maxBytes))
    } catch (error) {
      if (error instanceof CatalogClientFailure) throw error
      throw new CatalogClientFailure('catalog-invalid', 'The downloaded marketplace catalog is invalid.')
    }
    const nextEtag = response.headers.get('etag')
    await this.commit({
      schemaVersion: CACHE_SCHEMA_VERSION,
      sourceUrl: this.options.sourceUrl,
      fetchedAt,
      etag: nextEtag,
      catalog,
    })
    this.catalog = catalog
    this.source = 'network'
    this.fetchedAt = fetchedAt
    this.etag = nextEtag
    this.error = null
  }

  private async commit(record: MarketplaceCacheRecord): Promise<void> {
    try {
      await writeFileAtomic(this.options.cachePath, serializeCacheRecord(record), {
        mode: 0o600,
        dirMode: 0o700,
      })
    } catch {
      throw new CatalogClientFailure('cache-write-failed', 'The refreshed marketplace catalog could not be saved.')
    }
  }

  /** Stop admission, abort I/O, and wait until the current refresh reaches quiescence. */
  async close(): Promise<void> {
    this.disposed = true
    this.closeController.abort()
    await this.refreshPromise
  }
}
