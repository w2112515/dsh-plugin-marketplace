import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  GitHubContentResult,
  GitHubRepository,
  GitHubSearchPage,
  GitHubSearchWindow,
} from './plugin-marketplace-github.ts'
import {
  DEFAULT_MARKETPLACE_TOPIC,
  MARKETPLACE_PACK_TOPIC,
  runMarketplaceScan,
  type MarketplaceGitHubReader,
} from './plugin-marketplace-scan.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function repository(id: number, name: string, overrides: Partial<GitHubRepository> = {}): GitHubRepository {
  return {
    id: String(id),
    fullName: `fixture/${name}`,
    url: `https://github.com/fixture/${name}`,
    defaultBranch: 'main',
    archived: false,
    description: `${name} description`,
    stars: id,
    createdAt: '2026-08-01T00:00:00.000Z',
    pushedAt: '2026-08-14T00:00:00.000Z',
    topics: [DEFAULT_MARKETPLACE_TOPIC],
    owner: 'fixture',
    license: 'MIT',
    ...overrides,
  }
}

function packRepository(id: number, name: string, overrides: Partial<GitHubRepository> = {}): GitHubRepository {
  return repository(id, name, { topics: [DEFAULT_MARKETPLACE_TOPIC, MARKETPLACE_PACK_TOPIC], ...overrides })
}

class FixtureGitHub implements MarketplaceGitHubReader {
  readonly contentCalls: string[] = []
  readonly treeCalls: string[] = []
  incomplete = false
  notModified = false
  /** Ids GitHub Search fails to return this run, simulating paging drift. */
  readonly omittedFromSearch = new Set<string>()
  readonly deletedIds = new Set<string>()
  readonly failingIds = new Set<string>()
  readonly topicWithdrawnIds = new Set<string>()
  readonly pushedAtOverrides = new Map<string, string>()

  constructor(readonly repositories: readonly GitHubRepository[]) {}

  async searchRepositories(_topic: string, _window: GitHubSearchWindow, page: number): Promise<GitHubSearchPage> {
    const visible = this.repositories.filter(item => !this.omittedFromSearch.has(item.id))
    return {
      totalCount: visible.length,
      incomplete: this.incomplete,
      repositories: page === 1 ? visible : [],
    }
  }

  async getRepositoryById(id: string): Promise<GitHubRepository | null> {
    if (this.failingIds.has(id)) throw new Error('temporary GitHub failure')
    if (this.deletedIds.has(id)) return null
    const found = this.repositories.find(item => item.id === id)
    if (found === undefined) return null
    return {
      ...found,
      topics: this.topicWithdrawnIds.has(id) ? [] : found.topics,
      pushedAt: this.pushedAtOverrides.get(id) ?? found.pushedAt,
    }
  }

  async resolveDefaultBranchCommits(
    repositories: readonly GitHubRepository[],
  ): Promise<Readonly<Record<string, string>>> {
    return Object.fromEntries(repositories.map(item => [item.id, item.id.padStart(40, '0')]))
  }

  /** The pinned commit's tree; repos named *-unshipped lack the built entry file. */
  async getTreePaths(fullName: string, _ref: string): Promise<{ paths: ReadonlySet<string>; truncated: boolean }> {
    this.treeCalls.push(fullName)
    const paths = new Set(['package.json', 'cordis.patch.yml', 'dsh.pack.json', 'lib/index.mjs'])
    if (fullName.includes('direct-file')) paths.add('lib/plugin.mjs')
    if (fullName.endsWith('-unshipped')) paths.delete('lib/index.mjs')
    return { paths, truncated: fullName.endsWith('/truncated-tree') }
  }

  async getContent(fullName: string, path: string, _ref: string, etag: string | null): Promise<GitHubContentResult> {
    this.contentCalls.push(`${fullName}/${path}`)
    if (this.notModified && etag !== null) return { status: 'not-modified', etag }
    if (fullName.endsWith('/invalid') && path === 'cordis.patch.yml') {
      return { status: 'not-found', etag: null }
    }
    if (path === 'dsh.pack.json') {
      if (fullName.endsWith('/pack-no-manifest')) return { status: 'not-found', etag: null }
      if (fullName.endsWith('/pack-invalid')) return { status: 'ok', etag: '"pack"', text: '{ "schemaVersion": 1, "items": "not-an-array" }' }
      if (fullName.endsWith('/pack-empty')) return { status: 'ok', etag: '"pack"', text: '{ "schemaVersion": 1, "items": [] }' }
      return {
        status: 'ok',
        etag: `"pack-${fullName}"`,
        text: JSON.stringify({
          schemaVersion: 1,
          name: 'Fixture Pack',
          description: 'A curated fixture set',
          items: ['fixture/valid', 'fixture/not-scanned'],
        }),
      }
    }
    if (path === 'package.json') {
      const risky = fullName.endsWith('/risky')
      const scripted = fullName.endsWith('/scripted-unshipped')
      const root = fullName.endsWith('/dsh-root')
      const noHostExport = fullName.endsWith('/no-host-export')
      const clientExportMissing = fullName.endsWith('/client-export-missing')
      const stringExport = fullName.endsWith('/string-export')
      return {
        status: 'ok',
        etag: `"package-${fullName}"`,
        text: JSON.stringify({
          name: `@fixture/${fullName.split('/')[1]}`,
          version: '1.0.0',
          keywords: ['dsh'],
          scripts: risky || scripted ? { prepare: 'node should-never-run.js' } : {},
          ...(root ? {} : {
            ...(noHostExport ? {} : { exports: stringExport ? './lib/index.mjs' : { '.': './lib/index.mjs' } }),
            dsh: {
              bundle: { patch: './cordis.patch.yml' },
              ...(clientExportMissing ? { client: { platform: 'web' } } : {}),
            },
          }),
        }),
      }
    }
    if (fullName.includes('direct-file') && path === 'cordis.patch.yml') {
      return {
        status: 'ok',
        etag: `"patch-${fullName}"`,
        text: '- insert:\n    - id: fixture\n      name: ./lib/plugin.mjs\n',
      }
    }
    if (fullName.endsWith('/dynamic-patch') && path === 'cordis.patch.yml') {
      return {
        status: 'ok',
        etag: `"patch-${fullName}"`,
        text: "- insert:\n    - id: fixture\n      name: fixture:plugin\n      config: !!js process.env.FIXTURE_FLAG ?? 'off'\n",
      }
    }
    return {
      status: 'ok',
      etag: `"patch-${fullName}"`,
      text: '- insert:\n    - id: fixture\n      name: fixture:plugin\n',
    }
  }

}

async function paths(): Promise<{ outputPath: string; rejectedPath: string; statePath: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-marketplace-scanner-'))
  roots.push(root)
  return {
    outputPath: join(root, 'public', 'catalog-v1.json'),
    rejectedPath: join(root, 'artifacts', 'rejected-v1.json'),
    statePath: join(root, 'private', 'scanner-state-v1.json'),
  }
}

describe('plugin marketplace scanner', () => {
  it('publishes only active valid repositories and records all rejected candidates without executing scripts', async () => {
    const files = await paths()
    const github = new FixtureGitHub([
      repository(1, 'valid'),
      repository(2, 'risky'),
      repository(3, 'invalid'),
    ])
    const catalog = await runMarketplaceScan({
      client: github,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    })
    expect(catalog.summary).toEqual({ entryCount: 2, invalidEntryCount: 0, packCount: 0 })
    expect(catalog.entries.find(entry => entry.repository.fullName.endsWith('/valid'))).toMatchObject({
      validation: { status: 'valid', code: 'valid-bundle' },
      compatibility: 'unknown',
      installability: 'one-click-eligible',
      riskSignals: ['git-source'],
      installScripts: null,
    })
    // Ships built output at the pin: one-click installs run with
    // --ignore-scripts, so the prepare script is a displayed risk, not a blocker.
    const risky = catalog.entries.find(entry => entry.repository.fullName.endsWith('/risky'))
    expect(risky?.riskSignals).toEqual(['git-source', 'lifecycle-script'])
    expect(risky?.installability).toBe('one-click-eligible')
    expect(risky?.installScripts).toEqual({ prepare: 'node should-never-run.js' })
    expect(catalog.entries.find(entry => entry.repository.fullName.endsWith('/invalid'))).toBeUndefined()
    const rejected = JSON.parse(await readFile(files.rejectedPath, 'utf8'))
    expect(rejected.summary).toEqual({ entryCount: 1, invalidEntryCount: 1, packCount: 0 })
    expect(rejected.entries.find((entry: { repository: { fullName: string } }) => entry.repository.fullName.endsWith('/invalid'))).toMatchObject({
      validation: { status: 'invalid', code: 'patch-missing' },
      installability: 'browse-only',
    })
    expect(JSON.parse(await readFile(files.outputPath, 'utf8'))).toEqual(catalog)
  })

  it('grants one-click only when install targets exist at the pinned commit', async () => {
    const files = await paths()
    const github = new FixtureGitHub([
      repository(1, 'active'),
      repository(2, 'string-export'),
      repository(3, 'direct-file-shipped'),
      repository(4, 'no-host-export'),
      repository(5, 'client-export-missing'),
      repository(6, 'lib-unshipped'),
      repository(7, 'scripted-unshipped'),
      repository(8, 'truncated-tree'),
    ])
    const catalog = await runMarketplaceScan({
      client: github,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    })
    expect(catalog.summary).toEqual({ entryCount: 8, invalidEntryCount: 0, packCount: 0 })
    for (const name of ['active', 'string-export', 'direct-file-shipped']) {
      expect(catalog.entries.find(entry => entry.repository.fullName.endsWith(`/${name}`))?.installability)
        .toBe('one-click-eligible')
    }
    // Giant-tree fallback: truncated trees degrade to per-file existence reads.
    expect(catalog.entries.find(entry => entry.repository.fullName.endsWith('/truncated-tree'))?.installability)
      .toBe('one-click-eligible')
    for (const name of ['no-host-export', 'client-export-missing', 'lib-unshipped']) {
      expect(catalog.entries.find(entry => entry.repository.fullName.endsWith(`/${name}`))?.installability)
        .toBe('manual')
    }
    // Unshipped + lifecycle scripts: the consent-gated path, scripts verbatim.
    const scripted = catalog.entries.find(entry => entry.repository.fullName.endsWith('/scripted-unshipped'))
    expect(scripted?.installability).toBe('manual')
    expect(scripted?.installScripts).toEqual({ prepare: 'node should-never-run.js' })
    expect(catalog.entries.find(entry => entry.repository.fullName.endsWith('/lib-unshipped'))?.installScripts)
      .toBeNull()
    expect(github.contentCalls.filter(call => call.includes('/active/')))
      .toEqual(['fixture/active/package.json', 'fixture/active/cordis.patch.yml'])
  })

  it('keeps dsh-root and request failures out of the public catalog', async () => {
    const files = await paths()
    const github = new FixtureGitHub([
      repository(1, 'active'),
      repository(2, 'dsh-root'),
      repository(3, 'archived', { archived: true }),
      repository(7, 'request-failed'),
    ])
    const originalGetContent = github.getContent.bind(github)
    github.getContent = async (...args) => {
      if (args[0].endsWith('/request-failed')) throw new Error('temporary GitHub failure')
      return originalGetContent(...args)
    }
    const catalog = await runMarketplaceScan({
      client: github,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    })
    expect(catalog.summary).toEqual({ entryCount: 1, invalidEntryCount: 0, packCount: 0 })
    const rejected = JSON.parse(await readFile(files.rejectedPath, 'utf8'))
    expect(rejected.summary).toEqual({ entryCount: 3, invalidEntryCount: 3, packCount: 0 })
    expect(rejected.entries.find((entry: { repository: { fullName: string } }) => entry.repository.fullName.endsWith('/dsh-root')))
      .toMatchObject({ validation: { code: 'bundle-declaration-missing' } })
    expect(rejected.entries.find((entry: { repository: { fullName: string } }) => entry.repository.fullName.endsWith('/archived')))
      .toMatchObject({ validation: { status: 'archived', code: 'repository-archived' } })
    expect(rejected.entries.find((entry: { repository: { fullName: string } }) => entry.repository.fullName.endsWith('/request-failed')))
      .toMatchObject({ validation: { status: 'invalid', code: 'github-request-failed' } })
  })

  it('validates repositories with bounded concurrency', async () => {
    const files = await paths()
    let active = 0
    let peak = 0
    const github = new FixtureGitHub(Array.from({ length: 20 }, (_, index) => repository(index + 1, `repo-${String(index + 1)}`)))
    const originalGetContent = github.getContent.bind(github)
    github.getContent = async (...args) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 1))
      try {
        return await originalGetContent(...args)
      } finally {
        active -= 1
      }
    }
    await runMarketplaceScan({
      client: github,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    })
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(12)
  })

  it('reuses valid state, retries invalid entries, and accepts ETag 304 after a push', async () => {
    const files = await paths()
    const repositories = [repository(1, 'valid'), repository(3, 'invalid')]
    const first = new FixtureGitHub(repositories)
    await runMarketplaceScan({
      client: first,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    })
    const second = new FixtureGitHub(repositories)
    await runMarketplaceScan({
      client: second,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    })
    expect(second.contentCalls.some(call => call.includes('/valid/'))).toBe(false)
    expect(second.treeCalls).toEqual([])
    expect(second.contentCalls.some(call => call.includes('/invalid/'))).toBe(true)

    const pushed = new FixtureGitHub(repositories.map(repo => ({
      ...repo,
      pushedAt: '2026-08-15T01:00:00.000Z',
    })))
    pushed.notModified = true
    const catalog = await runMarketplaceScan({
      client: pushed,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T02:00:00.000Z'),
    })
    expect(catalog.entries.find(entry => entry.repository.fullName.endsWith('/valid'))?.validation.code)
      .toBe('valid-bundle')
    // Same pin: the earlier existence proof is reused without another tree read.
    expect(pushed.treeCalls).toEqual([])
  })

  it('does not overwrite last-known-good output when search is incomplete', async () => {
    const files = await paths()
    const good = new FixtureGitHub([repository(1, 'valid')])
    await runMarketplaceScan({
      client: good,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    })
    const before = await readFile(files.outputPath, 'utf8')
    const rejectedBefore = await readFile(files.rejectedPath, 'utf8')
    const failed = new FixtureGitHub([repository(1, 'valid')])
    failed.incomplete = true
    await expect(runMarketplaceScan({
      client: failed,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T01:00:00.000Z'),
    })).rejects.toThrow('incomplete_results')
    expect(await readFile(files.outputPath, 'utf8')).toBe(before)
    expect(await readFile(files.rejectedPath, 'utf8')).toBe(rejectedBefore)
  })

  it('bisects search windows whose result count exceeds GitHub\'s 1,000-item cap', async () => {
    const files = await paths()
    const windows: GitHubSearchWindow[] = []
    const client: MarketplaceGitHubReader = {
      async searchRepositories(_topic, window) {
        windows.push(window)
        return {
          totalCount: windows.length === 1 ? 1_001 : 0,
          incomplete: false,
          repositories: [],
        }
      },
      async getContent() { throw new Error('not reached') },
      async getTreePaths() { throw new Error('not reached') },
      async getRepositoryById() { return null },
      async resolveDefaultBranchCommits() { return {} },
    }
    const catalog = await runMarketplaceScan({
      client,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    })
    expect(catalog.summary.entryCount).toBe(0)
    expect(windows).toHaveLength(3)
  })

  it('bisects an incomplete broad search before accepting complete child windows', async () => {
    const files = await paths()
    const windows: GitHubSearchWindow[] = []
    const client: MarketplaceGitHubReader = {
      async searchRepositories(_topic, window) {
        windows.push(window)
        return {
          totalCount: 0,
          incomplete: windows.length === 1,
          repositories: [],
        }
      },
      async getContent() { throw new Error('not reached') },
      async getTreePaths() { throw new Error('not reached') },
      async getRepositoryById() { return null },
      async resolveDefaultBranchCommits() { return {} },
    }
    const catalog = await runMarketplaceScan({
      client,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    })
    expect(catalog.summary.entryCount).toBe(0)
    expect(windows).toHaveLength(3)
  })

  it('validates patches in the Loader dialect without executing !!js expressions', async () => {
    const files = await paths()
    const github = new FixtureGitHub([repository(1, 'dynamic-patch')])
    const catalog = await runMarketplaceScan({
      client: github,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    })
    expect(catalog.entries.find(entry => entry.repository.fullName.endsWith('/dynamic-patch'))?.validation)
      .toMatchObject({ status: 'valid', code: 'valid-bundle' })
  })

  it('replays validation on fresh content when the scanner version changes, ignoring ETags', async () => {
    const files = await paths()
    const repositories = [repository(1, 'valid')]
    await runMarketplaceScan({
      client: new FixtureGitHub(repositories),
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    })
    // Simulate a scanner upgrade: the persisted state predates the current rules.
    const state = JSON.parse(await readFile(files.statePath, 'utf8')) as {
      repositories: Record<string, { validatorVersion: string }>
    }
    state.repositories['1']!.validatorVersion = 'ancient'
    await writeFile(files.statePath, JSON.stringify(state))
    const second = new FixtureGitHub(repositories)
    second.notModified = true // any conditional request would 304; none may be sent
    await runMarketplaceScan({
      client: second,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T01:00:00.000Z'),
    })
    expect(second.contentCalls.filter(call => call.includes('/valid/')))
      .toEqual(['fixture/valid/package.json', 'fixture/valid/cordis.patch.yml'])
    expect(second.treeCalls).toEqual(['fixture/valid'])
  })

  it('carries forward a repository search missed, and revalidates it after a push', async () => {
    const files = await paths()
    const repositories = [repository(1, 'stable'), repository(2, 'drifting')]
    await runMarketplaceScan({
      client: new FixtureGitHub(repositories),
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    })
    const second = new FixtureGitHub(repositories)
    second.omittedFromSearch.add('2')
    const catalog = await runMarketplaceScan({
      client: second,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T01:00:00.000Z'),
    })
    const carriedEntry = catalog.entries.find(entry => entry.repositoryId === '2')
    expect(carriedEntry?.repository.fullName).toBe('fixture/drifting')
    expect(carriedEntry?.firstSeenAt).toBe('2026-08-15T00:00:00.000Z')
    expect(second.contentCalls.some(call => call.includes('/drifting/'))).toBe(false)

    const third = new FixtureGitHub(repositories)
    third.omittedFromSearch.add('2')
    third.pushedAtOverrides.set('2', '2026-08-15T02:00:00.000Z')
    const republished = await runMarketplaceScan({
      client: third,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T02:00:00.000Z'),
    })
    expect(republished.entries.find(entry => entry.repositoryId === '2')?.lastCodePushAt)
      .toBe('2026-08-15T02:00:00.000Z')
    expect(third.contentCalls.some(call => call.includes('/drifting/'))).toBe(true)
  })

  it('evicts a missed repository only on proof of deletion or topic withdrawal', async () => {
    const files = await paths()
    const repositories = [repository(1, 'deleted'), repository(2, 'withdrawn'), repository(3, 'unreachable')]
    await runMarketplaceScan({
      client: new FixtureGitHub(repositories),
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    })
    const second = new FixtureGitHub(repositories)
    for (const id of ['1', '2', '3']) second.omittedFromSearch.add(id)
    second.deletedIds.add('1')
    second.topicWithdrawnIds.add('2')
    second.failingIds.add('3')
    const catalog = await runMarketplaceScan({
      client: second,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T01:00:00.000Z'),
    })
    expect(catalog.entries.map(entry => entry.repositoryId)).toEqual(['3'])
    const state = JSON.parse(await readFile(files.statePath, 'utf8')) as { repositories: Record<string, unknown> }
    expect(Object.keys(state.repositories)).toEqual(['3'])
  })

  it('validates double-tagged pack repositories as packs, never as bundles', async () => {
    const files = await paths()
    const github = new FixtureGitHub([
      repository(1, 'valid'),
      packRepository(20, 'good-pack'),
      packRepository(21, 'pack-no-manifest'),
      packRepository(22, 'pack-invalid'),
      packRepository(23, 'pack-empty'),
    ])
    const catalog = await runMarketplaceScan({
      client: github,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    })
    expect(catalog.summary).toEqual({ entryCount: 1, invalidEntryCount: 0, packCount: 1 })
    const pack = catalog.packs.find(candidate => candidate.repositoryId === '20')
    expect(pack).toMatchObject({
      name: 'Fixture Pack',
      validation: { status: 'valid', code: 'valid-pack' },
    })
    // Items resolve to stable repository ids against this run's stream; a
    // repository the scan never saw stays honestly unresolved.
    expect(pack?.items).toEqual([
      { fullName: 'fixture/valid', repositoryId: '1' },
      { fullName: 'fixture/not-scanned', repositoryId: null },
    ])
    // The pack branch never bundle-validates: no package.json or patch reads.
    expect(github.contentCalls.filter(call => call.includes('good-pack')))
      .toEqual(['fixture/good-pack/dsh.pack.json'])
    const rejected = JSON.parse(await readFile(files.rejectedPath, 'utf8'))
    expect(rejected.summary).toEqual({ entryCount: 0, invalidEntryCount: 0, packCount: 3 })
    const rejectedCodes = new Map(rejected.packs.map((entry: { repositoryId: string; validation: { code: string } }) => [entry.repositoryId, entry.validation.code]))
    expect(rejectedCodes.get('21')).toBe('pack-manifest-missing')
    expect(rejectedCodes.get('22')).toBe('pack-manifest-invalid')
    expect(rejectedCodes.get('23')).toBe('pack-manifest-invalid')
  })

  it('revalidates a repository whose kind flips between plugin and pack', async () => {
    const files = await paths()
    const asPlugin = repository(1, 'shapeshifter')
    await runMarketplaceScan({
      client: new FixtureGitHub([asPlugin]),
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    })
    const asPack = packRepository(1, 'shapeshifter')
    const second = new FixtureGitHub([asPack])
    const catalog = await runMarketplaceScan({
      client: second,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T01:00:00.000Z'),
    })
    expect(catalog.summary).toEqual({ entryCount: 0, invalidEntryCount: 0, packCount: 1 })
    expect(catalog.entries).toEqual([])
    expect(catalog.packs[0]?.repositoryId).toBe('1')
    expect(second.contentCalls.filter(call => call.includes('shapeshifter')))
      .toEqual(['fixture/shapeshifter/dsh.pack.json'])
  })
})
