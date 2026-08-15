import { mkdtemp, readFile, rm } from 'node:fs/promises'
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

class FixtureGitHub implements MarketplaceGitHubReader {
  readonly contentCalls: string[] = []
  incomplete = false
  notModified = false

  constructor(readonly repositories: readonly GitHubRepository[]) {}

  async searchRepositories(_topic: string, _window: GitHubSearchWindow, page: number): Promise<GitHubSearchPage> {
    return {
      totalCount: this.repositories.length,
      incomplete: this.incomplete,
      repositories: page === 1 ? this.repositories : [],
    }
  }

  async resolveDefaultBranchCommits(
    repositories: readonly GitHubRepository[],
  ): Promise<Readonly<Record<string, string>>> {
    return Object.fromEntries(repositories.map(item => [item.id, item.id.padStart(40, '0')]))
  }

  async getContent(fullName: string, path: string, _ref: string, etag: string | null): Promise<GitHubContentResult> {
    this.contentCalls.push(`${fullName}/${path}`)
    if (this.notModified && etag !== null) return { status: 'not-modified', etag }
    if (fullName.endsWith('/invalid') && path === 'cordis.patch.yml') {
      return { status: 'not-found', etag: null }
    }
    if (path === 'package.json') {
      const risky = fullName.endsWith('/risky')
      return {
        status: 'ok',
        etag: `"package-${fullName}"`,
        text: JSON.stringify({
          name: `@fixture/${fullName.split('/')[1]}`,
          version: '1.0.0',
          keywords: ['dsh'],
          scripts: risky ? { prepare: 'node should-never-run.js' } : {},
          dsh: { bundle: { patch: './cordis.patch.yml' } },
        }),
      }
    }
    return {
      status: 'ok',
      etag: `"patch-${fullName}"`,
      text: '- insert:\n    - id: fixture\n      name: fixture:plugin\n',
    }
  }

}

async function paths(): Promise<{ outputPath: string; statePath: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-marketplace-scanner-'))
  roots.push(root)
  return {
    outputPath: join(root, 'public', 'catalog-v1.json'),
    statePath: join(root, 'private', 'scanner-state-v1.json'),
  }
}

describe('plugin marketplace scanner', () => {
  it('publishes valid, risky, and invalid repositories without executing package scripts', async () => {
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
    expect(catalog.summary).toEqual({ entryCount: 3, invalidEntryCount: 1 })
    expect(catalog.entries.find(entry => entry.repository.fullName.endsWith('/valid'))).toMatchObject({
      validation: { status: 'valid', code: 'valid-bundle' },
      compatibility: 'unknown',
      installability: 'one-click-eligible',
      riskSignals: ['git-source'],
    })
    expect(catalog.entries.find(entry => entry.repository.fullName.endsWith('/risky'))?.riskSignals)
      .toEqual(['git-source', 'lifecycle-script'])
    expect(catalog.entries.find(entry => entry.repository.fullName.endsWith('/risky'))?.installability)
      .toBe('manual')
    expect(catalog.entries.find(entry => entry.repository.fullName.endsWith('/invalid'))).toMatchObject({
      validation: { status: 'invalid', code: 'patch-missing' },
      installability: 'browse-only',
    })
    expect(JSON.parse(await readFile(files.outputPath, 'utf8'))).toEqual(catalog)
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
    const failed = new FixtureGitHub([repository(1, 'valid')])
    failed.incomplete = true
    await expect(runMarketplaceScan({
      client: failed,
      topic: DEFAULT_MARKETPLACE_TOPIC,
      ...files,
      now: () => new Date('2026-08-15T01:00:00.000Z'),
    })).rejects.toThrow('incomplete_results')
    expect(await readFile(files.outputPath, 'utf8')).toBe(before)
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
})
