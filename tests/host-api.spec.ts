import { createServer, type RequestListener, type Server } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, type Config } from '../src/index.ts'
import type { MarketplaceBootstrapResponse, MarketplaceListResponse, MarketplacePackDetailResponse, MarketplacePackListResponse, MarketplaceRefreshResponse } from '../src/types.ts'
import { catalogFixture, packFixture } from './fixture.ts'

const roots: string[] = []
const servers: Server[] = []
const disposers: Array<() => void | Promise<void>> = []

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function listen(listener: RequestListener): Promise<{ server: Server; origin: string }> {
  const server = createServer(listener)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return { server, origin: `http://127.0.0.1:${String(address.port)}` }
}

async function stageProfile(): Promise<{ root: string; dir: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-marketplace-host-'))
  roots.push(root)
  const dir = join(root, 'profiles', 'web')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), `${JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [] } },
  })}\n`)
  await writeFile(join(dir, 'cordis.patch.yml'), '[]\n')
  await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages: []\nnodeLinker: hoisted\n')
  return { root, dir }
}

async function post<T>(origin: string, body: unknown, requestOrigin = origin): Promise<{ status: number; body: T }> {
  const response = await fetch(`${origin}/api/plugin-marketplace`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: requestOrigin },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() as T }
}

describe('out-of-tree Host API', () => {
  it('loads a no-cache first visit, serves bounded queries, and elides an unchanged refresh page', async () => {
    const staged = await stageProfile()
    const previousHome = process.env.DSH_HOME
    process.env.DSH_HOME = staged.root
    disposers.push(() => {
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
    })

    const catalog = catalogFixture({
      packs: [packFixture()],
      summary: { entryCount: 1, invalidEntryCount: 0, packCount: 1 },
    })
    let catalogRequests = 0
    const catalogServer = await listen((req, res) => {
      catalogRequests += 1
      if (req.headers['if-none-match'] === '"catalog-1"') {
        res.writeHead(304)
        res.end()
        return
      }
      const body = JSON.stringify(catalog)
      res.writeHead(200, { 'content-type': 'application/json', etag: '"catalog-1"' })
      res.end(body)
    })

    let route: RequestListener | null = null
    const ctx = {
      baseUrl: pathToFileURL(staged.dir).href,
      webServer: {
        register(options: { handler: RequestListener }) {
          route = options.handler
          return () => undefined
        },
      },
      inject(_deps: readonly string[], factory: (inner: unknown) => unknown) {
        return factory(ctx)
      },
      effect(factory: () => unknown) {
        const result = factory()
        if (typeof result === 'function') disposers.push(result as () => void | Promise<void>)
      },
    } as unknown as Context
    const config: Config = {
      catalogUrl: `${catalogServer.origin}/catalog-v1.json`,
      maxAgeMs: 48 * 60 * 60 * 1000,
      timeoutMs: 5_000,
      maxBytes: 1_000_000,
      agentTools: false,
    }
    await apply(ctx, config)
    expect(route).not.toBeNull()
    const apiServer = await listen((req, res) => (route as RequestListener)(req, res))
    const request = { query: '', category: 'all', installability: 'all', sort: 'recommended', page: 1 }

    const bootstrap = await post<{ ok: true; value: MarketplaceBootstrapResponse }>(apiServer.origin, {
      method: 'bootstrap', params: request,
    })
    expect(bootstrap).toMatchObject({
      status: 200,
      body: { ok: true, value: { list: { catalogStatus: 'ready', total: 1 } } },
    })
    expect(catalogRequests).toBe(1)
    expect(bootstrap.body.value.list.items).toHaveLength(1)
    expect(bootstrap.body.value.operations.plugins).toEqual([])

    const list = await post<{ ok: true; value: MarketplaceListResponse }>(apiServer.origin, {
      method: 'list', params: { ...request, query: 'example' },
    })
    expect(list.body.value.items[0]?.publisher).toBe('example')

    const refresh = await post<{ ok: true; value: MarketplaceRefreshResponse }>(apiServer.origin, {
      method: 'refresh', params: { request, currentDigest: bootstrap.body.value.list.digest },
    })
    expect(refresh.body.value).toMatchObject({ changed: false, list: null, source: 'network', error: null })
    expect(catalogRequests).toBe(2)

    const installed = await post<{ ok: true; value: { items: unknown[]; external: unknown[] } }>(apiServer.origin, {
      method: 'installed',
    })
    expect(installed.body.value).toMatchObject({ items: [], external: [] })

    const packs = await post<{ ok: true; value: MarketplacePackListResponse }>(apiServer.origin, {
      method: 'packs',
    })
    expect(packs.body.value.packs).toHaveLength(1)
    expect(packs.body.value.packs[0]).toMatchObject({
      repositoryId: '654321',
      name: 'DSH Essentials',
      publisher: 'example',
      itemCount: 1,
    })

    const packDetail = await post<{ ok: true; value: MarketplacePackDetailResponse }>(apiServer.origin, {
      method: 'packDetail', params: { repositoryId: '654321' },
    })
    expect(packDetail.body.value.pack?.repositoryId).toBe('654321')
    expect(packDetail.body.value.items).toEqual([{
      fullName: 'example/dsh-weather-bundle',
      repositoryId: '123456',
      status: 'installable',
      name: '@example/dsh-weather-bundle',
      packageName: '@example/dsh-weather-bundle',
      repositoryUrl: 'https://github.com/example/dsh-weather-bundle',
      state: null,
    }])

    const missingPack = await post<{ ok: true; value: MarketplacePackDetailResponse }>(apiServer.origin, {
      method: 'packDetail', params: { repositoryId: 'missing' },
    })
    expect(missingPack.body.value).toEqual({ pack: null, items: [] })

    const badPackDetail = await post<{ ok: false; error: { code: string } }>(apiServer.origin, {
      method: 'packDetail', params: {},
    })
    expect(badPackDetail).toMatchObject({ status: 400, body: { ok: false, error: { code: 'request-invalid' } } })

    const badCategory = await post<{ ok: false; error: { code: string } }>(apiServer.origin, {
      method: 'list', params: { ...request, category: 'invented' },
    })
    expect(badCategory).toMatchObject({ status: 400, body: { ok: false, error: { code: 'request-invalid' } } })

    const denied = await post<{ ok: false; error: { code: string } }>(apiServer.origin, {
      method: 'list', params: request,
    }, 'https://attacker.example')
    expect(denied).toMatchObject({ status: 403, body: { ok: false, error: { code: 'origin-denied' } } })

    const sameSite = await fetch(`${apiServer.origin}/api/plugin-marketplace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({ method: 'list', params: request }),
    })
    expect(sameSite.status).toBe(200)
  })
})
