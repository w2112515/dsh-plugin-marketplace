import { describe, expect, it } from 'vitest'
import {
  deriveMarketplaceCategory,
  detailMarketplaceEntry,
  detailMarketplacePack,
  installedMarketplacePlugins,
  listMarketplacePacks,
  queryMarketplaceCatalog,
} from '../src/catalog-query.ts'
import type { MarketplaceCatalogEntry, MarketplaceCatalogView, MarketplaceListRequest, MarketplaceOperationSnapshot, MarketplacePackEntry } from '../src/types.ts'
import { catalogFixture, packFixture } from './fixture.ts'

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

function view(entries: readonly MarketplaceCatalogEntry[], packs: readonly MarketplacePackEntry[] = []): MarketplaceCatalogView {
  const catalog = catalogFixture({
    summary: { entryCount: entries.length, invalidEntryCount: 0, packCount: packs.length },
    entries,
    packs,
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

  it('covers the expanded taxonomy and never classifies attributive product names', () => {
    expect(deriveMarketplaceCategory(entry(1, { topics: ['dsh-plugin', 'token-usage'] }))).toBe('usage')
    expect(deriveMarketplaceCategory(entry(2, { keywords: ['billing'] }))).toBe('usage')
    expect(deriveMarketplaceCategory(entry(3, { repository: { ...entry(3).repository, fullName: 'acme/dsh-qqbot' } }))).toBe('channel')
    expect(deriveMarketplaceCategory(entry(4, { keywords: ['openrouter'] }))).toBe('provider')
    expect(deriveMarketplaceCategory(entry(5, { keywords: ['oauth'] }))).toBe('provider')
    expect(deriveMarketplaceCategory(entry(6, { keywords: ['skills'] }))).toBe('skill')
    expect(deriveMarketplaceCategory(entry(7, { topics: ['dsh-plugin', 'security'] }))).toBe('security')
    expect(deriveMarketplaceCategory(entry(8, { keywords: ['pet'] }))).toBe('ui')
    expect(deriveMarketplaceCategory(entry(9, { keywords: ['session'] }))).toBe('tool')
    // "Codex-style pet" / "import Claude sessions" are attributive uses; product
    // names alone never mean provider access.
    expect(deriveMarketplaceCategory(entry(10, { keywords: ['codex'] }))).toBeNull()
    expect(deriveMarketplaceCategory(entry(11, { keywords: ['claude'] }))).toBeNull()
    // Provider is the residual category: any concrete identity wins first.
    expect(deriveMarketplaceCategory(entry(12, { keywords: ['skills', 'openrouter'] }))).toBe('skill')
  })

  it('filters by category and reports per-category counts before the segment', () => {
    const theme = entry(1, { topics: ['dsh-plugin', 'dsh-category-theme'] })
    const ui = entry(2, { repository: { ...entry(2).repository, fullName: 'acme/dsh-web-ui' } })
    const plain = entry(3)
    const catalogView = view([theme, ui, plain])
    const result = queryMarketplaceCatalog(catalogView, defaultRequest)
    expect(result.counts.categories).toEqual({ theme: 1, memory: 0, ui: 1, tool: 0, provider: 0, usage: 0, skill: 0, security: 0, channel: 0 })
    expect(result.counts.uncategorized).toBe(1)
    expect(result.counts.packs).toBe(0)
    expect(queryMarketplaceCatalog(view([theme], [packFixture()]), defaultRequest).counts.packs).toBe(1)
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

describe('solution pack query', () => {
  const emptySnapshot: MarketplaceOperationSnapshot = {
    profileName: 'web',
    busy: false,
    capabilities: { packageManager: 'pnpm', profileWritable: true, profileName: 'web', message: null },
    plugins: [],
    external: [],
  }

  it('lists only public packs: featured first in declared order, then freshness, never stars', () => {
    const packs = [
      packFixture({ repositoryId: '10', repository: { ...packFixture().repository, fullName: 'acme/zeta-pack' }, stars: 5, lastCodePushAt: '2026-08-10T00:00:00.000Z' }),
      packFixture({ repositoryId: '11', repository: { ...packFixture().repository, fullName: 'acme/alpha-pack' }, stars: 5, lastCodePushAt: '2026-08-10T00:00:00.000Z' }),
      packFixture({ repositoryId: '12', repository: { ...packFixture().repository, fullName: 'acme/popular-pack' }, stars: 5000, lastCodePushAt: '2026-08-12T00:00:00.000Z' }),
      packFixture({ repositoryId: '14', repository: { ...packFixture().repository, fullName: 'w2112515/dsh-essentials-pack' }, stars: 0, lastCodePushAt: '2026-08-01T00:00:00.000Z' }),
      packFixture({
        repositoryId: '13',
        repository: { ...packFixture().repository, fullName: 'acme/broken-pack' },
        validation: { status: 'invalid', code: 'pack-manifest-invalid', message: 'bad' },
      }),
    ]
    const result = listMarketplacePacks(view([], packs))
    // Editorial order beats freshness; star counts never move a pack at all.
    expect(result.packs.map(pack => pack.repositoryId)).toEqual(['14', '12', '11', '10'])
    expect(result.packs[0]).toMatchObject({
      repositoryFullName: 'w2112515/dsh-essentials-pack',
      publisher: 'w2112515',
      featured: true,
      itemCount: 1,
    })
    expect(result.packs[1]).toMatchObject({ repositoryFullName: 'acme/popular-pack', featured: false })
  })

  it('summarizes each pack\'s install composition from catalog truth', () => {
    const oneClick = entry(1)
    const scripted = entry(2, { installability: 'manual', installScripts: { prepare: 'node build.js' } })
    const hardManual = entry(3, { installability: 'manual', installScripts: null })
    const pack = packFixture({
      items: [
        { fullName: oneClick.repository.fullName, repositoryId: '1' },
        { fullName: scripted.repository.fullName, repositoryId: '2' },
        { fullName: hardManual.repository.fullName, repositoryId: '3' },
        { fullName: 'ghost/not-scanned', repositoryId: null },
      ],
    })
    const result = listMarketplacePacks(view([oneClick, scripted, hardManual], [pack]))
    expect(result.packs[0]?.composition).toEqual({ oneClick: 1, scriptGated: 1, manual: 1, unavailable: 1 })
  })

  it('resolves every item status from catalog and profile truth, never from pack claims', () => {
    const oneClick = entry(1)
    const scripted = entry(2, { installability: 'manual', installScripts: { prepare: 'node build.js' } })
    const hardManual = entry(3, { installability: 'manual', installScripts: null })
    const installed = entry(4)
    const rejected = entry(5, { validation: { status: 'invalid', code: 'patch-invalid', message: 'bad' } })
    const pack = packFixture({
      items: [
        { fullName: oneClick.repository.fullName, repositoryId: '1' },
        { fullName: scripted.repository.fullName, repositoryId: '2' },
        { fullName: hardManual.repository.fullName, repositoryId: '3' },
        { fullName: installed.repository.fullName, repositoryId: '4' },
        { fullName: rejected.repository.fullName, repositoryId: '5' },
        { fullName: 'ghost/not-scanned', repositoryId: null },
      ],
    })
    const snapshot: MarketplaceOperationSnapshot = {
      ...emptySnapshot,
      plugins: [{
        repositoryId: '4', packageName: installed.package.name, state: 'active',
        installedVersion: '1.0.0', installedSpec: installed.source.ref, installedRepository: installed.repository.fullName,
        catalogSpec: installed.source.ref, catalogRelation: 'up-to-date', updateAvailable: false,
      }],
    }
    const detail = detailMarketplacePack(view([oneClick, scripted, hardManual, installed, rejected], [pack]), snapshot, '654321')
    expect(detail.pack?.repositoryId).toBe('654321')
    expect(detail.items.map(item => item.status)).toEqual([
      'installable', 'script-gated', 'manual', 'installed', 'unavailable', 'unavailable',
    ])
    // Identity comes from the catalog entry; unresolved items keep only the
    // fullName the author declared.
    expect(detail.items[0]?.packageName).toBe(oneClick.package.name)
    expect(detail.items[3]?.state).toBe('active')
    expect(detail.items[5]).toMatchObject({ fullName: 'ghost/not-scanned', name: null, repositoryUrl: null })
    expect(detailMarketplacePack(view([], [pack]), emptySnapshot, 'missing'))
      .toEqual({ pack: null, items: [] })
  })
})
