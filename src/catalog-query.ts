/** Host-owned search, filtering, ordering, and paging for the Marketplace catalog. */

import type {
  MarketplaceCatalogEntry,
  MarketplaceCatalogView,
  MarketplaceListRequest,
  MarketplaceListResponse,
  MarketplacePluginDetailResponse,
  MarketplacePluginSummary,
  MarketplaceProfilePluginState,
} from './types.ts'

export const MARKETPLACE_PAGE_SIZE = 50
const ACTIVE_WINDOW_MS = 180 * 24 * 60 * 60 * 1000

interface RankedEntry {
  readonly entry: MarketplaceCatalogEntry
  readonly relevance: number
}

/** Conservative admission defense for stale catalogs created before scanner filtering. */
export function isPublicMarketplaceEntry(entry: MarketplaceCatalogEntry): boolean {
  return entry.validation.status === 'valid'
    && !entry.repository.archived
    && (entry.installability === 'one-click-eligible' || entry.installability === 'manual')
}

function summary(entry: MarketplaceCatalogEntry): MarketplacePluginSummary {
  const separator = entry.repository.fullName.indexOf('/')
  return {
    repositoryId: entry.repositoryId,
    name: entry.package.name ?? entry.repository.fullName,
    publisher: separator === -1 ? entry.repository.fullName : entry.repository.fullName.slice(0, separator),
    author: entry.package.author,
    packageName: entry.package.name,
    packageVersion: entry.package.version,
    repositoryFullName: entry.repository.fullName,
    repositoryUrl: entry.repository.url,
    description: entry.package.description,
    license: entry.package.license,
    stars: entry.stars,
    lastCodePushAt: entry.lastCodePushAt,
    firstSeenAt: entry.firstSeenAt,
    installability: entry.installability as MarketplacePluginSummary['installability'],
    compatibility: entry.compatibility,
    riskSignals: entry.riskSignals,
  }
}

function normalizedWords(query: string): readonly string[] {
  return query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
}

function relevance(entry: MarketplaceCatalogEntry, words: readonly string[]): number {
  if (words.length === 0) return 0
  const publisher = entry.repository.fullName.split('/')[0] ?? ''
  const fields: readonly [string, number][] = [
    [entry.package.name ?? '', 10],
    [entry.repository.fullName, 8],
    [publisher, 6],
    [entry.package.description ?? '', 4],
    [entry.topics.join(' '), 2],
    [entry.keywords.join(' '), 2],
  ]
  let score = 0
  for (const word of words) {
    let matched = false
    for (const [field, weight] of fields) {
      const normalized = field.toLocaleLowerCase()
      if (normalized === word) {
        score += weight * 2
        matched = true
      } else if (normalized.includes(word)) {
        score += weight
        matched = true
      }
    }
    if (!matched) return -1
  }
  return score
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en')
}

function compareRecommended(left: MarketplaceCatalogEntry, right: MarketplaceCatalogEntry, generatedAt: string): number {
  const installability = Number(right.installability === 'one-click-eligible')
    - Number(left.installability === 'one-click-eligible')
  if (installability !== 0) return installability
  const cutoff = Date.parse(generatedAt) - ACTIVE_WINDOW_MS
  const activity = Number(Date.parse(right.lastCodePushAt) >= cutoff) - Number(Date.parse(left.lastCodePushAt) >= cutoff)
  if (activity !== 0) return activity
  if (right.stars !== left.stars) return right.stars - left.stars
  const pushed = Date.parse(right.lastCodePushAt) - Date.parse(left.lastCodePushAt)
  if (pushed !== 0) return pushed
  return compareText(left.repository.fullName, right.repository.fullName)
}

function compareRanked(
  left: RankedEntry,
  right: RankedEntry,
  request: MarketplaceListRequest,
  generatedAt: string,
): number {
  if (left.relevance !== right.relevance) return right.relevance - left.relevance
  switch (request.sort) {
    case 'stars':
      return right.entry.stars - left.entry.stars
        || compareRecommended(left.entry, right.entry, generatedAt)
    case 'recently-updated':
      return Date.parse(right.entry.lastCodePushAt) - Date.parse(left.entry.lastCodePushAt)
        || compareRecommended(left.entry, right.entry, generatedAt)
    case 'recently-added':
      return Date.parse(right.entry.firstSeenAt) - Date.parse(left.entry.firstSeenAt)
        || compareRecommended(left.entry, right.entry, generatedAt)
    case 'recommended':
      return compareRecommended(left.entry, right.entry, generatedAt)
  }
}

/** Query one catalog view without leaking the full scanner payload to the browser. */
export function queryMarketplaceCatalog(
  view: MarketplaceCatalogView,
  request: MarketplaceListRequest,
): MarketplaceListResponse {
  const entries = view.catalog?.entries.filter(isPublicMarketplaceEntry) ?? []
  const counts = {
    all: entries.length,
    oneClick: entries.filter(entry => entry.installability === 'one-click-eligible').length,
    manual: entries.filter(entry => entry.installability === 'manual').length,
  }
  const words = normalizedWords(request.query)
  const selected = entries
    .filter(entry => request.installability === 'all' || entry.installability === request.installability)
    .map(entry => ({ entry, relevance: relevance(entry, words) }))
    .filter(item => item.relevance >= 0)
    .sort((left, right) => compareRanked(left, right, request, view.catalog?.generatedAt ?? '1970-01-01T00:00:00.000Z'))
  const pageCount = selected.length === 0 ? 0 : Math.ceil(selected.length / MARKETPLACE_PAGE_SIZE)
  const page = pageCount === 0 ? 1 : Math.min(request.page, pageCount)
  const offset = (page - 1) * MARKETPLACE_PAGE_SIZE
  return {
    digest: view.catalog?.integrity.digest ?? '',
    catalogStatus: view.catalog === null ? view.status : entries.length === 0 ? 'empty' : 'ready',
    source: view.source,
    stale: view.stale,
    generatedAt: view.catalog?.generatedAt ?? null,
    lastSuccessfulFetchAt: view.lastSuccessfulFetchAt,
    total: selected.length,
    counts,
    page,
    pageCount,
    items: selected.slice(offset, offset + MARKETPLACE_PAGE_SIZE).map(item => summary(item.entry)),
    error: view.error,
  }
}

/** Return full evidence only for an admitted entry and attach sparse profile state. */
export function detailMarketplaceEntry(
  view: MarketplaceCatalogView,
  repositoryId: string,
  states: readonly MarketplaceProfilePluginState[],
): MarketplacePluginDetailResponse {
  const entry = view.catalog?.entries.find(candidate => (
    candidate.repositoryId === repositoryId && isPublicMarketplaceEntry(candidate)
  )) ?? null
  return {
    entry,
    state: entry === null ? null : states.find(candidate => candidate.repositoryId === repositoryId) ?? null,
  }
}
