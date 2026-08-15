/** Same-origin Host API to presentation-model adapter for the external marketplace bundle. */

import { deriveMarketplaceCategory } from '../catalog-query.ts'
import type {
  MarketplaceBootstrapResponse,
  MarketplaceCatalogEntry,
  MarketplaceInstalledResponse,
  MarketplaceListRequest,
  MarketplaceListResponse,
  MarketplaceOperationPlan,
  MarketplaceOperationResult,
  MarketplaceOperationSnapshot,
  MarketplacePackDetailResponse,
  MarketplacePackListResponse,
  MarketplacePlanRequest,
  MarketplacePluginDetailResponse,
  MarketplacePluginSummary,
  MarketplaceRatingCounts,
  MarketplaceRefreshResponse,
} from '../types.ts'

export type {
  MarketplaceCategory,
  MarketplaceInstalledListItem,
  MarketplaceListRequest,
  MarketplaceOperationPlan,
  MarketplaceOperationResult,
  MarketplaceOperationSnapshot,
  MarketplacePackItemStatus,
  MarketplacePackItemView,
  MarketplacePackSummary,
  MarketplacePlanRequest,
} from '../types.ts'

/** Package-private same-origin API face, independent of DSH's static Remote assembly. */
export interface MarketplaceCatalogRemoteFace {
  bootstrap: (request: MarketplaceListRequest) => Promise<MarketplaceBootstrapResponse>
  list: (request: MarketplaceListRequest) => Promise<MarketplaceListResponse>
  detail: (request: { readonly repositoryId: string }) => Promise<MarketplacePluginDetailResponse>
  refresh: (request: { readonly request: MarketplaceListRequest; readonly currentDigest: string }) => Promise<MarketplaceRefreshResponse>
  operationSnapshot: () => Promise<MarketplaceOperationSnapshot>
  installed: () => Promise<MarketplaceInstalledResponse>
  packs: () => Promise<MarketplacePackListResponse>
  packDetail: (request: { readonly repositoryId: string }) => Promise<MarketplacePackDetailResponse>
  plan: (request: MarketplacePlanRequest) => Promise<MarketplaceOperationPlan>
  execute: (request: { readonly planId: NonNullable<MarketplaceOperationPlan['planId']>; readonly allowScripts?: boolean }) => Promise<MarketplaceOperationResult>
}

/** One compact Host-owned catalog row. */
export interface MarketplacePluginRowModel {
  readonly id: string
  readonly name: string
  readonly publisher: string
  readonly author: string | null
  readonly packageName: string | null
  readonly packageVersion: string | null
  readonly repositoryFullName: string
  readonly repositoryUrl: string
  readonly description: string | null
  readonly license: string | null
  readonly stars: number
  readonly repositoryCreatedAt: string
  readonly lastCodePushAt: string
  readonly firstSeenAt: string
  readonly category: MarketplacePluginSummary['category']
  readonly installability: MarketplacePluginSummary['installability']
  readonly compatibility: MarketplacePluginSummary['compatibility']
  readonly freshness: number
  readonly rating: MarketplaceRatingCounts | null
  readonly voteUrl: string | null
}

/** One selected detail with its full catalog evidence. */
export interface MarketplacePluginDetailModel {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly packageName: string | null
  readonly packageVersion: string | null
  readonly repositoryFullName: string
  readonly repositoryUrl: string
  readonly publisher: string
  readonly author: string | null
  readonly license: string | null
  readonly topics: readonly string[]
  readonly keywords: readonly string[]
  readonly stars: number
  readonly repositoryCreatedAt: string
  readonly lastCodePushAt: string
  readonly firstSeenAt: string
  readonly category: MarketplacePluginSummary['category']
  readonly validationStatus: MarketplaceCatalogEntry['validation']['status']
  readonly validationMessage: string | null
  readonly compatibility: MarketplaceCatalogEntry['compatibility']
  readonly installability: MarketplaceCatalogEntry['installability']
  readonly riskSignals: MarketplaceCatalogEntry['riskSignals']
  readonly installScripts: Readonly<Record<string, string>> | null
  readonly sourceRef: string
  readonly freshness: number
  readonly rating: MarketplaceRatingCounts | null
  readonly voteUrl: string | null
}

/** Host-owned one-page list and its freshness state. */
export interface MarketplaceListModel extends Omit<MarketplaceListResponse, 'items'> {
  readonly items: readonly MarketplacePluginRowModel[]
}

export function toPluginRowModel(entry: MarketplacePluginSummary): MarketplacePluginRowModel {
  return {
    id: entry.repositoryId,
    name: entry.name,
    publisher: entry.publisher,
    author: entry.author,
    packageName: entry.packageName,
    packageVersion: entry.packageVersion,
    repositoryFullName: entry.repositoryFullName,
    repositoryUrl: entry.repositoryUrl,
    description: entry.description,
    license: entry.license,
    stars: entry.stars,
    repositoryCreatedAt: entry.repositoryCreatedAt,
    lastCodePushAt: entry.lastCodePushAt,
    firstSeenAt: entry.firstSeenAt,
    category: entry.category,
    installability: entry.installability,
    compatibility: entry.compatibility,
    freshness: entry.freshness,
    rating: entry.rating,
    voteUrl: entry.voteUrl,
  }
}

export function toListModel(response: MarketplaceListResponse): MarketplaceListModel {
  return { ...response, items: response.items.map(toPluginRowModel) }
}

export function toPluginDetailModel(response: MarketplacePluginDetailResponse): MarketplacePluginDetailModel | null {
  const entry = response.entry
  if (entry === null) return null
  return {
    id: entry.repositoryId,
    name: entry.package.name ?? entry.repository.fullName,
    description: entry.package.description,
    packageName: entry.package.name,
    packageVersion: entry.package.version,
    repositoryFullName: entry.repository.fullName,
    repositoryUrl: entry.repository.url,
    publisher: entry.repository.fullName.split('/')[0] ?? entry.repository.fullName,
    author: entry.package.author,
    license: entry.package.license,
    topics: entry.topics,
    keywords: entry.keywords,
    stars: entry.stars,
    repositoryCreatedAt: entry.repositoryCreatedAt,
    lastCodePushAt: entry.lastCodePushAt,
    firstSeenAt: entry.firstSeenAt,
    category: deriveMarketplaceCategory(entry),
    validationStatus: entry.validation.status,
    validationMessage: entry.validation.message,
    compatibility: entry.compatibility,
    installability: entry.installability,
    riskSignals: entry.riskSignals,
    installScripts: entry.installScripts,
    sourceRef: entry.source.ref,
    freshness: response.freshness ?? 0,
    rating: response.rating,
    voteUrl: response.voteUrl,
  }
}

export async function bootstrapMarketplace(remote: MarketplaceCatalogRemoteFace, request: MarketplaceListRequest): Promise<{
  readonly list: MarketplaceListModel
  readonly operations: MarketplaceOperationSnapshot
}> {
  const response = await remote.bootstrap(request)
  return { list: toListModel(response.list), operations: response.operations }
}

export async function listMarketplace(remote: MarketplaceCatalogRemoteFace, request: MarketplaceListRequest): Promise<MarketplaceListModel> {
  return toListModel(await remote.list(request))
}

export async function detailMarketplace(remote: MarketplaceCatalogRemoteFace, repositoryId: string): Promise<MarketplacePluginDetailModel | null> {
  return toPluginDetailModel(await remote.detail({ repositoryId }))
}

export async function refreshMarketplace(
  remote: MarketplaceCatalogRemoteFace,
  request: MarketplaceListRequest,
  currentDigest: string,
): Promise<{ readonly changed: boolean; readonly list: MarketplaceListModel | null; readonly source: MarketplaceRefreshResponse['source']; readonly stale: boolean; readonly lastSuccessfulFetchAt: string | null; readonly error: MarketplaceRefreshResponse['error'] }> {
  const response = await remote.refresh({ request, currentDigest })
  return { ...response, list: response.list === null ? null : toListModel(response.list) }
}

export function readOperationSnapshot(remote: MarketplaceCatalogRemoteFace): Promise<MarketplaceOperationSnapshot> {
  return remote.operationSnapshot()
}

export function installedMarketplace(remote: MarketplaceCatalogRemoteFace): Promise<MarketplaceInstalledResponse> {
  return remote.installed()
}

export function planMarketplaceOperation(remote: MarketplaceCatalogRemoteFace, request: MarketplacePlanRequest): Promise<MarketplaceOperationPlan> {
  return remote.plan(request)
}

export function executeMarketplaceOperation(
  remote: MarketplaceCatalogRemoteFace,
  planId: NonNullable<MarketplaceOperationPlan['planId']>,
  allowScripts = false,
): Promise<MarketplaceOperationResult> {
  return remote.execute({ planId, ...(allowScripts ? { allowScripts: true } : {}) })
}

export function listMarketplacePacks(remote: MarketplaceCatalogRemoteFace): Promise<MarketplacePackListResponse> {
  return remote.packs()
}

export function detailMarketplacePack(remote: MarketplaceCatalogRemoteFace, repositoryId: string): Promise<MarketplacePackDetailResponse> {
  return remote.packDetail({ repositoryId })
}
