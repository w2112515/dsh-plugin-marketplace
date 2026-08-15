/** Strict parser and logical integrity contract for marketplace catalog v1. */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { MarketplaceCatalogSnapshot } from './types.ts'

const isoDate = z.iso.datetime()
const nullableText = z.string().nullable()

const entrySchema = z.object({
  repositoryId: z.string().regex(/^\d+$/),
  repository: z.object({
    fullName: z.string().min(3),
    url: z.url(),
    defaultBranch: z.string().min(1),
    commitSha: z.string().regex(/^[0-9a-f]{40}$/).nullable(),
    archived: z.boolean(),
  }).strict(),
  package: z.object({
    name: nullableText,
    version: nullableText,
    description: nullableText,
    author: nullableText,
    license: nullableText,
  }).strict(),
  topics: z.array(z.string()),
  keywords: z.array(z.string()),
  stars: z.number().int().nonnegative(),
  repositoryCreatedAt: isoDate,
  lastCodePushAt: isoDate,
  firstSeenAt: isoDate,
  indexedAt: isoDate,
  source: z.object({
    kind: z.literal('git'),
    ref: z.string().min(1),
    packageJsonPath: z.literal('package.json'),
    patchPath: z.string().nullable(),
  }).strict(),
  validation: z.object({
    status: z.enum(['valid', 'invalid', 'archived']),
    code: z.enum([
      'valid-bundle',
      'repository-archived',
      'package-json-missing',
      'package-json-invalid',
      'bundle-declaration-missing',
      'patch-path-invalid',
      'patch-missing',
      'patch-invalid',
      'github-request-failed',
    ]),
    message: nullableText,
  }).strict(),
  compatibility: z.enum(['compatible', 'incompatible', 'unknown']),
  installability: z.enum(['browse-only', 'manual', 'one-click-eligible']),
  riskSignals: z.array(z.enum([
    'repository-archived',
    'git-source',
    'unpinned-source',
    'lifecycle-script',
    'build-script',
  ])),
  installScripts: z.record(z.string(), z.string()).nullable().optional(),
}).strict()

const packEntrySchema = z.object({
  repositoryId: z.string().regex(/^\d+$/),
  repository: z.object({
    fullName: z.string().min(3),
    url: z.url(),
    defaultBranch: z.string().min(1),
    commitSha: z.string().regex(/^[0-9a-f]{40}$/).nullable(),
    archived: z.boolean(),
  }).strict(),
  name: z.string().min(1),
  description: nullableText,
  items: z.array(z.object({
    fullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
    repositoryId: z.string().regex(/^\d+$/).nullable(),
  }).strict()),
  stars: z.number().int().nonnegative(),
  repositoryCreatedAt: isoDate,
  lastCodePushAt: isoDate,
  firstSeenAt: isoDate,
  indexedAt: isoDate,
  validation: z.object({
    status: z.enum(['valid', 'invalid', 'archived']),
    code: z.enum([
      'valid-pack',
      'repository-archived',
      'pack-manifest-missing',
      'pack-manifest-invalid',
      'github-request-failed',
    ]),
    message: nullableText,
  }).strict(),
}).strict()

const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: isoDate,
  scannerVersion: z.string().min(1),
  topic: z.string().min(1),
  integrity: z.object({
    algorithm: z.literal('sha256'),
    digest: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict(),
  summary: z.object({
    entryCount: z.number().int().nonnegative(),
    invalidEntryCount: z.number().int().nonnegative(),
    packCount: z.number().int().nonnegative().optional(),
  }).strict(),
  entries: z.array(entrySchema),
  packs: z.array(packEntrySchema).optional(),
}).strict()

/** Stable catalog validation error suitable for mapping to a public error code. */
export class MarketplaceCatalogParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MarketplaceCatalogParseError'
  }
}

/** Canonical JSON with recursively sorted object keys. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item)).join(',')}]`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  throw new MarketplaceCatalogParseError('Catalog contains a non-JSON value')
}

/**
 * Compute the v1 logical digest with the digest field blanked.
 * @param catalog - Complete catalog payload whose logical content is hashed.
 * @returns Lowercase SHA-256 digest over canonical JSON.
 */
export function computeMarketplaceCatalogDigest(catalog: MarketplaceCatalogSnapshot): string {
  const unsigned = {
    ...catalog,
    integrity: { algorithm: catalog.integrity.algorithm, digest: '' },
  }
  return createHash('sha256').update(canonicalJson(unsigned)).digest('hex')
}

/**
 * Fill a catalog's integrity digest without mutating the caller's value.
 * @param catalog - Catalog payload whose integrity field should be sealed.
 * @returns Copy carrying the computed logical SHA-256 digest.
 */
export function sealMarketplaceCatalog(catalog: MarketplaceCatalogSnapshot): MarketplaceCatalogSnapshot {
  return {
    ...catalog,
    integrity: {
      algorithm: 'sha256',
      digest: computeMarketplaceCatalogDigest(catalog),
    },
  }
}

/**
 * Parse, strictly validate, and verify a complete catalog publication.
 * The integrity digest is verified over the exact wire payload; newer optional
 * fields (packs, installScripts) are normalized onto the result afterwards so
 * older cached catalogs keep parsing and verifying.
 * @param text - UTF-8 JSON text downloaded from the publication or cache.
 * @returns Strictly validated catalog with a verified logical digest.
 */
export function parseMarketplaceCatalogText(text: string): MarketplaceCatalogSnapshot {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new MarketplaceCatalogParseError('Catalog is not valid JSON')
  }
  const parsed = catalogSchema.safeParse(value)
  if (!parsed.success) throw new MarketplaceCatalogParseError('Catalog does not match schema version 1')
  const wire = parsed.data
  if (wire.summary.entryCount !== wire.entries.length) {
    throw new MarketplaceCatalogParseError('Catalog entry count does not match its summary')
  }
  const invalidCount = wire.entries.filter(entry => entry.validation.status !== 'valid').length
  if (wire.summary.invalidEntryCount !== invalidCount) {
    throw new MarketplaceCatalogParseError('Catalog invalid-entry count does not match its summary')
  }
  const wirePacks = wire.packs ?? []
  if (wire.summary.packCount !== undefined && wire.summary.packCount !== wirePacks.length) {
    throw new MarketplaceCatalogParseError('Catalog pack count does not match its summary')
  }
  const ids = [...wire.entries.map(entry => entry.repositoryId), ...wirePacks.map(pack => pack.repositoryId)]
  if (new Set(ids).size !== ids.length) {
    throw new MarketplaceCatalogParseError('Catalog contains duplicate repository ids')
  }
  const wireDigest = computeMarketplaceCatalogDigest(wire as MarketplaceCatalogSnapshot)
  if (wireDigest !== wire.integrity.digest) {
    throw new MarketplaceCatalogParseError('Catalog integrity digest does not match')
  }
  return {
    ...wire,
    summary: { ...wire.summary, packCount: wirePacks.length },
    entries: wire.entries.map(entry => ({ ...entry, installScripts: entry.installScripts ?? null })),
    packs: wirePacks,
  } as MarketplaceCatalogSnapshot
}
