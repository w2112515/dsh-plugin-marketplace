import { MarketplaceBootstrapResponse, MarketplaceCatalogEntry, MarketplaceCatalogError, MarketplaceCatalogErrorCode, MarketplaceCatalogIntegrity, MarketplaceCatalogRelation, MarketplaceCatalogSnapshot, MarketplaceCatalogSummary, MarketplaceCatalogView, MarketplaceCategory, MarketplaceCategoryFilter, MarketplaceCompatibility, MarketplaceEntryRating, MarketplaceExecuteRequest, MarketplaceExternalPlugin, MarketplaceInstallability, MarketplaceInstallabilityFilter, MarketplaceInstalledListItem, MarketplaceInstalledResponse, MarketplaceListCounts, MarketplaceListRequest, MarketplaceListResponse, MarketplaceOperationCapabilities, MarketplaceOperationCode, MarketplaceOperationPlan, MarketplaceOperationResult, MarketplaceOperationSnapshot, MarketplacePackComposition, MarketplacePackDetailResponse, MarketplacePackEntry, MarketplacePackItem, MarketplacePackItemStatus, MarketplacePackItemView, MarketplacePackListResponse, MarketplacePackSummary, MarketplacePackValidationCode, MarketplacePlanBlockCode, MarketplacePlanId, MarketplacePlanRequest, MarketplacePlanWarning, MarketplacePluginDetailResponse, MarketplacePluginSummary, MarketplaceProfilePluginState, MarketplaceRatingCounts, MarketplaceRefreshResponse, MarketplaceRiskSignal, MarketplaceSort, MarketplaceValidationCode, MarketplaceValidationStatus } from "./types.mjs";
import { MarketplaceCatalogParseError, computeMarketplaceCatalogDigest, parseMarketplaceCatalogText, sealMarketplaceCatalog } from "./catalog.mjs";
import z from "@deepseek-ai/schemastery";
import { Context } from "@deepseek-ai/cordis";
//#region src/index.d.ts
declare const DEFAULT_MARKETPLACE_CATALOG_URL = "https://w2112515.github.io/dsh-plugin-marketplace/plugin-marketplace/catalog-v1.json";
declare const name = "plugin-marketplace";
/** Catalog API mounts on webServer alone. Agent tools wait for tools + systemPrompt. */
declare const inject: string[];
interface Config {
  readonly catalogUrl: string;
  readonly maxAgeMs: number;
  readonly timeoutMs: number;
  readonly maxBytes: number;
  /** Register the agent-facing marketplace tools (search/detail/install/manual-guide). */
  readonly agentTools: boolean;
}
declare const Config: z<Config>;
/** Mount the external bundle against public Host services only. */
declare function apply(ctx: Context, config: Config): Promise<void>;
//#endregion
export { Config, DEFAULT_MARKETPLACE_CATALOG_URL, type MarketplaceBootstrapResponse, type MarketplaceCatalogEntry, type MarketplaceCatalogError, type MarketplaceCatalogErrorCode, type MarketplaceCatalogIntegrity, MarketplaceCatalogParseError, type MarketplaceCatalogRelation, type MarketplaceCatalogSnapshot, type MarketplaceCatalogSummary, type MarketplaceCatalogView, type MarketplaceCategory, type MarketplaceCategoryFilter, type MarketplaceCompatibility, type MarketplaceEntryRating, type MarketplaceExecuteRequest, type MarketplaceExternalPlugin, type MarketplaceInstallability, type MarketplaceInstallabilityFilter, type MarketplaceInstalledListItem, type MarketplaceInstalledResponse, type MarketplaceListCounts, type MarketplaceListRequest, type MarketplaceListResponse, type MarketplaceOperationCapabilities, type MarketplaceOperationCode, type MarketplaceOperationPlan, type MarketplaceOperationResult, type MarketplaceOperationSnapshot, type MarketplacePackComposition, type MarketplacePackDetailResponse, type MarketplacePackEntry, type MarketplacePackItem, type MarketplacePackItemStatus, type MarketplacePackItemView, type MarketplacePackListResponse, type MarketplacePackSummary, type MarketplacePackValidationCode, type MarketplacePlanBlockCode, type MarketplacePlanId, type MarketplacePlanRequest, type MarketplacePlanWarning, type MarketplacePluginDetailResponse, type MarketplacePluginSummary, type MarketplaceProfilePluginState, type MarketplaceRatingCounts, type MarketplaceRefreshResponse, type MarketplaceRiskSignal, type MarketplaceSort, type MarketplaceValidationCode, type MarketplaceValidationStatus, apply, computeMarketplaceCatalogDigest, inject, name, parseMarketplaceCatalogText, sealMarketplaceCatalog };
//# sourceMappingURL=index.d.mts.map