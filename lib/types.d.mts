//#region src/types.d.ts
/** Validation status assigned without executing third-party repository code. */
type MarketplaceValidationStatus = 'valid' | 'invalid' | 'archived';
/** Stable validation outcome code emitted by the catalog scanner. */
type MarketplaceValidationCode = 'valid-bundle' | 'repository-archived' | 'package-json-missing' | 'package-json-invalid' | 'bundle-declaration-missing' | 'patch-path-invalid' | 'patch-missing' | 'patch-invalid' | 'github-request-failed';
/** Compatibility is never inferred from popularity or repository metadata. */
type MarketplaceCompatibility = 'compatible' | 'incompatible' | 'unknown';
/** Installation eligibility remains conservative until the M2 artifact contract exists. */
type MarketplaceInstallability = 'browse-only' | 'manual' | 'one-click-eligible';
/** Statically observable repository risks. */
type MarketplaceRiskSignal = 'repository-archived' | 'git-source' | 'unpinned-source' | 'lifecycle-script' | 'build-script';
/** Integrity metadata over the canonical catalog payload with an empty digest field. */
interface MarketplaceCatalogIntegrity {
  readonly algorithm: 'sha256';
  readonly digest: string;
}
/** One discovered DSH bundle repository. */
interface MarketplaceCatalogEntry {
  /** Stable GitHub repository id serialized as a decimal string. */
  readonly repositoryId: string;
  readonly repository: {
    readonly fullName: string;
    readonly url: string;
    readonly defaultBranch: string;
    readonly commitSha: string | null;
    readonly archived: boolean;
  };
  readonly package: {
    readonly name: string | null;
    readonly version: string | null;
    readonly description: string | null;
    readonly author: string | null;
    readonly license: string | null;
  };
  readonly topics: readonly string[];
  readonly keywords: readonly string[];
  readonly stars: number;
  readonly repositoryCreatedAt: string;
  readonly lastCodePushAt: string;
  readonly firstSeenAt: string;
  readonly indexedAt: string;
  readonly source: {
    readonly kind: 'git';
    readonly ref: string;
    readonly packageJsonPath: 'package.json';
    readonly patchPath: string | null;
  };
  readonly validation: {
    readonly status: MarketplaceValidationStatus;
    readonly code: MarketplaceValidationCode;
    readonly message: string | null;
  };
  readonly compatibility: MarketplaceCompatibility;
  readonly installability: MarketplaceInstallability;
  readonly riskSignals: readonly MarketplaceRiskSignal[];
}
/** Summary kept next to the entries so partial scanner output cannot look complete. */
interface MarketplaceCatalogSummary {
  readonly entryCount: number;
  readonly invalidEntryCount: number;
}
/** Version-one immutable marketplace publication. */
interface MarketplaceCatalogSnapshot {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly scannerVersion: string;
  readonly topic: string;
  readonly integrity: MarketplaceCatalogIntegrity;
  readonly summary: MarketplaceCatalogSummary;
  readonly entries: readonly MarketplaceCatalogEntry[];
}
/** Host-side retrieval/cache failure codes safe to show to a Client. */
type MarketplaceCatalogErrorCode = 'catalog-url-unconfigured' | 'cache-invalid' | 'network-error' | 'http-error' | 'payload-too-large' | 'catalog-invalid' | 'cache-write-failed' | 'service-disposed';
/** Sanitized retrieval failure. */
interface MarketplaceCatalogError {
  readonly code: MarketplaceCatalogErrorCode;
  readonly message: string;
}
/** Read-only Host projection consumed by the Marketplace Client adapter. */
interface MarketplaceCatalogView {
  readonly status: 'ready' | 'empty' | 'unavailable';
  readonly source: 'network' | 'cache' | 'none';
  readonly sourceUrl: string;
  readonly lastSuccessfulFetchAt: string | null;
  readonly stale: boolean;
  readonly catalog: MarketplaceCatalogSnapshot | null;
  readonly error: MarketplaceCatalogError | null;
}
/** Installability segment selected by the Marketplace browser. */
type MarketplaceInstallabilityFilter = 'all' | 'one-click-eligible' | 'manual';
/** Stable user-facing ordering supported by the Host-owned catalog index. */
type MarketplaceSort = 'recommended' | 'stars' | 'recently-updated' | 'recently-added';
/** Bounded Host-side Marketplace query. Page numbers are one-based. */
interface MarketplaceListRequest {
  readonly query: string;
  readonly installability: MarketplaceInstallabilityFilter;
  readonly sort: MarketplaceSort;
  readonly page: number;
}
/** Compact catalog row sent to the browser; full scanner evidence is detail-only. */
interface MarketplacePluginSummary {
  readonly repositoryId: string;
  readonly name: string;
  readonly publisher: string;
  readonly author: string | null;
  readonly packageName: string | null;
  readonly packageVersion: string | null;
  readonly repositoryFullName: string;
  readonly repositoryUrl: string;
  readonly description: string | null;
  readonly license: string | null;
  readonly stars: number;
  readonly lastCodePushAt: string;
  readonly firstSeenAt: string;
  readonly installability: Exclude<MarketplaceInstallability, 'browse-only'>;
  readonly compatibility: MarketplaceCompatibility;
  readonly riskSignals: readonly MarketplaceRiskSignal[];
}
/** Counts are calculated before the installability segment is applied. */
interface MarketplaceListCounts {
  readonly all: number;
  readonly oneClick: number;
  readonly manual: number;
}
/** One bounded catalog page and the freshness facts that qualify it. */
interface MarketplaceListResponse {
  readonly digest: string;
  readonly catalogStatus: MarketplaceCatalogView['status'];
  readonly source: MarketplaceCatalogView['source'];
  readonly stale: boolean;
  readonly generatedAt: string | null;
  readonly lastSuccessfulFetchAt: string | null;
  readonly total: number;
  readonly counts: MarketplaceListCounts;
  readonly page: number;
  readonly pageCount: number;
  readonly items: readonly MarketplacePluginSummary[];
  readonly error: MarketplaceCatalogError | null;
}
/** Host-qualified package-manager and profile-write capabilities. */
interface MarketplaceOperationCapabilities {
  readonly packageManager: 'pnpm' | 'corepack-pnpm' | 'unavailable';
  readonly profileWritable: boolean;
  readonly profileName: string;
  readonly message: string | null;
}
/** First-load result: one page plus all current-profile operation truth. */
interface MarketplaceBootstrapResponse {
  readonly list: MarketplaceListResponse;
  readonly capabilities: MarketplaceOperationCapabilities;
  readonly operations: MarketplaceOperationSnapshot;
}
/** A refresh avoids retransmitting page rows when the catalog digest is unchanged. */
interface MarketplaceRefreshResponse {
  readonly changed: boolean;
  readonly list: MarketplaceListResponse | null;
  readonly source: MarketplaceCatalogView['source'];
  readonly stale: boolean;
  readonly lastSuccessfulFetchAt: string | null;
  readonly error: MarketplaceCatalogError | null;
}
/** Full scanner evidence and current-profile state requested for one detail view. */
interface MarketplacePluginDetailResponse {
  readonly entry: MarketplaceCatalogEntry | null;
  readonly state: MarketplaceProfilePluginState | null;
}
/** Opaque, short-lived identifier for one reviewed profile operation. */
type MarketplacePlanId = string & {
  readonly __marketplacePlanId: unique symbol;
};
/** Current-profile state of one catalog package. */
interface MarketplaceProfilePluginState {
  readonly repositoryId: string;
  readonly packageName: string | null;
  readonly state: 'not-installed' | 'active' | 'pending-install' | 'pending-update' | 'pending-removal' | 'installed-inactive';
  readonly installedVersion: string | null;
  readonly installedSpec: string | null;
  readonly catalogSpec: string;
  readonly updateAvailable: boolean;
}
/** Sparse snapshot of installed or restart-pending catalog packages in the active Web profile. */
interface MarketplaceOperationSnapshot {
  readonly profileName: string;
  readonly busy: boolean;
  readonly capabilities: MarketplaceOperationCapabilities;
  readonly plugins: readonly MarketplaceProfilePluginState[];
}
/** User-selected operation before Host-side qualification. */
interface MarketplacePlanRequest {
  readonly repositoryId: string;
  readonly action: 'install' | 'remove';
}
/** Stable reason that blocks a requested operation before any profile write. */
type MarketplacePlanBlockCode = 'catalog-entry-missing' | 'not-one-click-eligible' | 'package-metadata-missing' | 'already-installed' | 'not-installed' | 'restart-required' | 'package-manager-unavailable' | 'profile-not-writable';
/** Warning disclosed before the user confirms code installation or removal. */
type MarketplacePlanWarning = 'compatibility-unknown' | 'git-source' | 'code-executes-on-restart' | 'install-scripts-disabled' | 'restart-required';
/** Exact, expiring operation review produced from the current catalog and profile state. */
interface MarketplaceOperationPlan {
  readonly status: 'ready' | 'blocked';
  readonly planId: MarketplacePlanId | null;
  readonly blockCode: MarketplacePlanBlockCode | null;
  readonly action: 'install' | 'update' | 'remove' | null;
  readonly profileName: string;
  readonly repositoryId: string;
  readonly packageName: string | null;
  readonly packageVersion: string | null;
  readonly sourceRef: string | null;
  readonly commitSha: string | null;
  readonly warnings: readonly MarketplacePlanWarning[];
  readonly expiresAt: string | null;
}
/** Execute one previously reviewed operation exactly once. */
interface MarketplaceExecuteRequest {
  readonly planId: MarketplacePlanId;
}
/** Stable result code for a committed, rejected, or recovered profile operation. */
type MarketplaceOperationCode = 'succeeded' | 'operation-busy' | 'plan-expired' | 'plan-invalid' | 'profile-state-changed' | 'pnpm-unavailable' | 'pnpm-failed' | 'installed-package-invalid' | 'rollback-failed' | 'service-disposed';
/** Result of one profile operation, including recovery and the authoritative next snapshot. */
interface MarketplaceOperationResult {
  readonly status: 'succeeded' | 'failed';
  readonly code: MarketplaceOperationCode;
  readonly action: 'install' | 'update' | 'remove' | null;
  readonly profileName: string;
  readonly packageName: string | null;
  readonly requiresRestart: boolean;
  readonly rollback: 'not-needed' | 'succeeded' | 'failed';
  readonly snapshot: MarketplaceOperationSnapshot;
}
//#endregion
export { MarketplaceBootstrapResponse, MarketplaceCatalogEntry, MarketplaceCatalogError, MarketplaceCatalogErrorCode, MarketplaceCatalogIntegrity, MarketplaceCatalogSnapshot, MarketplaceCatalogSummary, MarketplaceCatalogView, MarketplaceCompatibility, MarketplaceExecuteRequest, MarketplaceInstallability, MarketplaceInstallabilityFilter, MarketplaceListCounts, MarketplaceListRequest, MarketplaceListResponse, MarketplaceOperationCapabilities, MarketplaceOperationCode, MarketplaceOperationPlan, MarketplaceOperationResult, MarketplaceOperationSnapshot, MarketplacePlanBlockCode, MarketplacePlanId, MarketplacePlanRequest, MarketplacePlanWarning, MarketplacePluginDetailResponse, MarketplacePluginSummary, MarketplaceProfilePluginState, MarketplaceRefreshResponse, MarketplaceRiskSignal, MarketplaceSort, MarketplaceValidationCode, MarketplaceValidationStatus };
//# sourceMappingURL=types.d.mts.map