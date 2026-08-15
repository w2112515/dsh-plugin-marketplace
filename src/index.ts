/** Out-of-tree DSH bundle Host entry: catalog owner, profile operations, and same-origin API. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { readProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { applyMarketplaceAgentTools } from './agent-tools.ts'
import { MarketplaceCatalogClient } from './catalog-client.ts'
import { detailMarketplaceEntry, detailMarketplacePack, installedMarketplacePlugins, listMarketplacePacks, MARKETPLACE_CATEGORY_PRIORITY, queryMarketplaceCatalog } from './catalog-query.ts'
import {
  detectMarketplaceOperationCapabilities,
  MarketplaceProfileOperations,
  type MarketplaceProfileRuntime,
} from './profile-operations.ts'
import type {
  MarketplaceExecuteRequest,
  MarketplaceListRequest,
  MarketplacePlanRequest,
  MarketplaceRefreshResponse,
} from './types.ts'

export type * from './types.ts'
export {
  computeMarketplaceCatalogDigest,
  MarketplaceCatalogParseError,
  parseMarketplaceCatalogText,
  sealMarketplaceCatalog,
} from './catalog.ts'

export const name = 'plugin-marketplace'
export const inject = ['webServer', 'tools', 'systemPrompt']

export interface Config {
  readonly catalogUrl: string
  readonly maxAgeMs: number
  readonly timeoutMs: number
  readonly maxBytes: number
  /** Register the agent-facing marketplace tools (search/detail/install/manual-guide). */
  readonly agentTools: boolean
}

export const Config: z<Config> = z.object({
  catalogUrl: z.string().default(''),
  maxAgeMs: z.natural().min(1).default(48 * 60 * 60 * 1000),
  timeoutMs: z.natural().min(1).default(15_000),
  maxBytes: z.natural().min(1).default(5_000_000),
  agentTools: z.boolean().default(true),
})

const API_PATH = '/api/plugin-marketplace'
const MAX_API_BODY_BYTES = 32 * 1024

class ApiFailure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    throw new ApiFailure(415, 'content-type-invalid', 'Expected an application/json request.')
  }
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > MAX_API_BODY_BYTES) throw new ApiFailure(413, 'request-too-large', 'The request is too large.')
    chunks.push(buffer)
  }
  let value: unknown
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new ApiFailure(400, 'json-invalid', 'The request body is not valid JSON.')
  }
  if (!isRecord(value)) throw new ApiFailure(400, 'request-invalid', 'The request body must be an object.')
  return value
}

function verifySameOrigin(req: IncomingMessage): void {
  const host = req.headers.host
  const origin = req.headers.origin
  let originUrl: URL | null = null
  try {
    originUrl = origin === undefined ? null : new URL(origin)
  } catch {
    originUrl = null
  }
  if (host === undefined || originUrl === null
    || (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:')
    || originUrl.host !== host) {
    throw new ApiFailure(403, 'origin-denied', 'The marketplace API accepts only same-origin WebUI requests.')
  }
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

function planRequest(value: unknown): MarketplacePlanRequest {
  if (!isRecord(value) || typeof value.repositoryId !== 'string'
    || (value.action !== 'install' && value.action !== 'remove')) {
    throw new ApiFailure(400, 'request-invalid', 'Invalid marketplace plan request.')
  }
  return { repositoryId: value.repositoryId, action: value.action }
}

function executeRequest(value: unknown): MarketplaceExecuteRequest {
  if (!isRecord(value) || typeof value.planId !== 'string' || value.planId.length === 0
    || (value.allowScripts !== undefined && typeof value.allowScripts !== 'boolean')) {
    throw new ApiFailure(400, 'request-invalid', 'Invalid marketplace execute request.')
  }
  return {
    planId: value.planId as MarketplaceExecuteRequest['planId'],
    ...(typeof value.allowScripts === 'boolean' ? { allowScripts: value.allowScripts } : {}),
  }
}

const INSTALLABILITY_FILTERS = new Set(['all', 'one-click-eligible', 'manual'])
const CATEGORY_FILTERS = new Set(['all', 'uncategorized', ...MARKETPLACE_CATEGORY_PRIORITY])
const SORTS = new Set(['recommended', 'stars', 'recently-updated', 'recently-added'])

function listRequest(value: unknown): MarketplaceListRequest {
  if (!isRecord(value) || typeof value.query !== 'string' || value.query.length > 256
    || typeof value.category !== 'string' || !CATEGORY_FILTERS.has(value.category)
    || typeof value.installability !== 'string' || !INSTALLABILITY_FILTERS.has(value.installability)
    || typeof value.sort !== 'string' || !SORTS.has(value.sort)
    || typeof value.page !== 'number' || !Number.isSafeInteger(value.page) || value.page < 1) {
    throw new ApiFailure(400, 'request-invalid', 'Invalid marketplace list request.')
  }
  return value as unknown as MarketplaceListRequest
}

function detailRequest(value: unknown): string {
  if (!isRecord(value) || typeof value.repositoryId !== 'string'
    || value.repositoryId.length === 0 || value.repositoryId.length > 128) {
    throw new ApiFailure(400, 'request-invalid', 'Invalid marketplace detail request.')
  }
  return value.repositoryId
}

function refreshRequest(value: unknown): { request: MarketplaceListRequest; currentDigest: string } {
  if (!isRecord(value) || typeof value.currentDigest !== 'string' || value.currentDigest.length > 128) {
    throw new ApiFailure(400, 'request-invalid', 'Invalid marketplace refresh request.')
  }
  return { request: listRequest(value.request), currentDigest: value.currentDigest }
}

function profileRuntime(ctx: Context): MarketplaceProfileRuntime {
  if (ctx.baseUrl === undefined || !ctx.baseUrl.startsWith('file:')) {
    throw new Error('plugin marketplace requires the Loader profile baseUrl')
  }
  const dir = fileURLToPath(ctx.baseUrl)
  const manifest = readProfileManifest('dsh marketplace', dir)
  return {
    profileName: basename(dir),
    dir,
    dependenciesAtLaunch: { ...(manifest.dependencies ?? {}) },
    bundlesAtLaunch: [...(manifest.dsh?.profile?.bundles ?? [])],
  }
}

/** Mount the external bundle against public Host services only. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const catalog = new MarketplaceCatalogClient({
    sourceUrl: config.catalogUrl,
    cachePath: dshHomePath('cache', 'plugin-marketplace', 'catalog-v1.json'),
    maxAgeMs: config.maxAgeMs,
    timeoutMs: config.timeoutMs,
    maxBytes: config.maxBytes,
  })
  await catalog.initialize()
  const runtime = profileRuntime(ctx)
  const capabilities = await detectMarketplaceOperationCapabilities(runtime)
  const operations = new MarketplaceProfileOperations({
    runtime,
    catalog: () => catalog.view().catalog,
    capabilities,
  })

  const disposeRoute = ctx.webServer.register({
    kind: 'exact',
    path: API_PATH,
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') {
          res.setHeader('allow', 'POST')
          throw new ApiFailure(405, 'method-not-allowed', 'Use POST for marketplace API requests.')
        }
        verifySameOrigin(req)
        const body = await readJson(req)
        const method = body.method
        let value: unknown
        switch (method) {
          case 'bootstrap': {
            const request = listRequest(body.params)
            if (catalog.view().catalog === null) await catalog.refresh()
            value = {
              list: queryMarketplaceCatalog(catalog.view(), request),
              capabilities,
              operations: operations.snapshot(),
            }
            break
          }
          case 'list': value = queryMarketplaceCatalog(catalog.view(), listRequest(body.params)); break
          case 'detail': {
            value = detailMarketplaceEntry(catalog.view(), detailRequest(body.params), operations.snapshot().plugins)
            break
          }
          case 'refresh': {
            const params = refreshRequest(body.params)
            const refreshed = await catalog.refresh()
            const list = queryMarketplaceCatalog(refreshed, params.request)
            const changed = list.digest !== params.currentDigest
            const result: MarketplaceRefreshResponse = {
              changed,
              list: changed ? list : null,
              source: list.source,
              stale: list.stale,
              lastSuccessfulFetchAt: list.lastSuccessfulFetchAt,
              error: list.error,
            }
            value = result
            break
          }
          case 'operationSnapshot': value = operations.snapshot(); break
          case 'installed': value = installedMarketplacePlugins(catalog.view(), operations.snapshot()); break
          case 'packs': value = listMarketplacePacks(catalog.view()); break
          case 'packDetail': {
            value = detailMarketplacePack(catalog.view(), operations.snapshot(), detailRequest(body.params))
            break
          }
          case 'plan': value = operations.plan(planRequest(body.params)); break
          case 'execute': value = await operations.execute(executeRequest(body.params)); break
          default: throw new ApiFailure(404, 'method-unknown', 'Unknown marketplace API method.')
        }
        sendJson(res, 200, { ok: true, value })
      } catch (error) {
        const failure = error instanceof ApiFailure
          ? error
          : new ApiFailure(500, 'request-failed', 'The marketplace request could not be completed.')
        sendJson(res, failure.status, { ok: false, error: { code: failure.code, message: failure.message } })
      }
    },
  })

  ctx.effect(() => disposeRoute, 'plugin-marketplace.api')

  if (config.agentTools) {
    applyMarketplaceAgentTools(ctx, {
      catalog: () => catalog.view(),
      operations,
      capabilities,
    })
  }
  ctx.effect(() => async () => {
    await operations.close()
    await catalog.close()
  }, 'plugin-marketplace.close')
}
