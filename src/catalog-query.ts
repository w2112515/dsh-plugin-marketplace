/** Host-owned search, filtering, ordering, and paging for the Marketplace catalog. */

import {
  MARKETPLACE_CATEGORY_PRIORITY,
  MARKETPLACE_CATEGORY_VOCABULARY,
  marketplaceQueryCategoryAlias,
  marketplaceQueryWords,
  marketplaceWordMatcher,
} from './category-vocabulary.ts'
import type {
  MarketplaceCatalogEntry,
  MarketplaceCatalogView,
  MarketplaceCategory,
  MarketplaceInstalledResponse,
  MarketplaceListRequest,
  MarketplaceListResponse,
  MarketplaceOperationSnapshot,
  MarketplacePackDetailResponse,
  MarketplacePackEntry,
  MarketplacePackItemStatus,
  MarketplacePackItemView,
  MarketplacePackListResponse,
  MarketplacePackSummary,
  MarketplacePluginDetailResponse,
  MarketplacePluginSummary,
  MarketplaceProfilePluginState,
} from './types.ts'

export { MARKETPLACE_CATEGORY_PRIORITY } from './category-vocabulary.ts'

export const MARKETPLACE_PAGE_SIZE = 50
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000
/** A verdict is shown only at or above this many votes — Steam's own rule. */
export const MARKETPLACE_RATING_MIN_VOTES = 10
const RATING_BOOST_WEIGHT = 2

/**
 * Maintenance freshness of a repository, 0..1: just pushed is 100%, one year
 * without updates is 50%, three years is zero. Piecewise linear so the curve
 * reads exactly like its description; measured at query time, not scan time.
 */
export function marketplaceFreshness(lastCodePushAt: string, nowMs: number): number {
  const years = (nowMs - Date.parse(lastCodePushAt)) / YEAR_MS
  if (!Number.isFinite(years) || years <= 0) return 1
  if (years < 1) return 1 - 0.5 * years
  if (years < 3) return 0.75 - 0.25 * years
  return 0
}

/** Wilson lower bound (95%) — two unprompted upvotes never outrank a proven record. */
function wilsonLowerBound(up: number, total: number): number {
  if (total === 0) return 0
  const z = 1.96
  const phat = up / total
  const zz = z * z
  const centre = phat + zz / (2 * total)
  const margin = z * Math.sqrt((phat * (1 - phat) + zz / (4 * total)) / total)
  return (centre - margin) / (1 + zz / total)
}

/**
 * Recommended score inside one trust tier: freshness multiplies a log-star
 * quality term (log compresses so star giants cannot crush fresh work), and a
 * vote-gated Wilson rating boost adds independently — a universally loved but
 * unmaintained plugin sinks low yet never falsely claims a fresh project's slot.
 */
function recommendedScore(entry: MarketplaceCatalogEntry, nowMs: number): number {
  const quality = 1 + Math.log1p(entry.stars)
  const rating = entry.rating
  const total = rating === null ? 0 : rating.up + rating.down
  const boost = rating !== null && total >= MARKETPLACE_RATING_MIN_VOTES
    ? RATING_BOOST_WEIGHT * wilsonLowerBound(rating.up, total)
    : 0
  return marketplaceFreshness(entry.lastCodePushAt, nowMs) * quality + boost
}

const CATEGORY_DECLARATION = /^dsh-category-([a-z-]+)$/u

/**
 * Derive one category from facts already in the catalog entry. An explicit
 * `dsh-category-<slug>` topic wins; otherwise whole-word fallback tokens decide.
 * @param entry - Admitted catalog entry.
 * @returns The derived category, or null when nothing matches honestly.
 */
export function deriveMarketplaceCategory(entry: MarketplaceCatalogEntry): MarketplaceCategory | null {
  for (const topic of entry.topics) {
    const declared = CATEGORY_DECLARATION.exec(topic)
    const slug = declared?.[1]
    if (slug !== undefined && (MARKETPLACE_CATEGORY_PRIORITY as readonly string[]).includes(slug)) {
      return slug as MarketplaceCategory
    }
  }
  const tokens = new Set<string>()
  const collect = (value: string): void => {
    for (const token of value.toLocaleLowerCase().split(/[^a-z0-9]+/u)) {
      if (token.length > 0) tokens.add(token)
    }
  }
  for (const topic of entry.topics) collect(topic)
  for (const keyword of entry.keywords) collect(keyword)
  collect(entry.package.name ?? '')
  collect(entry.repository.fullName)
  for (const category of MARKETPLACE_CATEGORY_PRIORITY) {
    const vocab = MARKETPLACE_CATEGORY_VOCABULARY.find(item => item.slug === category)
    if (vocab !== undefined && vocab.tokens.some(token => tokens.has(token))) return category
  }
  const haystack = [
    ...entry.topics,
    ...entry.keywords,
    entry.package.name ?? '',
    entry.repository.fullName,
    entry.package.description ?? '',
  ].join('\n').toLocaleLowerCase()
  for (const category of MARKETPLACE_CATEGORY_PRIORITY) {
    const vocab = MARKETPLACE_CATEGORY_VOCABULARY.find(item => item.slug === category)
    if (vocab !== undefined && vocab.needles.some(needle => haystack.includes(needle))) return category
  }
  return null
}

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

function summary(
  entry: MarketplaceCatalogEntry,
  nowMs: number,
  issueUrl: string | null,
  category = deriveMarketplaceCategory(entry),
): MarketplacePluginSummary {
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
    repositoryCreatedAt: entry.repositoryCreatedAt,
    lastCodePushAt: entry.lastCodePushAt,
    firstSeenAt: entry.firstSeenAt,
    category,
    installability: entry.installability as MarketplacePluginSummary['installability'],
    compatibility: entry.compatibility,
    riskSignals: entry.riskSignals,
    freshness: marketplaceFreshness(entry.lastCodePushAt, nowMs),
    rating: entry.rating === null ? null : {
      up: entry.rating.up,
      down: entry.rating.down,
      upRecent: entry.rating.upRecent,
      downRecent: entry.rating.downRecent,
    },
    voteUrl: entry.rating === null || issueUrl === null
      ? null
      : `${issueUrl}#issuecomment-${String(entry.rating.commentId)}`,
  }
}

function relevance(
  entry: MarketplaceCatalogEntry,
  category: MarketplaceCategory | 'uncategorized',
  words: readonly string[],
  matchers: readonly { readonly word: string; readonly alias: ReturnType<typeof marketplaceQueryCategoryAlias>; readonly match: (field: string) => boolean }[],
): number {
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
  for (const item of matchers) {
    let matched = false
    if (item.alias !== null && item.alias === category) {
      score += 8
      matched = true
    }
    for (const [field, weight] of fields) {
      if (field.toLocaleLowerCase() === item.word) {
        score += weight * 2
        matched = true
      } else if (item.match(field)) {
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

function compareRecommended(left: MarketplaceCatalogEntry, right: MarketplaceCatalogEntry, nowMs: number): number {
  const installability = Number(right.installability === 'one-click-eligible')
    - Number(left.installability === 'one-click-eligible')
  if (installability !== 0) return installability
  const score = recommendedScore(right, nowMs) - recommendedScore(left, nowMs)
  if (score !== 0) return score
  const pushed = Date.parse(right.lastCodePushAt) - Date.parse(left.lastCodePushAt)
  if (pushed !== 0) return pushed
  return compareText(left.repository.fullName, right.repository.fullName)
}

function compareRanked(
  left: RankedEntry,
  right: RankedEntry,
  request: MarketplaceListRequest,
  nowMs: number,
): number {
  if (left.relevance !== right.relevance) return right.relevance - left.relevance
  switch (request.sort) {
    case 'stars':
      return right.entry.stars - left.entry.stars
        || compareRecommended(left.entry, right.entry, nowMs)
    case 'recently-updated':
      return Date.parse(right.entry.lastCodePushAt) - Date.parse(left.entry.lastCodePushAt)
        || compareRecommended(left.entry, right.entry, nowMs)
    case 'recently-added':
      return Date.parse(right.entry.firstSeenAt) - Date.parse(left.entry.firstSeenAt)
        || compareRecommended(left.entry, right.entry, nowMs)
    case 'recommended':
      return compareRecommended(left.entry, right.entry, nowMs)
  }
}

/** Query one catalog view without leaking the full scanner payload to the browser. */
export function queryMarketplaceCatalog(
  view: MarketplaceCatalogView,
  request: MarketplaceListRequest,
  now?: string,
): MarketplaceListResponse {
  const nowMs = now === undefined ? Date.now() : Date.parse(now)
  const admitted = view.catalog?.entries.filter(isPublicMarketplaceEntry) ?? []
  const categorized = admitted.map(entry => ({ entry, category: deriveMarketplaceCategory(entry) }))
  const counts = {
    all: admitted.length,
    oneClick: admitted.filter(entry => entry.installability === 'one-click-eligible').length,
    manual: admitted.filter(entry => entry.installability === 'manual').length,
    categories: Object.fromEntries(MARKETPLACE_CATEGORY_PRIORITY.map(category => [
      category,
      categorized.filter(item => item.category === category).length,
    ])) as Record<MarketplaceCategory, number>,
    uncategorized: categorized.filter(item => item.category === null).length,
    packs: (view.catalog?.packs ?? []).filter(isPublicMarketplacePack).length,
  }
  const words = marketplaceQueryWords(request.query)
  const matchers = words.map(word => ({
    word,
    alias: marketplaceQueryCategoryAlias(word),
    match: marketplaceWordMatcher(word),
  }))
  const selected = categorized
    .filter(item => request.category === 'all'
      || (request.category === 'uncategorized' ? item.category === null : item.category === request.category))
    .filter(item => request.installability === 'all' || item.entry.installability === request.installability)
    .map(item => ({
      entry: item.entry,
      category: item.category,
      relevance: relevance(item.entry, item.category ?? 'uncategorized', words, matchers),
    }))
    .filter(item => item.relevance >= 0)
    .sort((left, right) => compareRanked(left, right, request, nowMs))
  const pageCount = selected.length === 0 ? 0 : Math.ceil(selected.length / MARKETPLACE_PAGE_SIZE)
  const page = pageCount === 0 ? 1 : Math.min(request.page, pageCount)
  const offset = (page - 1) * MARKETPLACE_PAGE_SIZE
  return {
    digest: view.catalog?.integrity.digest ?? '',
    catalogStatus: view.catalog === null ? view.status : admitted.length === 0 ? 'empty' : 'ready',
    source: view.source,
    stale: view.stale,
    generatedAt: view.catalog?.generatedAt ?? null,
    lastSuccessfulFetchAt: view.lastSuccessfulFetchAt,
    total: selected.length,
    counts,
    page,
    pageCount,
    items: selected.slice(offset, offset + MARKETPLACE_PAGE_SIZE).map(item => (
      summary(item.entry, nowMs, view.catalog?.ratings?.issueUrl ?? null, item.category)
    )),
    error: view.error,
  }
}

/** Return full evidence only for an admitted entry and attach sparse profile state. */
export function detailMarketplaceEntry(
  view: MarketplaceCatalogView,
  repositoryId: string,
  states: readonly MarketplaceProfilePluginState[],
  now?: string,
): MarketplacePluginDetailResponse {
  const entry = view.catalog?.entries.find(candidate => (
    candidate.repositoryId === repositoryId && isPublicMarketplaceEntry(candidate)
  )) ?? null
  if (entry === null) return { entry: null, state: null, freshness: null, rating: null, voteUrl: null }
  const nowMs = now === undefined ? Date.now() : Date.parse(now)
  const issueUrl = view.catalog?.ratings?.issueUrl ?? null
  return {
    entry,
    state: states.find(candidate => candidate.repositoryId === repositoryId) ?? null,
    freshness: marketplaceFreshness(entry.lastCodePushAt, nowMs),
    rating: entry.rating === null ? null : {
      up: entry.rating.up,
      down: entry.rating.down,
      upRecent: entry.rating.upRecent,
      downRecent: entry.rating.downRecent,
    },
    voteUrl: entry.rating === null || issueUrl === null
      ? null
      : `${issueUrl}#issuecomment-${String(entry.rating.commentId)}`,
  }
}

/** Join the current-profile operation snapshot with admitted catalog summaries in one call. */
export function installedMarketplacePlugins(
  view: MarketplaceCatalogView,
  snapshot: MarketplaceOperationSnapshot,
): MarketplaceInstalledResponse {
  const nowMs = Date.now()
  const issueUrl = view.catalog?.ratings?.issueUrl ?? null
  const summaries = new Map<string, MarketplacePluginSummary>()
  for (const entry of view.catalog?.entries.filter(isPublicMarketplaceEntry) ?? []) {
    summaries.set(entry.repositoryId, summary(entry, nowMs, issueUrl))
  }
  return {
    profileName: snapshot.profileName,
    busy: snapshot.busy,
    capabilities: snapshot.capabilities,
    items: snapshot.plugins.map(state => ({
      state,
      plugin: state.repositoryId === null ? null : summaries.get(state.repositoryId) ?? null,
    })),
    external: snapshot.external,
  }
}

/** Conservative admission defense for packs mirrors the plugin defense. */
export function isPublicMarketplacePack(pack: MarketplacePackEntry): boolean {
  return pack.validation.status === 'valid' && !pack.repository.archived
}

/**
 * Editorial order chosen by the marketplace maintainers, applied before every
 * other pack ordering. Packs are curated artifacts, not popularity contests:
 * ranking them by stars would reward stuffing a pack with the most-starred
 * plugins — a star-sorted category view in disguise. Featured packs are
 * reviewed for coherence and honesty (every item resolves, the install
 * composition is disclosed, no padding); the rest sort by freshness.
 */
export const FEATURED_MARKETPLACE_PACKS: readonly string[] = [
  'w2112515/dsh-essentials-pack',
]

/** Catalog-truth status of one pack item; the profile only ever adds 'installed'. */
function catalogPackItemStatus(
  entry: MarketplaceCatalogEntry | undefined,
): Exclude<MarketplacePackItemStatus, 'installed'> {
  if (entry === undefined) return 'unavailable'
  if (entry.installability === 'one-click-eligible') return 'installable'
  // Consent-gated only when the host can actually plan it: pinned, named, versioned.
  if (entry.installScripts !== null && entry.repository.commitSha !== null
    && entry.package.name !== null && entry.package.version !== null) {
    return 'script-gated'
  }
  return 'manual'
}

function packSummary(
  pack: MarketplacePackEntry,
  entriesById: ReadonlyMap<string, MarketplaceCatalogEntry>,
): MarketplacePackSummary {
  const separator = pack.repository.fullName.indexOf('/')
  const composition = { oneClick: 0, scriptGated: 0, manual: 0, unavailable: 0 }
  for (const item of pack.items) {
    const entry = item.repositoryId === null ? undefined : entriesById.get(item.repositoryId)
    const status = catalogPackItemStatus(entry)
    if (status === 'installable') composition.oneClick += 1
    else if (status === 'script-gated') composition.scriptGated += 1
    else if (status === 'manual') composition.manual += 1
    else composition.unavailable += 1
  }
  return {
    repositoryId: pack.repositoryId,
    name: pack.name,
    publisher: separator === -1 ? pack.repository.fullName : pack.repository.fullName.slice(0, separator),
    repositoryFullName: pack.repository.fullName,
    repositoryUrl: pack.repository.url,
    description: pack.description,
    stars: pack.stars,
    itemCount: pack.items.length,
    lastCodePushAt: pack.lastCodePushAt,
    featured: FEATURED_MARKETPLACE_PACKS.includes(pack.repository.fullName),
    composition,
  }
}

/**
 * List admitted packs: editorial picks first in their declared order, then by
 * freshness — never by stars. Packs are few and unpaged by design.
 */
export function listMarketplacePacks(view: MarketplaceCatalogView): MarketplacePackListResponse {
  const entriesById = new Map<string, MarketplaceCatalogEntry>()
  for (const entry of view.catalog?.entries.filter(isPublicMarketplaceEntry) ?? []) {
    entriesById.set(entry.repositoryId, entry)
  }
  const featuredOrder = new Map(FEATURED_MARKETPLACE_PACKS.map((fullName, index) => [fullName, index] as const))
  const packs = (view.catalog?.packs ?? [])
    .filter(isPublicMarketplacePack)
    .sort((left, right) => {
      const leftFeatured = featuredOrder.get(left.repository.fullName)
      const rightFeatured = featuredOrder.get(right.repository.fullName)
      if (leftFeatured !== undefined || rightFeatured !== undefined) {
        if (leftFeatured === undefined) return 1
        if (rightFeatured === undefined) return -1
        return leftFeatured - rightFeatured
      }
      return Date.parse(right.lastCodePushAt) - Date.parse(left.lastCodePushAt)
        || compareText(left.repository.fullName, right.repository.fullName)
    })
    .map(pack => packSummary(pack, entriesById))
  return {
    digest: view.catalog?.integrity.digest ?? '',
    catalogStatus: view.catalog === null ? view.status : 'ready',
    source: view.source,
    stale: view.stale,
    packs,
    error: view.error,
  }
}

function packItemStatus(
  entry: MarketplaceCatalogEntry | undefined,
  state: MarketplaceProfilePluginState | undefined,
): MarketplacePackItemStatus {
  if (state !== undefined) return 'installed'
  return catalogPackItemStatus(entry)
}

/**
 * Resolve one pack against catalog and profile truth. Every item keeps its
 * declared identity; the status chip is derived, never asserted by the pack.
 */
export function detailMarketplacePack(
  view: MarketplaceCatalogView,
  snapshot: MarketplaceOperationSnapshot,
  repositoryId: string,
): MarketplacePackDetailResponse {
  const pack = view.catalog?.packs.find(candidate => (
    candidate.repositoryId === repositoryId && isPublicMarketplacePack(candidate)
  )) ?? null
  if (pack === null) return { pack: null, items: [] }
  const admitted = new Map<string, MarketplaceCatalogEntry>()
  for (const entry of view.catalog?.entries.filter(isPublicMarketplaceEntry) ?? []) {
    admitted.set(entry.repositoryId, entry)
  }
  const states = new Map(snapshot.plugins.flatMap(state => (
    state.repositoryId === null ? [] : [[state.repositoryId, state] as const]
  )))
  const items: MarketplacePackItemView[] = pack.items.map((item) => {
    const entry = item.repositoryId === null ? undefined : admitted.get(item.repositoryId)
    const state = entry === undefined ? undefined : states.get(entry.repositoryId)
    return {
      fullName: item.fullName,
      repositoryId: entry?.repositoryId ?? item.repositoryId,
      status: packItemStatus(entry, state),
      name: entry === undefined ? null : (entry.package.name ?? entry.repository.fullName),
      packageName: entry?.package.name ?? null,
      repositoryUrl: entry?.repository.url ?? null,
      state: state?.state ?? null,
    }
  })
  return { pack: packSummary(pack, admitted), items }
}
