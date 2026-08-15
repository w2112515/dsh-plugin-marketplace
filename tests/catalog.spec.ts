import { describe, expect, it } from 'vitest'
import {
  computeMarketplaceCatalogDigest,
  MarketplaceCatalogParseError,
  parseMarketplaceCatalogText,
} from '../src/catalog.ts'
import { catalogFixture, packFixture } from './fixture.ts'

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
      summary: { entryCount: 2, invalidEntryCount: 0, packCount: 0 },
    })))).toThrow('entry count')

    expect(() => parseMarketplaceCatalogText(JSON.stringify(catalogFixture({
      summary: { entryCount: 2, invalidEntryCount: 0, packCount: 0 },
      entries: [fixture.entries[0]!, fixture.entries[0]!],
    })))).toThrow('duplicate')

    expect(() => parseMarketplaceCatalogText(JSON.stringify({ ...fixture, surprise: true }))).toThrow('schema')
  })

  it('keeps verifying pre-pack cached catalogs and normalizes the newer fields', () => {
    // A catalog sealed before packs/installScripts existed must still verify:
    // the digest covers the raw wire payload, and the new fields are
    // normalized onto the result only after verification.
    const fixture = catalogFixture()
    const legacyEntry = { ...fixture.entries[0]! } as Record<string, unknown>
    delete legacyEntry.installScripts
    const legacy = {
      ...fixture,
      summary: { entryCount: 1, invalidEntryCount: 0 },
      entries: [legacyEntry],
      integrity: { algorithm: 'sha256', digest: '' },
    } as Record<string, unknown>
    delete legacy.packs
    const digest = computeMarketplaceCatalogDigest(legacy as unknown as Parameters<typeof computeMarketplaceCatalogDigest>[0])
    const wire = { ...legacy, integrity: { algorithm: 'sha256', digest } }
    const parsed = parseMarketplaceCatalogText(JSON.stringify(wire))
    expect(parsed.packs).toEqual([])
    expect(parsed.summary.packCount).toBe(0)
    expect(parsed.entries[0]?.installScripts).toBeNull()
  })

  it('verifies packs inside the digest and rejects tampering or id collisions with entries', () => {
    const withPack = catalogFixture({
      packs: [packFixture()],
      summary: { entryCount: 1, invalidEntryCount: 0, packCount: 1 },
    })
    expect(parseMarketplaceCatalogText(JSON.stringify(withPack))).toEqual(withPack)

    const tampered = JSON.parse(JSON.stringify(withPack)) as { packs: { name: string }[] }
    tampered.packs[0]!.name = 'Forged Pack'
    expect(() => parseMarketplaceCatalogText(JSON.stringify(tampered))).toThrow('integrity')

    // A pack is a repository too: its id must never collide with an entry's.
    const colliding = catalogFixture({
      packs: [packFixture({ repositoryId: '123456' })],
      summary: { entryCount: 1, invalidEntryCount: 0, packCount: 1 },
    })
    expect(() => parseMarketplaceCatalogText(JSON.stringify(colliding))).toThrow('duplicate')

    const miscounted = catalogFixture({ packs: [packFixture()] })
    expect(() => parseMarketplaceCatalogText(JSON.stringify(miscounted))).toThrow('pack count')
  })
})
