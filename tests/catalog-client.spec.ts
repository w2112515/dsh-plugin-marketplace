import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarketplaceCatalogClient } from '../src/catalog-client.ts'
import { catalogFixture } from './fixture.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function cachePath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-marketplace-'))
  roots.push(root)
  return join(root, 'cache', 'catalog-v1.json')
}

function options(path: string, fetchImpl: typeof fetch, now = () => new Date('2026-08-14T01:00:00.000Z')) {
  return {
    sourceUrl: 'https://catalog.example.test/catalog-v1.json',
    cachePath: path,
    maxAgeMs: 48 * 60 * 60 * 1000,
    timeoutMs: 5_000,
    maxBytes: 1_000_000,
    fetchImpl,
    now,
  }
}

describe('MarketplaceCatalogClient', () => {
  it('admits only a validated network catalog and reloads it as last-known-good cache', async () => {
    const path = await cachePath()
    const catalog = catalogFixture()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(catalog), {
      headers: { etag: '"catalog-1"' },
    })) as unknown as typeof fetch
    const first = new MarketplaceCatalogClient(options(path, fetchImpl))
    await first.initialize()
    expect(first.view()).toMatchObject({ status: 'unavailable', source: 'none' })
    await expect(first.refresh()).resolves.toMatchObject({ status: 'ready', source: 'network', catalog, error: null })
    expect(await readFile(path, 'utf8')).toContain('"schemaVersion":1')

    const offlineFetch = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    const second = new MarketplaceCatalogClient(options(path, offlineFetch))
    await second.initialize()
    expect(second.view()).toMatchObject({ status: 'ready', source: 'cache', catalog })
    await expect(second.refresh()).resolves.toMatchObject({
      status: 'ready', source: 'cache', catalog, error: { code: 'network-error' },
    })
    await first.close()
    await second.close()
  })

  it('shares concurrent refresh and handles a valid 304 without replacing the catalog', async () => {
    const path = await cachePath()
    const catalog = catalogFixture()
    const seed = new MarketplaceCatalogClient(options(path, async () => new Response(JSON.stringify(catalog), {
      headers: { etag: '"catalog-1"' },
    })))
    await seed.initialize()
    await seed.refresh()
    await seed.close()

    let release!: () => void
    const blocked = new Promise<void>((resolve) => { release = resolve })
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('if-none-match')).toBe('"catalog-1"')
      await blocked
      return new Response(null, { status: 304 })
    }) as unknown as typeof fetch
    const client = new MarketplaceCatalogClient(options(path, fetchImpl))
    await client.initialize()
    const one = client.refresh()
    const two = client.refresh()
    expect(one).toBe(two)
    release()
    await expect(one).resolves.toMatchObject({ status: 'ready', source: 'network', catalog })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await client.close()
  })

  it('retries a transient network failure once, then keeps the last error', async () => {
    const path = await cachePath()
    const catalog = catalogFixture()
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(JSON.stringify(catalog)))
    const recovered = new MarketplaceCatalogClient(options(path, fetchImpl))
    await recovered.initialize()
    await expect(recovered.refresh()).resolves.toMatchObject({ status: 'ready', source: 'network', catalog, error: null })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    await recovered.close()

    const failing = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('still offline'))
    const exhausted = new MarketplaceCatalogClient(options(path, failing))
    await exhausted.initialize()
    await expect(exhausted.refresh()).resolves.toMatchObject({
      status: 'ready', source: 'cache', catalog, error: { code: 'network-error' },
    })
    expect(failing).toHaveBeenCalledTimes(2)
    await exhausted.close()
  })

  it('preserves cache when a refresh returns invalid content', async () => {
    const path = await cachePath()
    const catalog = catalogFixture()
    const seed = new MarketplaceCatalogClient(options(path, async () => new Response(JSON.stringify(catalog))))
    await seed.initialize()
    await seed.refresh()
    await seed.close()

    const client = new MarketplaceCatalogClient(options(path, async () => new Response('{"not":"a catalog"}')))
    await client.initialize()
    await expect(client.refresh()).resolves.toMatchObject({
      status: 'ready', source: 'cache', catalog, error: { code: 'catalog-invalid' },
    })
    await client.close()
  })
})
