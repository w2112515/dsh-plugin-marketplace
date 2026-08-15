import { describe, expect, it } from 'vitest'
import {
  computeMarketplaceCatalogDigest,
  MarketplaceCatalogParseError,
  parseMarketplaceCatalogText,
} from '../src/catalog.ts'
import { catalogFixture } from './fixture.ts'

describe('marketplace catalog v1', () => {
  it('round-trips a sealed publication with a logical digest', () => {
    const fixture = catalogFixture()
    expect(parseMarketplaceCatalogText(JSON.stringify(fixture))).toEqual(fixture)
    expect(computeMarketplaceCatalogDigest(fixture)).toBe(fixture.integrity.digest)
  })

  it('rejects digest changes, partial summaries, duplicate ids, and unknown fields', () => {
    const fixture = catalogFixture()
    expect(() => parseMarketplaceCatalogText(JSON.stringify({
      ...fixture,
      generatedAt: '2026-08-14T01:00:00.000Z',
    }))).toThrow(MarketplaceCatalogParseError)

    expect(() => parseMarketplaceCatalogText(JSON.stringify(catalogFixture({
      summary: { entryCount: 2, invalidEntryCount: 0 },
    })))).toThrow('entry count')

    expect(() => parseMarketplaceCatalogText(JSON.stringify(catalogFixture({
      summary: { entryCount: 2, invalidEntryCount: 0 },
      entries: [fixture.entries[0]!, fixture.entries[0]!],
    })))).toThrow('duplicate')

    expect(() => parseMarketplaceCatalogText(JSON.stringify({ ...fixture, surprise: true }))).toThrow('schema')
  })
})
