import { describe, expect, it } from 'vitest'
import { deriveMarketplaceCategory, detailMarketplaceEntry, installedMarketplacePlugins, queryMarketplaceCatalog } from '../src/catalog-query.ts'
import type { MarketplaceCatalogEntry, MarketplaceCatalogView, MarketplaceListRequest, MarketplaceOperationSnapshot } from '../src/types.ts'
import { catalogFixture } from './fixture.ts'

const defaultRequest: MarketplaceListRequest = {
  query: '',
  category: 'all',
  installability: 'all',
  sort: 'recommended',
  page: 1,
}

function entry(id: number, overrides: Partial<MarketplaceCatalogEntry> = {}): MarketplaceCatalogEntry {
  const base = catalogFixture().entries[0]!
  return {
    ...base,
    repositoryId: String(id),
    repository: { ...base.repository, fullName: `publisher-${String(id)}/plugin-${String(id)}` },
    package: { ...base.package, name: `@publisher-${String(id)}/plugin-${String(id)}` },
    stars: id,
    ...overrides,
  }
}

function view(entries: readonly MarketplaceCatalogEntry[]): MarketplaceCatalogView {
  const catalog = catalogFixture({
    summary: { entryCount: entries.length, invalidEntryCount: 0 },
    entries,
  })
  return {
    status: entries.length === 0 ? 'empty' : 'ready',
    source: 'network',
    sourceUrl: 'https://catalog.example.test/catalog-v1.json',
    lastSuccessfulFetchAt: '2026-08-15T00:00:00.000Z',
    stale: false,
    catalog,
    error: null,
  }
}

describe('catalog query', () => {
  it('defensively admits only valid active installable bundles and pages by 50', () => {
    const valid = Array.from({ length: 53 }, (_, index) => entry(index + 1))
    const invalid = entry(100, { validation: { status: 'invalid', code: 'bundle-declaration-missing', message: 'missing' } })
    const archived = entry(101, {
      repository: { ...entry(101).repository, archived: true },
      validation: { status: 'archived', code: 'repository-archived', message: 'archived' },
      installability: 'browse-only',
    })
    const result = queryMarketplaceCatalog(view([...valid, invalid, archived]), defaultRequest)
    expect(result.counts.all).toBe(53)
    expect(result.counts.oneClick).toBe(53)
    expect(result.counts.manual).toBe(0)
    expect(result.total).toBe(53)
    expect(result.pageCount).toBe(2)
    expect(result.items).toHaveLength(50)
    expect(queryMarketplaceCatalog(view([...valid]), { ...defaultRequest, page: 2 }).items).toHaveLength(3)
  })

  it('searches publisher and description and applies the installability segment', () => {
    const oneClick = entry(1, { package: { ...entry(1).package, description: 'Weather for teams' } })
    const manual = entry(2, {
      repository: { ...entry(2).repository, fullName: 'acme/diagram-tools' },
      package: { ...entry(2).package, name: '@acme/diagram-tools', description: 'Architecture diagrams' },
      installability: 'manual',
    })
    const catalogView = view([oneClick, manual])
    expect(queryMarketplaceCatalog(catalogView, { ...defaultRequest, query: 'acme' }).items.map(item => item.repositoryId)).toEqual(['2'])
    expect(queryMarketplaceCatalog(catalogView, {
      ...defaultRequest,
      query: 'architecture diagrams',
      installability: 'manual',
    }).items.map(item => item.repositoryId)).toEqual(['2'])
  })

  it('uses eligibility, activity, stars, and stable repository name for recommended order', () => {
    const oldPopular = entry(1, {
      stars: 10_000,
      lastCodePushAt: '2025-01-01T00:00:00.000Z',
      installability: 'manual',
    })
    const currentManual = entry(2, { stars: 100, installability: 'manual' })
    const currentOneClick = entry(3, { stars: 1, installability: 'one-click-eligible' })
    expect(queryMarketplaceCatalog(view([oldPopular, currentManual, currentOneClick]), defaultRequest)
      .items.map(item => item.repositoryId)).toEqual(['3', '2', '1'])
  })

  it('returns detail only for admitted entries and attaches sparse profile state', () => {
    const admitted = entry(1)
    const rejected = entry(2, { validation: { status: 'invalid', code: 'patch-invalid', message: 'bad' } })
    const states = [{
      repositoryId: '1',
      packageName: admitted.package.name,
      state: 'active' as const,
      installedVersion: '1.0.0',
      installedSpec: admitted.source.ref,
      installedRepository: 'acme/dsh-plugin',
      catalogSpec: admitted.source.ref,
      catalogRelation: 'up-to-date' as const,
      updateAvailable: false,
    }]
    expect(detailMarketplaceEntry(view([admitted, rejected]), '1', states)).toMatchObject({
      entry: { repositoryId: '1' }, state: { state: 'active' },
    })
    expect(detailMarketplaceEntry(view([admitted, rejected]), '2', states)).toEqual({ entry: null, state: null })
  })

  it('derives categories from declared topics first, then conservative tokens, else null', () => {
    expect(deriveMarketplaceCategory(entry(1, { topics: ['dsh-plugin', 'dsh-category-theme'] }))).toBe('theme')
    expect(deriveMarketplaceCategory(entry(2, { topics: ['dsh-plugin', 'dsh-category-unknown'] }))).toBeNull()
    expect(deriveMarketplaceCategory(entry(3, { topics: ['dsh-plugin', 'vector-store'] }))).toBe('memory')
    expect(deriveMarketplaceCategory(entry(4, { repository: { ...entry(4).repository, fullName: 'acme/dsh-tui' } }))).toBe('ui')
    expect(deriveMarketplaceCategory(entry(5, { keywords: ['ocr'] }))).toBe('tool')
    // Priority beats fallback ambiguity; declaration beats priority.
    expect(deriveMarketplaceCategory(entry(6, { topics: ['dsh-plugin'], keywords: ['theme', 'memory'] }))).toBe('theme')
    expect(deriveMarketplaceCategory(entry(7, { topics: ['dsh-category-memory'], keywords: ['theme'] }))).toBe('memory')
    expect(deriveMarketplaceCategory(entry(8))).toBeNull()
  })

  it('filters by category and reports per-category counts before the segment', () => {
    const theme = entry(1, { topics: ['dsh-plugin', 'dsh-category-theme'] })
    const ui = entry(2, { repository: { ...entry(2).repository, fullName: 'acme/dsh-web-ui' } })
    const plain = entry(3)
    const catalogView = view([theme, ui, plain])
    const result = queryMarketplaceCatalog(catalogView, defaultRequest)
    expect(result.counts.categories).toEqual({ theme: 1, memory: 0, ui: 1, tool: 0 })
    expect(result.counts.uncategorized).toBe(1)
    expect(result.items[0]?.repositoryCreatedAt).toBe('2026-07-01T00:00:00.000Z')
    expect(queryMarketplaceCatalog(catalogView, { ...defaultRequest, category: 'theme' }).items.map(item => item.repositoryId)).toEqual(['1'])
    expect(queryMarketplaceCatalog(catalogView, { ...defaultRequest, category: 'uncategorized' }).items.map(item => item.repositoryId)).toEqual(['3'])
  })

  it('joins the installed snapshot with admitted summaries and keeps external packages', () => {
    const admitted = entry(1, { topics: ['dsh-plugin', 'dsh-category-theme'] })
    const rejected = entry(2, { validation: { status: 'invalid', code: 'patch-invalid', message: 'bad' } })
    const snapshot: MarketplaceOperationSnapshot = {
      profileName: 'web',
      busy: false,
      capabilities: { packageManager: 'pnpm', profileWritable: true, profileName: 'web', message: null },
      plugins: [
        {
          repositoryId: '1', packageName: admitted.package.name, state: 'active',
          installedVersion: '1.0.0', installedSpec: admitted.source.ref, installedRepository: 'acme/dsh-plugin',
          catalogSpec: admitted.source.ref, catalogRelation: 'up-to-date', updateAvailable: false,
        },
        {
          repositoryId: '2', packageName: rejected.package.name, state: 'pending-removal',
          installedVersion: '1.0.0', installedSpec: rejected.source.ref, installedRepository: 'acme/dsh-plugin',
          catalogSpec: rejected.source.ref, catalogRelation: 'up-to-date', updateAvailable: false,
        },
        {
          repositoryId: null, packageName: 'dsh-off-catalog', state: 'active' as const,
          installedVersion: '0.1.0', installedSpec: 'github:elsewhere/dsh-off-catalog#0123456789012345678901234567890123456789',
          installedRepository: 'elsewhere/dsh-off-catalog',
          catalogSpec: null, catalogRelation: 'not-in-catalog' as const, updateAvailable: false,
        },
      ],
      external: [{ packageName: '@elsewhere/tool', installedSpec: '1.2.3', activeAtLaunch: true, activeAfterRestart: true }],
    }
    const result = installedMarketplacePlugins(view([admitted, rejected]), snapshot)
    expect(result.items).toHaveLength(3)
    expect(result.items[0]?.plugin?.category).toBe('theme')
    expect(result.items[1]?.plugin).toBeNull()
    // A null repositoryId never borrows a same-name summary from the catalog.
    expect(result.items[2]?.plugin).toBeNull()
    expect(result.items[2]?.state.catalogRelation).toBe('not-in-catalog')
    expect(result.external[0]?.packageName).toBe('@elsewhere/tool')
  })
})
