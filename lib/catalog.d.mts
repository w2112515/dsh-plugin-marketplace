import { MarketplaceCatalogSnapshot } from "./types.mjs";
//#region src/catalog.d.ts
/** Stable catalog validation error suitable for mapping to a public error code. */
declare class MarketplaceCatalogParseError extends Error {
  constructor(message: string);
}
/**
 * Compute the v1 logical digest with the digest field blanked.
 * @param catalog - Complete catalog payload whose logical content is hashed.
 * @returns Lowercase SHA-256 digest over canonical JSON.
 */
declare function computeMarketplaceCatalogDigest(catalog: MarketplaceCatalogSnapshot): string;
/**
 * Fill a catalog's integrity digest without mutating the caller's value.
 * @param catalog - Catalog payload whose integrity field should be sealed.
 * @returns Copy carrying the computed logical SHA-256 digest.
 */
declare function sealMarketplaceCatalog(catalog: MarketplaceCatalogSnapshot): MarketplaceCatalogSnapshot;
/**
 * Parse, strictly validate, and verify a complete catalog publication.
 * The integrity digest is verified over the exact wire payload; newer optional
 * fields (packs, installScripts) are normalized onto the result afterwards so
 * older cached catalogs keep parsing and verifying.
 * @param text - UTF-8 JSON text downloaded from the publication or cache.
 * @returns Strictly validated catalog with a verified logical digest.
 */
declare function parseMarketplaceCatalogText(text: string): MarketplaceCatalogSnapshot;
//#endregion
export { MarketplaceCatalogParseError, computeMarketplaceCatalogDigest, parseMarketplaceCatalogText, sealMarketplaceCatalog };
//# sourceMappingURL=catalog.d.mts.map