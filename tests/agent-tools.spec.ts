import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { applyMarketplaceAgentTools, extractInstallGuide, formatAgentRating, type MarketplaceAgentToolsDeps } from '../src/agent-tools.ts'
import { catalogFixture } from './fixture.ts'
import type { MarketplaceCatalogSnapshot, MarketplaceCatalogView, MarketplaceOperationCapabilities } from '../src/types.ts'

interface RegisteredTool {
  readonly name: string
  readonly execute: (args: unknown, exec: { signal: AbortSignal }) => Promise<unknown>
}

function viewOf(catalog: MarketplaceCatalogSnapshot | null): MarketplaceCatalogView {
  return {
    status: catalog === null ? 'unavailable' : 'ready',
    source: 'cache',
    sourceUrl: 'test',
    lastSuccessfulFetchAt: null,
    stale: false,
    catalog,
    error: null,
  }
}

function harness(catalog: MarketplaceCatalogSnapshot | null, operations?: Partial<{
  plan: ReturnType<typeof vi.fn>
  execute: ReturnType<typeof vi.fn>
  snapshot: ReturnType<typeof vi.fn>
}>) {
  const tools: RegisteredTool[] = []
  const listeners: Array<{ exec: { name: string; arguments: unknown } }> = []
  let guard: ((exec: { name: string; arguments: unknown }, next: () => Promise<unknown>) => Promise<unknown>) | null = null
  const ctx = {
    tools: { register: (definition: RegisteredTool) => { tools.push(definition); return () => {} } },
    systemPrompt: { section: () => () => {} },
    on: (_event: string, listener: NonNullable<typeof guard>) => { guard = listener },
  } as unknown as Context
  const capabilities: MarketplaceOperationCapabilities = { packageManager: 'pnpm', profileWritable: true, profileName: 'web', message: null }
  const deps: MarketplaceAgentToolsDeps = {
    catalog: () => viewOf(catalog),
    capabilities,
    operations: {
      plan: vi.fn(() => ({ status: 'ready', planId: 'plan-1', blockCode: null, action: 'install', profileName: 'web', repositoryId: '123456', packageName: '@example/dsh-weather-bundle', packageVersion: '1.0.0', sourceRef: 'git+…#0123456', commitSha: '0123456789abcdef0123456789abcdef01234567', requiresScripts: false, installScripts: null, warnings: [], expiresAt: null })),
      execute: vi.fn(async () => ({ status: 'succeeded', code: 'succeeded', action: 'install', profileName: 'web', packageName: '@example/dsh-weather-bundle', requiresRestart: true, rollback: 'not-needed', detail: null })),
      snapshot: vi.fn(() => ({ plugins: [] })),
      ...operations,
    } as unknown as MarketplaceAgentToolsDeps['operations'],
  }
  applyMarketplaceAgentTools(ctx, deps)
  const byName = (name: string) => {
    const tool = tools.find(candidate => candidate.name === name)
    if (!tool) throw new Error(`tool ${name} not registered`)
    return tool
  }
  return { tools, byName, guard: () => { if (!guard) throw new Error('guard not registered'); return guard }, deps, listeners }
}

const exec = { signal: new AbortController().signal }

describe('marketplace agent tools', () => {
  it('registers the four tools and the install guard', () => {
    const { tools, guard } = harness(catalogFixture())
    expect(tools.map(tool => tool.name).sort()).toEqual(['marketplace_detail', 'marketplace_install', 'marketplace_manual_guide', 'marketplace_search'])
    expect(guard()).toBeTypeOf('function')
  })

  it('searches the catalog and returns compact rows keyed by repositoryId', async () => {
    const { byName } = harness(catalogFixture())
    const result = await byName('marketplace_search').execute({ query: 'weather' }, exec) as { available: boolean; total: number; items: Array<{ repositoryId: string; installability: string }> }
    expect(result.available).toBe(true)
    expect(result.total).toBe(1)
    expect(result.items[0]?.repositoryId).toBe('123456')
    expect(result.items[0]?.installability).toBe('one-click-eligible')
  })

  it('reports an unavailable catalog honestly instead of an empty list', async () => {
    const { byName } = harness(null)
    const result = await byName('marketplace_search').execute({}, exec) as { available: boolean; message: string }
    expect(result.available).toBe(false)
    expect(result.message).toContain('not loaded')
  })

  it('details an entry with evidence and one-click guidance', async () => {
    const { byName } = harness(catalogFixture())
    const result = await byName('marketplace_detail').execute({ repositoryId: '123456' }, exec) as { found: boolean; detail: string }
    expect(result.found).toBe(true)
    expect(result.detail).toContain('marketplace_install')
    expect(result.detail).toContain('git-source')
  })

  it('returns found:false for an unknown repositoryId', async () => {
    const { byName } = harness(catalogFixture())
    const result = await byName('marketplace_detail').execute({ repositoryId: 'nope' }, exec) as { found: boolean }
    expect(result.found).toBe(false)
  })

  it('installs a one-click entry through the existing plan→execute pipeline', async () => {
    const { byName, deps } = harness(catalogFixture())
    const result = await byName('marketplace_install').execute({ repositoryId: '123456' }, exec) as { installed: boolean; requiresRestart: boolean; message: string }
    expect(result.installed).toBe(true)
    expect(result.requiresRestart).toBe(true)
    expect(result.message).toContain('restart dsh web')
    expect(deps.operations.plan).toHaveBeenCalledWith({ repositoryId: '123456', action: 'install' })
    expect(deps.operations.execute).toHaveBeenCalledWith({ planId: 'plan-1' })
  })

  it('refuses entries the plan gates behind script review, without executing', async () => {
    const { byName, deps } = harness(catalogFixture(), {
      plan: vi.fn(() => ({ status: 'blocked', planId: null, blockCode: 'not-one-click-eligible', action: 'install', profileName: 'web', repositoryId: '123456', packageName: null, packageVersion: null, sourceRef: null, commitSha: null, requiresScripts: true, installScripts: null, warnings: [], expiresAt: null })),
    })
    const result = await byName('marketplace_install').execute({ repositoryId: '123456' }, exec) as { installed: boolean; code: string; message: string }
    expect(result.installed).toBe(false)
    expect(result.code).toBe('not-one-click-eligible')
    expect(result.message).toContain('verbatim')
    expect(deps.operations.execute).not.toHaveBeenCalled()
  })

  it('refuses to install when the Host cannot write the profile', async () => {
    const ctx = harness(catalogFixture())
    const deps: MarketplaceAgentToolsDeps = { ...ctx.deps, capabilities: { packageManager: 'unavailable', profileWritable: true, profileName: 'web', message: 'no pnpm' } }
    const tools: RegisteredTool[] = []
    applyMarketplaceAgentTools({ tools: { register: (d: RegisteredTool) => { tools.push(d); return () => {} } }, systemPrompt: { section: () => () => {} }, on: () => {} } as unknown as Context, deps)
    const install = tools.find(tool => tool.name === 'marketplace_install')
    const result = await install?.execute({ repositoryId: '123456' }, exec) as { installed: boolean; code: string }
    expect(result.installed).toBe(false)
    expect(result.code).toBe('capabilities-unavailable')
  })

  it('asks for one-time human approval on every install call, with catalog facts in the reason', async () => {
    const { guard } = harness(catalogFixture())
    const decision = await guard()({ name: 'marketplace_install', arguments: { repositoryId: '123456' } }, async () => ({ kind: 'allow' })) as { kind: string; reason: string }
    expect(decision.kind).toBe('ask')
    expect(decision.reason).toContain('example/dsh-weather-bundle')
    expect(decision.reason).toContain('0123456789'.slice(0, 10))
    expect(decision.reason).toContain('never persisted')
  })

  it('leaves every other tool call to the next guard', async () => {
    const { guard } = harness(catalogFixture())
    const decision = await guard()({ name: 'marketplace_search', arguments: {} }, async () => ({ kind: 'allow' })) as { kind: string }
    expect(decision.kind).toBe('allow')
  })

  it('redirects non-manual entries away from the manual guide', async () => {
    const { byName } = harness(catalogFixture())
    const result = await byName('marketplace_manual_guide').execute({ repositoryId: '123456' }, exec) as { found: boolean; message: string }
    expect(result.found).toBe(false)
    expect(result.message).toContain('not manual')
  })

  it('formats ratings with the same 10-vote verdict gate as the WebUI', () => {
    expect(formatAgentRating(null)).toBe('no vote channel yet')
    expect(formatAgentRating({ up: 0, down: 0, upRecent: 0, downRecent: 0 })).toBe('no votes yet')
    expect(formatAgentRating({ up: 9, down: 0, upRecent: 2, downRecent: 0 })).toContain('9/10')
    expect(formatAgentRating({ up: 19, down: 1, upRecent: 4, downRecent: 0 })).toBe('95% positive of 20 votes, last 90 days 100% of 4')
  })

  it('extracts install sections from a README and truncates to the cap', () => {
    const readme = '# Title\n\nintro text\n\n## Install\n\nrun `dsh plugin add x`\n\n## License\n\nMIT\n'
    expect(extractInstallGuide(readme)).toContain('dsh plugin add x')
    expect(extractInstallGuide(readme)).not.toContain('License')
    const long = `## 安装\n\n${'步骤'.repeat(2000)}`
    const extracted = extractInstallGuide(long)
    expect(extracted.length).toBeLessThanOrEqual(2100)
    expect(extracted).toContain('truncated')
  })
})
