/** Validation status assigned without executing third-party repository code. */
export type MarketplaceValidationStatus = 'valid' | 'invalid' | 'archived'

/** Stable validation outcome code emitted by the catalog scanner. */
export type MarketplaceValidationCode =
  | 'valid-bundle'
  | 'repository-archived'
  | 'package-json-missing'
  | 'package-json-invalid'
  | 'bundle-declaration-missing'
  | 'patch-path-invalid'
  | 'patch-missing'
  | 'patch-invalid'
  | 'github-request-failed'

/** Stable validation outcome code for solution-pack repositories. */
export type MarketplacePackValidationCode =
  | 'valid-pack'
  | 'repository-archived'
  | 'pack-manifest-missing'
  | 'pack-manifest-invalid'
  | 'github-request-failed'

/** Compatibility is never inferred from popularity or repository metadata. */
export type MarketplaceCompatibility = 'compatible' | 'incompatible' | 'unknown'

/** Installation eligibility: one-click is earned by verified shipped files at the pin. */
export type MarketplaceInstallability = 'browse-only' | 'manual' | 'one-click-eligible'

/** Statically observable repository risks. */
export type MarketplaceRiskSignal =
  | 'repository-archived'
  | 'git-source'
  | 'unpinned-source'
  | 'lifecycle-script'
  | 'build-script'

/** Integrity metadata over the canonical catalog payload with an empty digest field. */
export interface MarketplaceCatalogIntegrity {
  readonly algorithm: 'sha256'
  readonly digest: string
}

/** One discovered DSH bundle repository. */
export interface MarketplaceCatalogEntry {
  /** Stable GitHub repository id serialized as a decimal string. */
  readonly repositoryId: string
  readonly repository: {
    readonly fullName: string
    readonly url: string
    readonly defaultBranch: string
    readonly commitSha: string | null
    readonly archived: boolean
  }
  readonly package: {
    readonly name: string | null
    readonly version: string | null
    readonly description: string | null
    readonly author: string | null
    readonly license: string | null
  }
  readonly topics: readonly string[]
  readonly keywords: readonly string[]
  readonly stars: number
  readonly repositoryCreatedAt: string
  readonly lastCodePushAt: string
  readonly firstSeenAt: string
  readonly indexedAt: string
  readonly source: {
    readonly kind: 'git'
    readonly ref: string
    readonly packageJsonPath: 'package.json'
    readonly patchPath: string | null
  }
  readonly validation: {
    readonly status: MarketplaceValidationStatus
    readonly code: MarketplaceValidationCode
    readonly message: string | null
  }
  readonly compatibility: MarketplaceCompatibility
  readonly installability: MarketplaceInstallability
  readonly riskSignals: readonly MarketplaceRiskSignal[]
  /**
   * Lifecycle script bodies (preinstall/install/postinstall/prepare) declared by
   * the package, verbatim. Null when none exist. Their presence on a 'manual'
   * entry marks the consent-gated installation path: the Host may run them only
   * after the user reviews and approves these exact strings.
   */
  readonly installScripts: Readonly<Record<string, string>> | null
}

/** One plugin reference inside a solution pack, keyed by stable repository id. */
export interface MarketplacePackItem {
  /** owner/repo exactly as the pack author declared it. */
  readonly fullName: string
  /** Stable repository id when the item resolved to a scanned plugin repository. */
  readonly repositoryId: string | null
}

/** One discovered solution-pack repository (double-tagged dsh-plugin + dsh-plugin-pack). */
export interface MarketplacePackEntry {
  readonly repositoryId: string
  readonly repository: {
    readonly fullName: string
    readonly url: string
    readonly defaultBranch: string
    readonly commitSha: string | null
    readonly archived: boolean
  }
  readonly name: string
  readonly description: string | null
  readonly items: readonly MarketplacePackItem[]
  readonly stars: number
  readonly repositoryCreatedAt: string
  readonly lastCodePushAt: string
  readonly firstSeenAt: string
  readonly indexedAt: string
  readonly validation: {
    readonly status: MarketplaceValidationStatus
    readonly code: MarketplacePackValidationCode
    readonly message: string | null
  }
}

/** Summary kept next to the entries so partial scanner output cannot look complete. */
export interface MarketplaceCatalogSummary {
  readonly entryCount: number
  readonly invalidEntryCount: number
  readonly packCount: number
}

/** Version-one immutable marketplace publication. */
export interface MarketplaceCatalogSnapshot {
  readonly schemaVersion: 1
  readonly generatedAt: string
  readonly scannerVersion: string
  readonly topic: string
  readonly integrity: MarketplaceCatalogIntegrity
  readonly summary: MarketplaceCatalogSummary
  readonly entries: readonly MarketplaceCatalogEntry[]
  readonly packs: readonly MarketplacePackEntry[]
}

/** Host-side retrieval/cache failure codes safe to show to a Client. */
export type MarketplaceCatalogErrorCode =
  | 'catalog-url-unconfigured'
  | 'cache-invalid'
  | 'network-error'
  | 'http-error'
  | 'payload-too-large'
  | 'catalog-invalid'
  | 'cache-write-failed'
  | 'service-disposed'

/** Sanitized retrieval failure. */
export interface MarketplaceCatalogError {
  readonly code: MarketplaceCatalogErrorCode
  readonly message: string
}

/** Read-only Host projection consumed by the Marketplace Client adapter. */
export interface MarketplaceCatalogView {
  readonly status: 'ready' | 'empty' | 'unavailable'
  readonly source: 'network' | 'cache' | 'none'
  readonly sourceUrl: string
  readonly lastSuccessfulFetchAt: string | null
  readonly stale: boolean
  readonly catalog: MarketplaceCatalogSnapshot | null
  readonly error: MarketplaceCatalogError | null
}

/** Coarse Host-owned taxonomy derived from declared topics, keywords, and names. */
export type MarketplaceCategory = 'theme' | 'ui' | 'tool' | 'memory'

/** Category segment: one taxonomy slug, entries without a derivable category, or everything. */
export type MarketplaceCategoryFilter = MarketplaceCategory | 'uncategorized' | 'all'

/** Installability segment selected by the Marketplace browser. */
export type MarketplaceInstallabilityFilter = 'all' | 'one-click-eligible' | 'manual'

/** Stable user-facing ordering supported by the Host-owned catalog index. */
export type MarketplaceSort = 'recommended' | 'stars' | 'recently-updated' | 'recently-added'

/** Bounded Host-side Marketplace query. Page numbers are one-based. */
export interface MarketplaceListRequest {
  readonly query: string
  readonly category: MarketplaceCategoryFilter
  readonly installability: MarketplaceInstallabilityFilter
  readonly sort: MarketplaceSort
  readonly page: number
}

/** Compact catalog row sent to the browser; full scanner evidence is detail-only. */
export interface MarketplacePluginSummary {
  readonly repositoryId: string
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
  readonly category: MarketplaceCategory | null
  readonly installability: Exclude<MarketplaceInstallability, 'browse-only'>
  readonly compatibility: MarketplaceCompatibility
  readonly riskSignals: readonly MarketplaceRiskSignal[]
}

/** Counts are calculated before the installability and category segments are applied. */
export interface MarketplaceListCounts {
  readonly all: number
  readonly oneClick: number
  readonly manual: number
  readonly categories: Readonly<Record<MarketplaceCategory, number>>
  readonly uncategorized: number
}

/** One bounded catalog page and the freshness facts that qualify it. */
export interface MarketplaceListResponse {
  readonly digest: string
  readonly catalogStatus: MarketplaceCatalogView['status']
  readonly source: MarketplaceCatalogView['source']
  readonly stale: boolean
  readonly generatedAt: string | null
  readonly lastSuccessfulFetchAt: string | null
  readonly total: number
  readonly counts: MarketplaceListCounts
  readonly page: number
  readonly pageCount: number
  readonly items: readonly MarketplacePluginSummary[]
  readonly error: MarketplaceCatalogError | null
}

/** Host-qualified package-manager and profile-write capabilities. */
export interface MarketplaceOperationCapabilities {
  readonly packageManager: 'pnpm' | 'corepack-pnpm' | 'unavailable'
  readonly profileWritable: boolean
  readonly profileName: string
  readonly message: string | null
}

/** First-load result: one page plus all current-profile operation truth. */
export interface MarketplaceBootstrapResponse {
  readonly list: MarketplaceListResponse
  readonly capabilities: MarketplaceOperationCapabilities
  readonly operations: MarketplaceOperationSnapshot
}

/** A refresh avoids retransmitting page rows when the catalog digest is unchanged. */
export interface MarketplaceRefreshResponse {
  readonly changed: boolean
  readonly list: MarketplaceListResponse | null
  readonly source: MarketplaceCatalogView['source']
  readonly stale: boolean
  readonly lastSuccessfulFetchAt: string | null
  readonly error: MarketplaceCatalogError | null
}

/** Full scanner evidence and current-profile state requested for one detail view. */
export interface MarketplacePluginDetailResponse {
  readonly entry: MarketplaceCatalogEntry | null
  readonly state: MarketplaceProfilePluginState | null
}

/** Compact pack row for the discover view. */
export interface MarketplacePackSummary {
  readonly repositoryId: string
  readonly name: string
  readonly publisher: string
  readonly repositoryFullName: string
  readonly repositoryUrl: string
  readonly description: string | null
  readonly stars: number
  readonly itemCount: number
  readonly lastCodePushAt: string
}

/** All admitted packs plus the freshness facts that qualify them. */
export interface MarketplacePackListResponse {
  readonly digest: string
  readonly catalogStatus: MarketplaceCatalogView['status']
  readonly source: MarketplaceCatalogView['source']
  readonly stale: boolean
  readonly packs: readonly MarketplacePackSummary[]
  readonly error: MarketplaceCatalogError | null
}

/** How one pack item relates to the catalog and the current profile. */
export type MarketplacePackItemStatus =
  /** Admitted and one-click-eligible; the pack installer may queue it. */
  | 'installable'
  /** Admitted but needs install scripts; consent stays per-plugin, never bulk. */
  | 'script-gated'
  /** Admitted but cannot be installed automatically at all; repository link only. */
  | 'manual'
  /** Not resolved to an admitted catalog entry; the pack cannot deliver it. */
  | 'unavailable'
  /** Already present in the current profile (any installed or pending state). */
  | 'installed'

/** One pack item joined with catalog and profile truth. */
export interface MarketplacePackItemView {
  readonly fullName: string
  readonly repositoryId: string | null
  readonly status: MarketplacePackItemStatus
  readonly name: string | null
  readonly packageName: string | null
  readonly repositoryUrl: string | null
  readonly state: MarketplaceProfilePluginState['state'] | null
}

/** Pack detail with every item's status resolved for the confirm view. */
export interface MarketplacePackDetailResponse {
  readonly pack: MarketplacePackSummary | null
  readonly items: readonly MarketplacePackItemView[]
}

/** Opaque, short-lived identifier for one reviewed profile operation. */
export type MarketplacePlanId = string & { readonly __marketplacePlanId: unique symbol }

/** Relationship between the installed pin and the catalog pin for one package. */
export type MarketplaceCatalogRelation =
  /** Installed pin matches the catalog pin (or nothing is pinned right now). */
  | 'up-to-date'
  /** The Marketplace installed this exact pin and the catalog has since moved forward. */
  | 'update-available'
  /** Same repository, but the pin differs and the direction cannot be proven locally. */
  | 'diverged'
  /** The installed repository is not described by the catalog at all. */
  | 'not-in-catalog'

/** Current-profile state of one catalog package. */
export interface MarketplaceProfilePluginState {
  /** Catalog identity, attached only when the installed origin matches the entry's repository. */
  readonly repositoryId: string | null
  readonly packageName: string | null
  readonly state:
    | 'not-installed'
    | 'active'
    | 'pending-install'
    | 'pending-update'
    | 'pending-removal'
    | 'installed-inactive'
  readonly installedVersion: string | null
  readonly installedSpec: string | null
  /** Repository (owner/name) parsed from the installed spec, regardless of catalog membership. */
  readonly installedRepository: string | null
  readonly catalogSpec: string | null
  readonly catalogRelation: MarketplaceCatalogRelation
  /** True only when the update direction is proven; never claimed for diverged or foreign pins. */
  readonly updateAvailable: boolean
}

/** Profile package that no catalog entry describes; manageable only outside the Marketplace. */
export interface MarketplaceExternalPlugin {
  readonly packageName: string
  readonly installedSpec: string | null
  readonly activeAtLaunch: boolean
  readonly activeAfterRestart: boolean
}

/** Sparse snapshot of installed or restart-pending catalog packages in the active Web profile. */
export interface MarketplaceOperationSnapshot {
  readonly profileName: string
  readonly busy: boolean
  readonly capabilities: MarketplaceOperationCapabilities
  readonly plugins: readonly MarketplaceProfilePluginState[]
  readonly external: readonly MarketplaceExternalPlugin[]
}

/** One installed catalog package joined with its summary for the management view. */
export interface MarketplaceInstalledListItem {
  readonly state: MarketplaceProfilePluginState
  readonly plugin: MarketplacePluginSummary | null
}

/** Complete installed inventory of the current profile; bounded by profile size, never paged. */
export interface MarketplaceInstalledResponse {
  readonly profileName: string
  readonly busy: boolean
  readonly capabilities: MarketplaceOperationCapabilities
  readonly items: readonly MarketplaceInstalledListItem[]
  readonly external: readonly MarketplaceExternalPlugin[]
}

/** User-selected operation before Host-side qualification. */
export interface MarketplacePlanRequest {
  readonly repositoryId: string
  readonly action: 'install' | 'remove'
}

/** Stable reason that blocks a requested operation before any profile write. */
export type MarketplacePlanBlockCode =
  | 'catalog-entry-missing'
  | 'not-one-click-eligible'
  | 'package-metadata-missing'
  | 'already-installed'
  | 'not-installed'
  | 'restart-required'
  | 'package-manager-unavailable'
  | 'profile-not-writable'

/** Warning disclosed before the user confirms code installation or removal. */
export type MarketplacePlanWarning =
  | 'compatibility-unknown'
  | 'git-source'
  | 'code-executes-on-restart'
  | 'install-scripts-disabled'
  | 'install-scripts-run'
  | 'restart-required'
  | 'origin-differs'

/** Exact, expiring operation review produced from the current catalog and profile state. */
export interface MarketplaceOperationPlan {
  readonly status: 'ready' | 'blocked'
  readonly planId: MarketplacePlanId | null
  readonly blockCode: MarketplacePlanBlockCode | null
  readonly action: 'install' | 'update' | 'remove' | null
  readonly profileName: string
  readonly repositoryId: string
  readonly packageName: string | null
  readonly packageVersion: string | null
  readonly sourceRef: string | null
  readonly commitSha: string | null
  /** True when installation must run the declared lifecycle scripts to succeed. */
  readonly requiresScripts: boolean
  /** The exact script bodies the user must approve when requiresScripts is true. */
  readonly installScripts: Readonly<Record<string, string>> | null
  readonly warnings: readonly MarketplacePlanWarning[]
  readonly expiresAt: string | null
}

/** Execute one previously reviewed operation exactly once. */
export interface MarketplaceExecuteRequest {
  readonly planId: MarketplacePlanId
  /** Required to be exactly true when the reviewed plan carries requiresScripts. */
  readonly allowScripts?: boolean
}

/** Stable result code for a committed, rejected, or recovered profile operation. */
export type MarketplaceOperationCode =
  | 'succeeded'
  | 'operation-busy'
  | 'plan-expired'
  | 'plan-invalid'
  | 'consent-required'
  | 'profile-state-changed'
  | 'profile-write-failed'
  | 'pnpm-unavailable'
  | 'pnpm-failed'
  | 'installed-package-invalid'
  | 'rollback-failed'
  | 'service-disposed'

/** Result of one profile operation, including recovery and the authoritative next snapshot. */
export interface MarketplaceOperationResult {
  readonly status: 'succeeded' | 'failed'
  readonly code: MarketplaceOperationCode
  readonly action: 'install' | 'update' | 'remove' | null
  readonly profileName: string
  readonly packageName: string | null
  readonly requiresRestart: boolean
  readonly rollback: 'not-needed' | 'succeeded' | 'failed'
  readonly snapshot: MarketplaceOperationSnapshot
}
