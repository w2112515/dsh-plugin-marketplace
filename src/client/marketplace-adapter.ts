/** Same-origin Host API to presentation-model adapter for the external marketplace bundle. */

import type {
  MarketplaceCatalogView,
  MarketplaceOperationPlan,
  MarketplaceOperationResult,
  MarketplaceOperationSnapshot,
  MarketplacePlanRequest,
} from '../types.ts'

type MarketplaceCatalogSnapshot = NonNullable<MarketplaceCatalogView['catalog']>

/** Catalog entry selected from the generated Host projection. */
export type MarketplaceCatalogEntry = MarketplaceCatalogSnapshot['entries'][number]
/** Validation status carried by a catalog entry. */
export type MarketplaceValidationStatus = MarketplaceCatalogEntry['validation']['status']
/** Compatibility assessment carried by a catalog entry. */
export type MarketplaceCompatibility = MarketplaceCatalogEntry['compatibility']
/** Installation eligibility carried by a catalog entry. */
export type MarketplaceInstallability = MarketplaceCatalogEntry['installability']
/** Static repository risk carried by a catalog entry. */
export type MarketplaceRiskSignal = MarketplaceCatalogEntry['riskSignals'][number]
/** Package-private same-origin API face; deliberately independent of DSH's static Remote assembly. */
export interface MarketplaceCatalogRemoteFace {
  snapshot: () => Promise<MarketplaceCatalogView>
  refresh: () => Promise<MarketplaceCatalogView>
  operationSnapshot: () => Promise<MarketplaceOperationSnapshot>
  plan: (request: MarketplacePlanRequest) => Promise<MarketplaceOperationPlan>
  execute: (request: { readonly planId: NonNullable<MarketplaceOperationPlan['planId']> }) => Promise<MarketplaceOperationResult>
}
type MarketplaceCatalogReadRemoteFace = Pick<MarketplaceCatalogRemoteFace, 'snapshot' | 'refresh'>
export type {
  MarketplaceOperationPlan,
  MarketplaceOperationResult,
  MarketplaceOperationSnapshot,
  MarketplacePlanRequest,
}

/** Sanitized error suitable for presentation. */
export interface MarketplaceCatalogErrorModel {
  readonly code: string
  readonly message: string
}

/** One plugin entry as the presentation layer needs it. */
export interface MarketplacePluginModel {
  /** Stable GitHub repository identity. */
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly packageName: string | null
  readonly packageVersion: string | null
  readonly repositoryFullName: string
  readonly repositoryUrl: string
  readonly author: string | null
  readonly license: string | null
  readonly topics: readonly string[]
  readonly keywords: readonly string[]
  readonly stars: number
  /** Time the stars count was observed. */
  readonly starsObservedAt: string
  readonly repositoryCreatedAt: string
  readonly lastCodePushAt: string
  readonly firstSeenAt: string
  readonly indexedAt: string
  readonly archived: boolean
  readonly validationStatus: MarketplaceValidationStatus
  readonly validationMessage: string | null
  readonly compatibility: MarketplaceCompatibility
  readonly installability: MarketplaceInstallability
  readonly riskSignals: readonly MarketplaceRiskSignal[]
  readonly sourceKind: 'git'
  readonly sourceRef: string
}

/** Catalog-level presentation state. */
export interface MarketplaceCatalogModel {
  readonly status: MarketplaceCatalogView['status']
  readonly source: MarketplaceCatalogView['source']
  readonly lastSuccessfulFetchAt: string | null
  readonly generatedAt: string | null
  readonly stale: boolean
  readonly error: MarketplaceCatalogErrorModel | null
  readonly plugins: readonly MarketplacePluginModel[]
}

/**
 * Adapt one Host entry into the private presentation model.
 * @param entry - Strict catalog entry returned by the Host API.
 * @returns UI-only plugin facts with no wire parsing responsibility.
 */
export function toPluginModel(entry: MarketplaceCatalogEntry): MarketplacePluginModel {
  return {
    id: entry.repositoryId,
    name: entry.package.name ?? entry.repository.fullName,
    description: entry.package.description,
    packageName: entry.package.name,
    packageVersion: entry.package.version,
    repositoryFullName: entry.repository.fullName,
    repositoryUrl: entry.repository.url,
    author: entry.package.author,
    license: entry.package.license,
    topics: entry.topics,
    keywords: entry.keywords,
    stars: entry.stars,
    starsObservedAt: entry.indexedAt,
    repositoryCreatedAt: entry.repositoryCreatedAt,
    lastCodePushAt: entry.lastCodePushAt,
    firstSeenAt: entry.firstSeenAt,
    indexedAt: entry.indexedAt,
    archived: entry.repository.archived,
    validationStatus: entry.validation.status,
    validationMessage: entry.validation.message,
    compatibility: entry.compatibility,
    installability: entry.installability,
    riskSignals: entry.riskSignals,
    sourceKind: entry.source.kind,
    sourceRef: entry.source.ref,
  }
}

/**
 * Adapt the Host projection into the private catalog model.
 * @param view - Catalog snapshot and freshness state returned by the Host.
 * @returns Presentation state consumed by the Marketplace tab.
 */
export function toCatalogModel(view: MarketplaceCatalogView): MarketplaceCatalogModel {
  return {
    status: view.status,
    source: view.source,
    lastSuccessfulFetchAt: view.lastSuccessfulFetchAt,
    generatedAt: view.catalog?.generatedAt ?? null,
    stale: view.stale,
    error: view.error,
    plugins: view.catalog?.entries.map(toPluginModel) ?? [],
  }
}

/**
 * Build an unavailable catalog model from a Remote or transport failure.
 * @param error - Sanitized failure safe for the browser presentation layer.
 * @returns Empty unavailable state that preserves the public error.
 */
export function unavailableCatalogModel(error: MarketplaceCatalogErrorModel): MarketplaceCatalogModel {
  return {
    status: 'unavailable',
    source: 'none',
    lastSuccessfulFetchAt: null,
    generatedAt: null,
    stale: false,
    error,
    plugins: [],
  }
}

/**
 * Read one Host projection and contain transport failures inside the adapter.
 * @param remote - Package-private Marketplace API face.
 * @param method - Cache-only snapshot or conditional refresh operation.
 * @returns Adapted presentation state; transport failures become unavailable state.
 */
export async function readCatalogModel(
  remote: MarketplaceCatalogReadRemoteFace,
  method: 'snapshot' | 'refresh',
): Promise<MarketplaceCatalogModel> {
  try {
    return toCatalogModel(await remote[method]())
  } catch (cause) {
    return unavailableCatalogModel({
      code: 'transport-error',
      message: cause instanceof Error ? cause.message : String(cause),
    })
  }
}

/**
 * Read current-profile Marketplace operation state.
 * @param remote - Package-private Marketplace API client.
 * @returns Current installed and restart-pending plugin states.
 */
export function readOperationSnapshot(remote: MarketplaceCatalogRemoteFace): Promise<MarketplaceOperationSnapshot> {
  return remote.operationSnapshot()
}

/**
 * Qualify an install, update, or remove request for explicit review.
 * @param remote - Package-private Marketplace API client.
 * @param request - Repository and requested operation.
 * @returns A short-lived review plan or a blocked decision.
 */
export function planMarketplaceOperation(
  remote: MarketplaceCatalogRemoteFace,
  request: MarketplacePlanRequest,
): Promise<MarketplaceOperationPlan> {
  return remote.plan(request)
}

/**
 * Execute one short-lived plan after the user confirms its exact facts.
 * @param remote - Package-private Marketplace API client.
 * @param planId - Host-issued plan identifier from the review step.
 * @returns Committed or rolled-back operation result.
 */
export function executeMarketplaceOperation(
  remote: MarketplaceCatalogRemoteFace,
  planId: NonNullable<MarketplaceOperationPlan['planId']>,
): Promise<MarketplaceOperationResult> {
  return remote.execute({ planId })
}
