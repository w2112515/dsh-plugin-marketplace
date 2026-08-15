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

/** Compatibility is never inferred from popularity or repository metadata. */
export type MarketplaceCompatibility = 'compatible' | 'incompatible' | 'unknown'

/** Installation eligibility remains conservative until the M2 artifact contract exists. */
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
}

/** Summary kept next to the entries so partial scanner output cannot look complete. */
export interface MarketplaceCatalogSummary {
  readonly entryCount: number
  readonly invalidEntryCount: number
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

/** Opaque, short-lived identifier for one reviewed profile operation. */
export type MarketplacePlanId = string & { readonly __marketplacePlanId: unique symbol }

/** Current-profile state of one catalog package. */
export interface MarketplaceProfilePluginState {
  readonly repositoryId: string
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
  readonly catalogSpec: string
  readonly updateAvailable: boolean
}

/** Snapshot of profile operations and catalog packages in the active Web profile. */
export interface MarketplaceOperationSnapshot {
  readonly profileName: string
  readonly busy: boolean
  readonly plugins: readonly MarketplaceProfilePluginState[]
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

/** Warning disclosed before the user confirms code installation or removal. */
export type MarketplacePlanWarning =
  | 'compatibility-unknown'
  | 'git-source'
  | 'code-executes-on-restart'
  | 'install-scripts-disabled'
  | 'restart-required'

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
  readonly warnings: readonly MarketplacePlanWarning[]
  readonly expiresAt: string | null
}

/** Execute one previously reviewed operation exactly once. */
export interface MarketplaceExecuteRequest {
  readonly planId: MarketplacePlanId
}

/** Stable result code for a committed, rejected, or recovered profile operation. */
export type MarketplaceOperationCode =
  | 'succeeded'
  | 'operation-busy'
  | 'plan-expired'
  | 'plan-invalid'
  | 'profile-state-changed'
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
