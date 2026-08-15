import { MarketplaceBootstrapResponse, MarketplaceCatalogEntry, MarketplaceCatalogError, MarketplaceCatalogErrorCode, MarketplaceCatalogIntegrity, MarketplaceCatalogRelation, MarketplaceCatalogSnapshot, MarketplaceCatalogSummary, MarketplaceCatalogView, MarketplaceCategory, MarketplaceCategoryFilter, MarketplaceCompatibility, MarketplaceExecuteRequest, MarketplaceExternalPlugin, MarketplaceInstallability, MarketplaceInstallabilityFilter, MarketplaceInstalledListItem, MarketplaceInstalledResponse, MarketplaceListCounts, MarketplaceListRequest, MarketplaceListResponse, MarketplaceOperationCapabilities, MarketplaceOperationCode, MarketplaceOperationPlan, MarketplaceOperationResult, MarketplaceOperationSnapshot, MarketplacePlanBlockCode, MarketplacePlanId, MarketplacePlanRequest, MarketplacePlanWarning, MarketplacePluginDetailResponse, MarketplacePluginSummary, MarketplaceProfilePluginState, MarketplaceRefreshResponse, MarketplaceRiskSignal, MarketplaceSort, MarketplaceValidationCode, MarketplaceValidationStatus } from "./types.mjs";
import { MarketplaceCatalogParseError, computeMarketplaceCatalogDigest, parseMarketplaceCatalogText, sealMarketplaceCatalog } from "./catalog.mjs";
import z from "@deepseek-ai/schemastery";
import { Context } from "@deepseek-ai/cordis";
//#region src/index.d.ts
declare const name = "plugin-marketplace";
declare const inject: string[];
interface Config {
  readonly catalogUrl: string;
  readonly maxAgeMs: number;
  readonly timeoutMs: number;
  readonly maxBytes: number;
}
declare const Config: z<Config>;
/** Mount the external bundle against public Host services only. */
declare function apply(ctx: Context, config: Config): Promise<void>;
//#endregion
export { Config, type MarketplaceBootstrapResponse, type MarketplaceCatalogEntry, type MarketplaceCatalogError, type MarketplaceCatalogErrorCode, type MarketplaceCatalogIntegrity, MarketplaceCatalogParseError, type MarketplaceCatalogRelation, type MarketplaceCatalogSnapshot, type MarketplaceCatalogSummary, type MarketplaceCatalogView, type MarketplaceCategory, type MarketplaceCategoryFilter, type MarketplaceCompatibility, type MarketplaceExecuteRequest, type MarketplaceExternalPlugin, type MarketplaceInstallability, type MarketplaceInstallabilityFilter, type MarketplaceInstalledListItem, type MarketplaceInstalledResponse, type MarketplaceListCounts, type MarketplaceListRequest, type MarketplaceListResponse, type MarketplaceOperationCapabilities, type MarketplaceOperationCode, type MarketplaceOperationPlan, type MarketplaceOperationResult, type MarketplaceOperationSnapshot, type MarketplacePlanBlockCode, type MarketplacePlanId, type MarketplacePlanRequest, type MarketplacePlanWarning, type MarketplacePluginDetailResponse, type MarketplacePluginSummary, type MarketplaceProfilePluginState, type MarketplaceRefreshResponse, type MarketplaceRiskSignal, type MarketplaceSort, type MarketplaceValidationCode, type MarketplaceValidationStatus, apply, computeMarketplaceCatalogDigest, inject, name, parseMarketplaceCatalogText, sealMarketplaceCatalog };
//# sourceMappingURL=index.d.mts.map