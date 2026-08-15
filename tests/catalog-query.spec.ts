import { describe, expect, it } from 'vitest'
import { detailMarketplaceEntry, queryMarketplaceCatalog } from '../src/catalog-query.ts'
import type { MarketplaceCatalogEntry, MarketplaceCatalogView, MarketplaceListRequest } from '../src/types.ts'
import { catalogFixture } from './fixture.ts'

const defaultRequest: MarketplaceListRequest = {
  query: '',
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
    expect(result.counts).toEqual({ all: 53, oneClick: 53, manual: 0 })
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
      catalogSpec: admitted.source.ref,
      updateAvailable: false,
    }]
    expect(detailMarketplaceEntry(view([admitted, rejected]), '1', states)).toMatchObject({
      entry: { repositoryId: '1' }, state: { state: 'active' },
    })
    expect(detailMarketplaceEntry(view([admitted, rejected]), '2', states)).toEqual({ entry: null, state: null })
  })
})
