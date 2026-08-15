/** Host-owned search, filtering, ordering, and paging for the Marketplace catalog. */

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

export const MARKETPLACE_PAGE_SIZE = 50
const ACTIVE_WINDOW_MS = 180 * 24 * 60 * 60 * 1000

/** Fixed taxonomy priority: the first matching category wins, one chip per row. */
export const MARKETPLACE_CATEGORY_PRIORITY: readonly MarketplaceCategory[] = [
  'theme', 'memory', 'usage', 'skill', 'security', 'channel', 'ui', 'tool', 'provider',
]

/**
 * Conservative fallback tokens matched against whole words from topics, keywords,
 * and repository/package names. Precision beats recall: a wrong chip is worse
 * than an honest "uncategorized", so attributive product names (codex, claude,
 * openai — "Codex-style pet", "import Claude sessions") never classify.
 */
const CATEGORY_TOKENS: Readonly<Record<MarketplaceCategory, readonly string[]>> = {
  theme: ['theme', 'themes', 'skin', 'skins', 'color-scheme', 'colour-scheme', 'appearance'],
  memory: ['memory', 'memories', 'rag', 'embedding', 'embeddings', 'vector', 'vectors', 'knowledge', 'recall'],
  usage: ['usage', 'balance', 'billing', 'quota', 'cost', 'costs', 'metering', 'spend'],
  skill: ['skill', 'skills'],
  security: ['security', 'audit', 'audits', 'approval', 'approvals', 'sandbox', 'permission', 'permissions', 'policy'],
  channel: ['feishu', 'lark', 'telegram', 'discord', 'wechat', 'dingtalk', 'slack', 'qq', 'qqbot'],
  ui: ['ui', 'tui', 'gui', 'webui', 'sidebar', 'dashboard', 'panel', 'interface', 'layout', 'pet', 'pets', 'widget', 'widgets'],
  tool: ['tool', 'tools', 'mcp', 'ocr', 'vision', 'terminal', 'cli', 'automation', 'notify', 'notification',
    'workflow', 'workflows', 'scheduler', 'session', 'sessions'],
  provider: ['provider', 'providers', 'openrouter', 'oauth'],
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
    if (CATEGORY_TOKENS[category].some(token => tokens.has(token))) return category
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
    repositoryCreatedAt: entry.repositoryCreatedAt,
    lastCodePushAt: entry.lastCodePushAt,
    firstSeenAt: entry.firstSeenAt,
    category: deriveMarketplaceCategory(entry),
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
  }
  const words = normalizedWords(request.query)
  const selected = categorized
    .filter(item => request.category === 'all'
      || (request.category === 'uncategorized' ? item.category === null : item.category === request.category))
    .filter(item => request.installability === 'all' || item.entry.installability === request.installability)
    .map(item => ({ entry: item.entry, relevance: relevance(item.entry, words) }))
    .filter(item => item.relevance >= 0)
    .sort((left, right) => compareRanked(left, right, request, view.catalog?.generatedAt ?? '1970-01-01T00:00:00.000Z'))
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

/** Join the current-profile operation snapshot with admitted catalog summaries in one call. */
export function installedMarketplacePlugins(
  view: MarketplaceCatalogView,
  snapshot: MarketplaceOperationSnapshot,
): MarketplaceInstalledResponse {
  const summaries = new Map<string, MarketplacePluginSummary>()
  for (const entry of view.catalog?.entries.filter(isPublicMarketplaceEntry) ?? []) {
    summaries.set(entry.repositoryId, summary(entry))
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

function packSummary(pack: MarketplacePackEntry): MarketplacePackSummary {
  const separator = pack.repository.fullName.indexOf('/')
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
  }
}

/** List admitted packs, most-starred first; packs are few and unpaged by design. */
export function listMarketplacePacks(view: MarketplaceCatalogView): MarketplacePackListResponse {
  const packs = (view.catalog?.packs ?? [])
    .filter(isPublicMarketplacePack)
    .sort((left, right) => right.stars - left.stars
      || compareText(left.repository.fullName, right.repository.fullName))
    .map(packSummary)
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
  if (entry === undefined) return 'unavailable'
  if (entry.installability === 'one-click-eligible') return 'installable'
  // Consent-gated only when the host can actually plan it: pinned, named, versioned.
  if (entry.installScripts !== null && entry.repository.commitSha !== null
    && entry.package.name !== null && entry.package.version !== null) {
    return 'script-gated'
  }
  return 'manual'
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
  return { pack: packSummary(pack), items }
}
