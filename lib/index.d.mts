import { MarketplaceCatalogEntry, MarketplaceCatalogError, MarketplaceCatalogErrorCode, MarketplaceCatalogIntegrity, MarketplaceCatalogSnapshot, MarketplaceCatalogSummary, MarketplaceCatalogView, MarketplaceCompatibility, MarketplaceExecuteRequest, MarketplaceInstallability, MarketplaceOperationCode, MarketplaceOperationPlan, MarketplaceOperationResult, MarketplaceOperationSnapshot, MarketplacePlanBlockCode, MarketplacePlanId, MarketplacePlanRequest, MarketplacePlanWarning, MarketplaceProfilePluginState, MarketplaceRiskSignal, MarketplaceValidationCode, MarketplaceValidationStatus } from "./types.mjs";
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
export { Config, type MarketplaceCatalogEntry, type MarketplaceCatalogError, type MarketplaceCatalogErrorCode, type MarketplaceCatalogIntegrity, MarketplaceCatalogParseError, type MarketplaceCatalogSnapshot, type MarketplaceCatalogSummary, type MarketplaceCatalogView, type MarketplaceCompatibility, type MarketplaceExecuteRequest, type MarketplaceInstallability, type MarketplaceOperationCode, type MarketplaceOperationPlan, type MarketplaceOperationResult, type MarketplaceOperationSnapshot, type MarketplacePlanBlockCode, type MarketplacePlanId, type MarketplacePlanRequest, type MarketplacePlanWarning, type MarketplaceProfilePluginState, type MarketplaceRiskSignal, type MarketplaceValidationCode, type MarketplaceValidationStatus, apply, computeMarketplaceCatalogDigest, inject, name, parseMarketplaceCatalogText, sealMarketplaceCatalog };
//# sourceMappingURL=index.d.mts.map