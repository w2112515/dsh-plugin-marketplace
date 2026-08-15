import { sealMarketplaceCatalog } from '../src/catalog.ts'
import type { MarketplaceCatalogSnapshot, MarketplacePackEntry } from '../src/types.ts'

export function catalogFixture(overrides: Partial<MarketplaceCatalogSnapshot> = {}): MarketplaceCatalogSnapshot {
  const catalog: MarketplaceCatalogSnapshot = {
    schemaVersion: 1,
    generatedAt: '2026-08-14T00:00:00.000Z',
    scannerVersion: 'test-v1',
    topic: 'dsh-plugin',
    integrity: { algorithm: 'sha256', digest: '' },
    summary: { entryCount: 1, invalidEntryCount: 0, packCount: 0 },
    entries: [{
      repositoryId: '123456',
      repository: {
        fullName: 'example/dsh-weather-bundle',
        url: 'https://github.com/example/dsh-weather-bundle',
        defaultBranch: 'main',
        commitSha: '0123456789abcdef0123456789abcdef01234567',
        archived: false,
      },
      package: {
        name: '@example/dsh-weather-bundle',
        version: '1.0.0',
        description: 'Weather tools for DSH',
        author: 'Example',
        license: 'MIT',
      },
      topics: ['dsh-plugin', 'weather'],
      keywords: ['dsh', 'weather'],
      stars: 42,
      repositoryCreatedAt: '2026-07-01T00:00:00.000Z',
      lastCodePushAt: '2026-08-13T00:00:00.000Z',
      firstSeenAt: '2026-08-13T01:00:00.000Z',
      indexedAt: '2026-08-14T00:00:00.000Z',
      source: {
        kind: 'git',
        ref: 'git+https://github.com/example/dsh-weather-bundle.git#0123456789abcdef0123456789abcdef01234567',
        packageJsonPath: 'package.json',
        patchPath: 'cordis.patch.yml',
      },
      validation: { status: 'valid', code: 'valid-bundle', message: null },
      compatibility: 'unknown',
      installability: 'one-click-eligible',
      riskSignals: ['git-source'],
      installScripts: null,
    }],
    packs: [],
    ...overrides,
  }
  return sealMarketplaceCatalog(catalog)
}

/** One valid pack whose single item resolves to the fixture plugin. */
export function packFixture(overrides: Partial<MarketplacePackEntry> = {}): MarketplacePackEntry {
  return {
    repositoryId: '654321',
    repository: {
      fullName: 'example/dsh-essentials-pack',
      url: 'https://github.com/example/dsh-essentials-pack',
      defaultBranch: 'main',
      commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      archived: false,
    },
    name: 'DSH Essentials',
    description: 'A curated starter set',
    items: [{ fullName: 'example/dsh-weather-bundle', repositoryId: '123456' }],
    stars: 7,
    repositoryCreatedAt: '2026-08-01T00:00:00.000Z',
    lastCodePushAt: '2026-08-13T00:00:00.000Z',
    firstSeenAt: '2026-08-13T01:00:00.000Z',
    indexedAt: '2026-08-14T00:00:00.000Z',
    validation: { status: 'valid', code: 'valid-pack', message: null },
    ...overrides,
  }
}
