import { MarketplaceCatalogParseError, computeMarketplaceCatalogDigest, parseMarketplaceCatalogText, sealMarketplaceCatalog } from "./catalog.mjs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadOverlayPatches, loadProfile, readProfileManifest } from "@deepseek-ai/dsh-app-boot";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import z from "@deepseek-ai/schemastery";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { constants, readFileSync } from "node:fs";
import { execa } from "execa";
//#region src/atomic-write.ts
/** Zero-dependency atomic file replacement used for cache and profile rollback. */
async function writeFileAtomic(filename, content, options) {
	await mkdir(dirname(filename), {
		recursive: true,
		...options.dirMode === void 0 ? {} : { mode: options.dirMode }
	});
	const temp = `${filename}.${randomBytes(6).toString("hex")}.tmp`;
	try {
		await writeFile(temp, content, {
			mode: options.mode,
			flag: "wx"
		});
		await rename(temp, filename);
	} catch (error) {
		await rm(temp, { force: true });
		throw error;
	}
}
//#endregion
//#region src/catalog-client.ts
/** Network retrieval and last-known-good cache owner for the marketplace catalog. */
const CACHE_SCHEMA_VERSION = 1;
var CatalogClientFailure = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "CatalogClientFailure";
	}
};
function isRecord$2(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseCacheRecord(text, sourceUrl) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new CatalogClientFailure("cache-invalid", "The saved marketplace catalog is invalid.");
	}
	if (!isRecord$2(value) || value.schemaVersion !== CACHE_SCHEMA_VERSION || value.sourceUrl !== sourceUrl || typeof value.fetchedAt !== "string" || !(typeof value.etag === "string" || value.etag === null) || !isRecord$2(value.catalog)) throw new CatalogClientFailure("cache-invalid", "The saved marketplace catalog is invalid.");
	let catalog;
	try {
		catalog = parseMarketplaceCatalogText(JSON.stringify(value.catalog));
	} catch {
		throw new CatalogClientFailure("cache-invalid", "The saved marketplace catalog is invalid.");
	}
	return {
		schemaVersion: CACHE_SCHEMA_VERSION,
		sourceUrl,
		fetchedAt: value.fetchedAt,
		etag: value.etag,
		catalog
	};
}
function serializeCacheRecord(record) {
	return `${JSON.stringify(record)}\n`;
}
async function readBoundedText(response, maxBytes) {
	const declared = response.headers.get("content-length");
	if (declared !== null && Number(declared) > maxBytes) throw new CatalogClientFailure("payload-too-large", "The marketplace catalog is larger than the configured limit.");
	if (response.body === null) return "";
	const reader = response.body.getReader();
	const chunks = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > maxBytes) {
				await reader.cancel();
				throw new CatalogClientFailure("payload-too-large", "The marketplace catalog is larger than the configured limit.");
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const content = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		content.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(content);
	} catch {
		throw new CatalogClientFailure("catalog-invalid", "The marketplace catalog is not valid UTF-8.");
	}
}
function publicError(error) {
	if (error instanceof CatalogClientFailure) return {
		code: error.code,
		message: error.message
	};
	return {
		code: "network-error",
		message: "The marketplace catalog could not be refreshed."
	};
}
/** Single lifecycle owner for cache loading, conditional refresh, and disposal. */
var MarketplaceCatalogClient = class {
	options;
	fetchImpl;
	now;
	closeController = new AbortController();
	catalog = null;
	source = "none";
	fetchedAt = null;
	etag = null;
	error = null;
	refreshPromise = null;
	disposed = false;
	constructor(options) {
		this.options = options;
		this.fetchImpl = options.fetchImpl ?? fetch;
		this.now = options.now ?? (() => /* @__PURE__ */ new Date());
	}
	/** Load only a valid cache record; network I/O remains an explicit refresh. */
	async initialize() {
		try {
			const record = parseCacheRecord(await readFile(this.options.cachePath, "utf8"), this.options.sourceUrl);
			this.catalog = record.catalog;
			this.source = "cache";
			this.fetchedAt = record.fetchedAt;
			this.etag = record.etag;
			this.error = null;
		} catch (error) {
			if (error?.code === "ENOENT") return;
			this.error = publicError(error instanceof CatalogClientFailure ? error : new CatalogClientFailure("cache-invalid", "The saved marketplace catalog could not be read."));
		}
	}
	/**
	* Current projection; staleness is recomputed so a long-running Host does not freeze time.
	* @returns Current last-known-good catalog and freshness metadata.
	*/
	view() {
		const stale = this.catalog === null ? false : this.now().getTime() - Date.parse(this.catalog.generatedAt) > this.options.maxAgeMs;
		return {
			status: this.catalog === null ? "unavailable" : this.catalog.entries.length === 0 ? "empty" : "ready",
			source: this.source,
			sourceUrl: this.options.sourceUrl,
			lastSuccessfulFetchAt: this.fetchedAt,
			stale,
			catalog: this.catalog,
			error: this.error
		};
	}
	/**
	* Run at most one conditional refresh and preserve the old catalog on every failure.
	* @returns Shared refresh result projected through the last-known-good state.
	*/
	refresh() {
		if (this.refreshPromise !== null) return this.refreshPromise;
		if (this.disposed) {
			this.error = {
				code: "service-disposed",
				message: "The marketplace catalog service is stopping."
			};
			return Promise.resolve(this.view());
		}
		const pending = this.refreshOnce().finally(() => {
			if (this.refreshPromise === pending) this.refreshPromise = null;
		});
		this.refreshPromise = pending;
		return pending;
	}
	async refreshOnce() {
		try {
			if (this.options.sourceUrl.trim().length === 0) throw new CatalogClientFailure("catalog-url-unconfigured", "The marketplace catalog URL is not configured.");
			const timeout = AbortSignal.timeout(this.options.timeoutMs);
			const headers = {
				accept: "application/json",
				"user-agent": "deepseek-harness-plugin-marketplace"
			};
			if (this.etag !== null) headers["if-none-match"] = this.etag;
			const response = await this.fetchImpl(this.options.sourceUrl, {
				headers,
				signal: AbortSignal.any([timeout, this.closeController.signal])
			});
			const fetchedAt = this.now().toISOString();
			if (response.status === 304) {
				if (this.catalog === null) throw new CatalogClientFailure("catalog-invalid", "The catalog server returned not-modified without a saved catalog.");
				await this.commit({
					schemaVersion: CACHE_SCHEMA_VERSION,
					sourceUrl: this.options.sourceUrl,
					fetchedAt,
					etag: this.etag,
					catalog: this.catalog
				});
				this.source = "network";
				this.fetchedAt = fetchedAt;
				this.error = null;
				return this.view();
			}
			if (!response.ok) throw new CatalogClientFailure("http-error", `The marketplace catalog server returned HTTP ${String(response.status)}.`);
			let catalog;
			try {
				catalog = parseMarketplaceCatalogText(await readBoundedText(response, this.options.maxBytes));
			} catch (error) {
				if (error instanceof CatalogClientFailure) throw error;
				throw new CatalogClientFailure("catalog-invalid", "The downloaded marketplace catalog is invalid.");
			}
			const nextEtag = response.headers.get("etag");
			await this.commit({
				schemaVersion: CACHE_SCHEMA_VERSION,
				sourceUrl: this.options.sourceUrl,
				fetchedAt,
				etag: nextEtag,
				catalog
			});
			this.catalog = catalog;
			this.source = "network";
			this.fetchedAt = fetchedAt;
			this.etag = nextEtag;
			this.error = null;
		} catch (error) {
			this.error = publicError(error);
		}
		return this.view();
	}
	async commit(record) {
		try {
			await writeFileAtomic(this.options.cachePath, serializeCacheRecord(record), {
				mode: 384,
				dirMode: 448
			});
		} catch {
			throw new CatalogClientFailure("cache-write-failed", "The refreshed marketplace catalog could not be saved.");
		}
	}
	/** Stop admission, abort I/O, and wait until the current refresh reaches quiescence. */
	async close() {
		this.disposed = true;
		this.closeController.abort();
		await this.refreshPromise;
	}
};
const ACTIVE_WINDOW_MS = 15552e6;
/** Fixed taxonomy priority: the first matching category wins, one chip per row. */
const MARKETPLACE_CATEGORY_PRIORITY = [
	"theme",
	"memory",
	"ui",
	"tool"
];
/**
* Conservative fallback tokens matched against whole words from topics, keywords,
* and repository/package names. Anything unmatched stays honestly uncategorized.
*/
const CATEGORY_TOKENS = {
	theme: [
		"theme",
		"themes",
		"skin",
		"skins",
		"color-scheme",
		"colour-scheme",
		"appearance"
	],
	memory: [
		"memory",
		"memories",
		"rag",
		"embedding",
		"embeddings",
		"vector",
		"vectors",
		"knowledge",
		"recall"
	],
	ui: [
		"ui",
		"tui",
		"gui",
		"webui",
		"sidebar",
		"dashboard",
		"panel",
		"interface",
		"layout"
	],
	tool: [
		"tool",
		"tools",
		"mcp",
		"ocr",
		"vision",
		"terminal",
		"cli",
		"automation",
		"notify",
		"notification"
	]
};
const CATEGORY_DECLARATION = /^dsh-category-([a-z-]+)$/u;
/**
* Derive one category from facts already in the catalog entry. An explicit
* `dsh-category-<slug>` topic wins; otherwise whole-word fallback tokens decide.
* @param entry - Admitted catalog entry.
* @returns The derived category, or null when nothing matches honestly.
*/
function deriveMarketplaceCategory(entry) {
	for (const topic of entry.topics) {
		const slug = CATEGORY_DECLARATION.exec(topic)?.[1];
		if (slug !== void 0 && MARKETPLACE_CATEGORY_PRIORITY.includes(slug)) return slug;
	}
	const tokens = /* @__PURE__ */ new Set();
	const collect = (value) => {
		for (const token of value.toLocaleLowerCase().split(/[^a-z0-9]+/u)) if (token.length > 0) tokens.add(token);
	};
	for (const topic of entry.topics) collect(topic);
	for (const keyword of entry.keywords) collect(keyword);
	collect(entry.package.name ?? "");
	collect(entry.repository.fullName);
	for (const category of MARKETPLACE_CATEGORY_PRIORITY) if (CATEGORY_TOKENS[category].some((token) => tokens.has(token))) return category;
	return null;
}
/** Conservative admission defense for stale catalogs created before scanner filtering. */
function isPublicMarketplaceEntry(entry) {
	return entry.validation.status === "valid" && !entry.repository.archived && (entry.installability === "one-click-eligible" || entry.installability === "manual");
}
function summary(entry) {
	const separator = entry.repository.fullName.indexOf("/");
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
		installability: entry.installability,
		compatibility: entry.compatibility,
		riskSignals: entry.riskSignals
	};
}
function normalizedWords(query) {
	return query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
}
function relevance(entry, words) {
	if (words.length === 0) return 0;
	const publisher = entry.repository.fullName.split("/")[0] ?? "";
	const fields = [
		[entry.package.name ?? "", 10],
		[entry.repository.fullName, 8],
		[publisher, 6],
		[entry.package.description ?? "", 4],
		[entry.topics.join(" "), 2],
		[entry.keywords.join(" "), 2]
	];
	let score = 0;
	for (const word of words) {
		let matched = false;
		for (const [field, weight] of fields) {
			const normalized = field.toLocaleLowerCase();
			if (normalized === word) {
				score += weight * 2;
				matched = true;
			} else if (normalized.includes(word)) {
				score += weight;
				matched = true;
			}
		}
		if (!matched) return -1;
	}
	return score;
}
function compareText(left, right) {
	return left.localeCompare(right, "en");
}
function compareRecommended(left, right, generatedAt) {
	const installability = Number(right.installability === "one-click-eligible") - Number(left.installability === "one-click-eligible");
	if (installability !== 0) return installability;
	const cutoff = Date.parse(generatedAt) - ACTIVE_WINDOW_MS;
	const activity = Number(Date.parse(right.lastCodePushAt) >= cutoff) - Number(Date.parse(left.lastCodePushAt) >= cutoff);
	if (activity !== 0) return activity;
	if (right.stars !== left.stars) return right.stars - left.stars;
	const pushed = Date.parse(right.lastCodePushAt) - Date.parse(left.lastCodePushAt);
	if (pushed !== 0) return pushed;
	return compareText(left.repository.fullName, right.repository.fullName);
}
function compareRanked(left, right, request, generatedAt) {
	if (left.relevance !== right.relevance) return right.relevance - left.relevance;
	switch (request.sort) {
		case "stars": return right.entry.stars - left.entry.stars || compareRecommended(left.entry, right.entry, generatedAt);
		case "recently-updated": return Date.parse(right.entry.lastCodePushAt) - Date.parse(left.entry.lastCodePushAt) || compareRecommended(left.entry, right.entry, generatedAt);
		case "recently-added": return Date.parse(right.entry.firstSeenAt) - Date.parse(left.entry.firstSeenAt) || compareRecommended(left.entry, right.entry, generatedAt);
		case "recommended": return compareRecommended(left.entry, right.entry, generatedAt);
	}
}
/** Query one catalog view without leaking the full scanner payload to the browser. */
function queryMarketplaceCatalog(view, request) {
	const admitted = view.catalog?.entries.filter(isPublicMarketplaceEntry) ?? [];
	const categorized = admitted.map((entry) => ({
		entry,
		category: deriveMarketplaceCategory(entry)
	}));
	const counts = {
		all: admitted.length,
		oneClick: admitted.filter((entry) => entry.installability === "one-click-eligible").length,
		manual: admitted.filter((entry) => entry.installability === "manual").length,
		categories: {
			theme: categorized.filter((item) => item.category === "theme").length,
			memory: categorized.filter((item) => item.category === "memory").length,
			ui: categorized.filter((item) => item.category === "ui").length,
			tool: categorized.filter((item) => item.category === "tool").length
		},
		uncategorized: categorized.filter((item) => item.category === null).length
	};
	const words = normalizedWords(request.query);
	const selected = categorized.filter((item) => request.category === "all" || (request.category === "uncategorized" ? item.category === null : item.category === request.category)).filter((item) => request.installability === "all" || item.entry.installability === request.installability).map((item) => ({
		entry: item.entry,
		relevance: relevance(item.entry, words)
	})).filter((item) => item.relevance >= 0).sort((left, right) => compareRanked(left, right, request, view.catalog?.generatedAt ?? "1970-01-01T00:00:00.000Z"));
	const pageCount = selected.length === 0 ? 0 : Math.ceil(selected.length / 50);
	const page = pageCount === 0 ? 1 : Math.min(request.page, pageCount);
	const offset = (page - 1) * 50;
	return {
		digest: view.catalog?.integrity.digest ?? "",
		catalogStatus: view.catalog === null ? view.status : admitted.length === 0 ? "empty" : "ready",
		source: view.source,
		stale: view.stale,
		generatedAt: view.catalog?.generatedAt ?? null,
		lastSuccessfulFetchAt: view.lastSuccessfulFetchAt,
		total: selected.length,
		counts,
		page,
		pageCount,
		items: selected.slice(offset, offset + 50).map((item) => summary(item.entry)),
		error: view.error
	};
}
/** Return full evidence only for an admitted entry and attach sparse profile state. */
function detailMarketplaceEntry(view, repositoryId, states) {
	const entry = view.catalog?.entries.find((candidate) => candidate.repositoryId === repositoryId && isPublicMarketplaceEntry(candidate)) ?? null;
	return {
		entry,
		state: entry === null ? null : states.find((candidate) => candidate.repositoryId === repositoryId) ?? null
	};
}
/** Join the current-profile operation snapshot with admitted catalog summaries in one call. */
function installedMarketplacePlugins(view, snapshot) {
	const summaries = /* @__PURE__ */ new Map();
	for (const entry of view.catalog?.entries.filter(isPublicMarketplaceEntry) ?? []) summaries.set(entry.repositoryId, summary(entry));
	return {
		profileName: snapshot.profileName,
		busy: snapshot.busy,
		capabilities: snapshot.capabilities,
		items: snapshot.plugins.map((state) => ({
			state,
			plugin: summaries.get(state.repositoryId) ?? null
		})),
		external: snapshot.external
	};
}
//#endregion
//#region src/profile-operations.ts
/** Transactional current-profile operations for reviewed marketplace entries. */
const PLAN_TTL_MS = 3e5;
const MAX_PROCESS_OUTPUT_BYTES = 1e6;
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function sanitizedEnvironment() {
	return Object.fromEntries(Object.entries(process.env).flatMap(([name, value]) => {
		if (value === void 0 || /KEY|SECRET|TOKEN|PASSWORD/i.test(name)) return [];
		return [[name, value]];
	}));
}
async function runPnpm(args, cwd, signal) {
	return runPackageManager("pnpm", args, cwd, signal);
}
async function runPackageManager(manager, args, cwd, signal) {
	if (manager === "unavailable") return {
		exitCode: 1,
		unavailable: true
	};
	const command = manager === "pnpm" ? "pnpm" : "corepack";
	const commandArgs = manager === "pnpm" ? args : ["pnpm", ...args];
	try {
		return {
			exitCode: (await execa(command, commandArgs, {
				cwd,
				env: sanitizedEnvironment(),
				reject: false,
				cancelSignal: signal,
				forceKillAfterDelay: 5e3,
				maxBuffer: MAX_PROCESS_OUTPUT_BYTES
			})).exitCode ?? 1,
			unavailable: false
		};
	} catch (error) {
		return {
			exitCode: 1,
			unavailable: error?.code === "ENOENT"
		};
	}
}
async function probePackageManager(command, args, cwd) {
	try {
		return (await execa(command, args, {
			cwd,
			env: sanitizedEnvironment(),
			reject: false,
			timeout: 1e4,
			maxBuffer: MAX_PROCESS_OUTPUT_BYTES
		})).exitCode === 0;
	} catch {
		return false;
	}
}
/** Preflight the exact current-profile authority before exposing an install action. */
async function detectMarketplaceOperationCapabilities(runtime, probe = probePackageManager, checkWritable = access) {
	let profileWritable = true;
	try {
		await Promise.all([
			checkWritable(runtime.dir, constants.W_OK),
			checkWritable(join(runtime.dir, "package.json"), constants.W_OK),
			checkWritable(join(runtime.dir, "pnpm-workspace.yaml"), constants.W_OK)
		]);
	} catch {
		profileWritable = false;
	}
	const packageManager = await probe("pnpm", ["--version"], runtime.dir) ? "pnpm" : await probe("corepack", ["pnpm", "--version"], runtime.dir) ? "corepack-pnpm" : "unavailable";
	const message = !profileWritable ? "The current DSH profile is not writable." : packageManager === "unavailable" ? "Neither pnpm nor Corepack pnpm is available. Install pnpm 11 or enable Corepack, then restart DSH." : null;
	return {
		packageManager,
		profileWritable,
		profileName: runtime.profileName,
		message
	};
}
async function backup(path) {
	try {
		return {
			path,
			content: await readFile(path, "utf8")
		};
	} catch (error) {
		if (error?.code === "ENOENT") return {
			path,
			content: null
		};
		throw error;
	}
}
async function restore(backups) {
	for (const file of backups) if (file.content === null) await rm(file.path, { force: true });
	else await writeFileAtomic(file.path, file.content, {
		mode: 384,
		dirMode: 448
	});
}
function packageDir(profileDir, packageName) {
	return join(profileDir, "node_modules", ...packageName.split("/"));
}
function installedVersion(profileDir, packageName) {
	try {
		const value = JSON.parse(requireText(join(packageDir(profileDir, packageName), "package.json")));
		return isRecord$1(value) && typeof value.version === "string" ? value.version : null;
	} catch {
		return null;
	}
}
function requireText(path) {
	return readFileSync(path, "utf8");
}
function profileHome(profileDir) {
	return dirname(dirname(profileDir));
}
function manifestBundles(manifest) {
	return manifest.dsh?.profile?.bundles ?? [];
}
function pluginState(runtime, manifest, entry) {
	const packageName = entry.package.name;
	if (packageName === null) return {
		repositoryId: entry.repositoryId,
		packageName,
		state: "not-installed",
		installedVersion: null,
		installedSpec: null,
		catalogSpec: entry.source.ref,
		updateAvailable: false
	};
	const installedSpec = manifest.dependencies?.[packageName] ?? null;
	const launchSpec = runtime.dependenciesAtLaunch[packageName];
	const activeAtLaunch = runtime.bundlesAtLaunch.includes(packageName);
	const activeAfterRestart = manifestBundles(manifest).includes(packageName);
	let state;
	if (installedSpec === null) state = activeAtLaunch ? "pending-removal" : "not-installed";
	else if (!activeAfterRestart && activeAtLaunch) state = "pending-removal";
	else if (!activeAfterRestart) state = "installed-inactive";
	else if (!activeAtLaunch || launchSpec === void 0) state = "pending-install";
	else if (launchSpec !== installedSpec) state = "pending-update";
	else state = "active";
	return {
		repositoryId: entry.repositoryId,
		packageName,
		state,
		installedVersion: installedSpec === null ? null : installedVersion(runtime.dir, packageName),
		installedSpec,
		catalogSpec: entry.source.ref,
		updateAvailable: installedSpec !== null && installedSpec !== entry.source.ref
	};
}
function emptyPlan(request, profileName, blockCode, entry) {
	return {
		status: "blocked",
		planId: null,
		blockCode,
		action: null,
		profileName,
		repositoryId: request.repositoryId,
		packageName: entry?.package.name ?? null,
		packageVersion: entry?.package.version ?? null,
		sourceRef: entry?.source.ref ?? null,
		commitSha: entry?.repository.commitSha ?? null,
		warnings: [],
		expiresAt: null
	};
}
function isRestartPending(state) {
	return state === "pending-install" || state === "pending-update" || state === "pending-removal";
}
/** Parse the GitHub origin out of an installed spec in either supported notation. */
function installedOrigin(spec) {
	if (spec === null) return null;
	const match = /^github:([\w.-]+\/[\w.-]+?)(?:#([0-9a-f]{40}))?$/i.exec(spec) ?? /^git\+https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?(?:#([0-9a-f]{40}))?$/i.exec(spec);
	const fullName = match?.[1];
	if (fullName === void 0) return null;
	return {
		fullName: fullName.toLowerCase(),
		commitSha: match?.[2]?.toLowerCase() ?? null
	};
}
function marketplacePlanId(value) {
	return value;
}
function hasExactReviewedSource(entry) {
	const commitSha = entry.repository.commitSha;
	if (commitSha === null || !/^[0-9a-f]{40}$/.test(commitSha)) return false;
	return entry.source.ref === `git+https://github.com/${entry.repository.fullName}.git#${commitSha}`;
}
/** Owns one-at-a-time profile mutations and rollback for the running Web profile. */
var MarketplaceProfileOperations = class {
	options;
	plans = /* @__PURE__ */ new Map();
	runPnpm;
	now;
	busy = false;
	disposed = false;
	operation = null;
	abort = null;
	constructor(options) {
		this.options = options;
		this.runPnpm = options.runPnpm ?? ((args, cwd, signal) => options.capabilities.packageManager === "pnpm" ? runPnpm(args, cwd, signal) : runPackageManager(options.capabilities.packageManager, args, cwd, signal));
		this.now = options.now ?? Date.now;
	}
	/**
	* Return current installed/active state without starting a process.
	* @returns Current profile state projected over catalog entries, plus any
	*   profile packages the catalog does not describe.
	*/
	snapshot() {
		const catalog = this.options.catalog();
		const manifest = readProfileManifest("dsh marketplace", this.options.runtime.dir);
		const catalogPackageNames = new Set(catalog?.entries.flatMap((entry) => entry.package.name === null ? [] : [entry.package.name]) ?? []);
		const external = [.../* @__PURE__ */ new Set([...Object.keys(manifest.dependencies ?? {}), ...manifestBundles(manifest)])].filter((name) => !catalogPackageNames.has(name) && !name.startsWith("@deepseek-ai/")).sort((left, right) => left.localeCompare(right)).map((name) => ({
			packageName: name,
			installedSpec: manifest.dependencies?.[name] ?? null,
			activeAtLaunch: this.options.runtime.bundlesAtLaunch.includes(name),
			activeAfterRestart: manifestBundles(manifest).includes(name)
		}));
		const byPackage = /* @__PURE__ */ new Map();
		for (const entry of catalog?.entries ?? []) {
			const state = pluginState(this.options.runtime, manifest, entry);
			if (state.state === "not-installed") continue;
			const key = state.packageName ?? state.repositoryId;
			const origin = installedOrigin(state.installedSpec);
			const rank = origin !== null && origin.fullName === entry.repository.fullName.toLowerCase() ? origin.commitSha !== null && origin.commitSha === entry.repository.commitSha ? 2 : 1 : 0;
			const existing = byPackage.get(key);
			if (existing === void 0 || rank > existing.rank) byPackage.set(key, {
				state,
				rank
			});
		}
		return {
			profileName: this.options.runtime.profileName,
			busy: this.busy,
			capabilities: this.options.capabilities,
			plugins: [...byPackage.values()].map((item) => item.state),
			external
		};
	}
	/**
	* Qualify an exact install/update/remove request and retain it briefly for confirmation.
	* @param request - Catalog repository and requested operation.
	* @returns A short-lived exact plan or a blocked decision.
	*/
	plan(request) {
		const catalog = this.options.catalog();
		const entry = catalog?.entries.find((item) => item.repositoryId === request.repositoryId && isPublicMarketplaceEntry(item));
		if (catalog === null || entry === void 0) return emptyPlan(request, this.options.runtime.profileName, "catalog-entry-missing");
		if (this.options.capabilities.packageManager === "unavailable") return emptyPlan(request, this.options.runtime.profileName, "package-manager-unavailable", entry);
		if (!this.options.capabilities.profileWritable) return emptyPlan(request, this.options.runtime.profileName, "profile-not-writable", entry);
		const manifest = readProfileManifest("dsh marketplace", this.options.runtime.dir);
		const state = pluginState(this.options.runtime, manifest, entry);
		if (isRestartPending(state.state)) return emptyPlan(request, this.options.runtime.profileName, "restart-required", entry);
		let action;
		if (request.action === "remove") {
			if (state.installedSpec === null) return emptyPlan(request, this.options.runtime.profileName, "not-installed", entry);
			action = "remove";
		} else {
			if (entry.installability !== "one-click-eligible") return emptyPlan(request, this.options.runtime.profileName, "not-one-click-eligible", entry);
			if (entry.package.name === null || entry.package.version === null || !hasExactReviewedSource(entry)) return emptyPlan(request, this.options.runtime.profileName, "package-metadata-missing", entry);
			if (state.state === "active" && !state.updateAvailable) return emptyPlan(request, this.options.runtime.profileName, "already-installed", entry);
			action = state.installedSpec === null ? "install" : "update";
		}
		const warnings = ["code-executes-on-restart", "restart-required"];
		if (action !== "remove") {
			warnings.unshift("git-source", "install-scripts-disabled");
			if (entry.compatibility === "unknown") warnings.unshift("compatibility-unknown");
		}
		const planId = marketplacePlanId(randomUUID());
		const expiresAt = new Date(this.now() + PLAN_TTL_MS).toISOString();
		const plan = {
			status: "ready",
			planId,
			blockCode: null,
			action,
			profileName: this.options.runtime.profileName,
			repositoryId: entry.repositoryId,
			packageName: entry.package.name,
			packageVersion: entry.package.version,
			sourceRef: entry.source.ref,
			commitSha: entry.repository.commitSha,
			warnings,
			expiresAt
		};
		this.plans.set(planId, {
			plan,
			catalogDigest: catalog.integrity.digest,
			installedSpec: state.installedSpec
		});
		return plan;
	}
	/**
	* Execute one reviewed plan once; concurrent calls are rejected without side effects.
	* @param request - Host-issued plan identifier from the review step.
	* @returns Committed or rolled-back operation result.
	*/
	execute(request) {
		if (this.busy) return Promise.resolve(this.failure("operation-busy"));
		if (this.disposed) return Promise.resolve(this.failure("service-disposed"));
		const stored = this.plans.get(request.planId);
		this.plans.delete(request.planId);
		if (stored === void 0) return Promise.resolve(this.failure("plan-invalid"));
		if (Date.parse(stored.plan.expiresAt ?? "") <= this.now()) return Promise.resolve(this.failure("plan-expired"));
		const current = this.options.catalog();
		const entry = current?.entries.find((item) => item.repositoryId === stored.plan.repositoryId);
		const manifest = readProfileManifest("dsh marketplace", this.options.runtime.dir);
		const state = entry === void 0 ? void 0 : pluginState(this.options.runtime, manifest, entry);
		if (current?.integrity.digest !== stored.catalogDigest || state?.installedSpec !== stored.installedSpec) return Promise.resolve(this.failure("profile-state-changed", stored.plan));
		this.busy = true;
		this.abort = new AbortController();
		this.operation = this.run(stored, this.abort.signal).finally(() => {
			this.busy = false;
			this.abort = null;
			this.operation = null;
		});
		return this.operation;
	}
	/** Abort and drain an in-flight pnpm process before the owning Fiber leaves. */
	async close() {
		this.disposed = true;
		this.plans.clear();
		this.abort?.abort();
		await this.operation;
	}
	failure(code, plan, rollback = "not-needed") {
		return {
			status: "failed",
			code,
			action: plan?.action ?? null,
			profileName: this.options.runtime.profileName,
			packageName: plan?.packageName ?? null,
			requiresRestart: false,
			rollback,
			snapshot: this.snapshot()
		};
	}
	async run(stored, signal) {
		const { plan } = stored;
		const packageName = plan.packageName;
		if (packageName === null) return this.failure("plan-invalid", plan);
		const backups = await Promise.all([
			backup(join(this.options.runtime.dir, "package.json")),
			backup(join(this.options.runtime.dir, "pnpm-lock.yaml")),
			backup(join(this.options.runtime.dir, "pnpm-workspace.yaml"))
		]);
		const args = plan.action === "remove" ? ["remove", packageName] : [
			"add",
			"--ignore-scripts",
			"--save-exact",
			plan.sourceRef
		];
		const command = await this.runPnpm(args, this.options.runtime.dir, signal);
		if (this.disposed) {
			const rollback = await this.rollback(backups);
			return this.failure("service-disposed", plan, rollback);
		}
		if (command.exitCode !== 0) {
			const rollback = await this.rollback(backups);
			return this.failure(command.unavailable ? "pnpm-unavailable" : "pnpm-failed", plan, rollback);
		}
		try {
			const manifest = readProfileManifest("dsh marketplace", this.options.runtime.dir);
			const bundles = [...manifestBundles(manifest)];
			if (plan.action === "remove") manifest.dsh = {
				...manifest.dsh,
				profile: {
					...manifest.dsh?.profile,
					bundles: bundles.filter((name) => name !== packageName)
				}
			};
			else {
				await this.validateInstalledPackage(packageName, plan.packageVersion, plan.sourceRef);
				if (!bundles.includes(packageName)) bundles.push(packageName);
				manifest.dsh = {
					...manifest.dsh,
					profile: {
						...manifest.dsh?.profile,
						bundles
					}
				};
			}
			await writeFileAtomic(join(this.options.runtime.dir, "package.json"), `${JSON.stringify(manifest, void 0, 2)}\n`, {
				mode: 384,
				dirMode: 448
			});
			loadProfile("dsh marketplace", this.options.runtime.profileName, join(this.options.runtime.dir, "package.json"), profileHome(this.options.runtime.dir));
		} catch {
			const rollback = await this.rollback(backups);
			return this.failure(rollback === "failed" ? "rollback-failed" : "installed-package-invalid", plan, rollback);
		}
		return {
			status: "succeeded",
			code: "succeeded",
			action: plan.action,
			profileName: this.options.runtime.profileName,
			packageName,
			requiresRestart: true,
			rollback: "not-needed",
			snapshot: this.snapshot()
		};
	}
	async validateInstalledPackage(packageName, expectedVersion, sourceRef) {
		if (sourceRef === null || !/^git\+https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git#[0-9a-f]{40}$/i.test(sourceRef)) throw new TypeError("marketplace install source is not an immutable GitHub commit");
		const dir = packageDir(this.options.runtime.dir, packageName);
		const value = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
		if (!isRecord$1(value) || value.name !== packageName || value.version !== expectedVersion || !isRecord$1(value.dsh) || !isRecord$1(value.dsh.bundle) || typeof value.dsh.bundle.patch !== "string") throw new TypeError("installed package does not match the reviewed bundle metadata");
		const patchPath = resolve(dir, value.dsh.bundle.patch);
		const relativePath = relative(dir, patchPath);
		if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) throw new TypeError("installed bundle patch escapes the package");
		loadOverlayPatches("dsh marketplace", patchPath);
	}
	async rollback(backups) {
		try {
			await restore(backups);
			return (await this.runPnpm(["install", "--ignore-scripts"], this.options.runtime.dir, AbortSignal.timeout(12e4))).exitCode === 0 ? "succeeded" : "failed";
		} catch {
			return "failed";
		}
	}
};
//#endregion
//#region src/index.ts
const name = "plugin-marketplace";
const inject = ["webServer"];
const Config = z.object({
	catalogUrl: z.string().default(""),
	maxAgeMs: z.natural().min(1).default(1728e5),
	timeoutMs: z.natural().min(1).default(15e3),
	maxBytes: z.natural().min(1).default(5e6)
});
const API_PATH = "/api/plugin-marketplace";
const MAX_API_BODY_BYTES = 32768;
var ApiFailure = class extends Error {
	status;
	code;
	constructor(status, code, message) {
		super(message);
		this.status = status;
		this.code = code;
	}
};
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function readJson(req) {
	if (!req.headers["content-type"]?.toLowerCase().startsWith("application/json")) throw new ApiFailure(415, "content-type-invalid", "Expected an application/json request.");
	const chunks = [];
	let bytes = 0;
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		bytes += buffer.byteLength;
		if (bytes > MAX_API_BODY_BYTES) throw new ApiFailure(413, "request-too-large", "The request is too large.");
		chunks.push(buffer);
	}
	let value;
	try {
		value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new ApiFailure(400, "json-invalid", "The request body is not valid JSON.");
	}
	if (!isRecord(value)) throw new ApiFailure(400, "request-invalid", "The request body must be an object.");
	return value;
}
function verifySameOrigin(req) {
	const host = req.headers.host;
	const origin = req.headers.origin;
	let originUrl = null;
	try {
		originUrl = origin === void 0 ? null : new URL(origin);
	} catch {
		originUrl = null;
	}
	if (host === void 0 || originUrl === null || originUrl.protocol !== "http:" && originUrl.protocol !== "https:" || originUrl.host !== host) throw new ApiFailure(403, "origin-denied", "The marketplace API accepts only same-origin WebUI requests.");
}
function sendJson(res, status, value) {
	const body = `${JSON.stringify(value)}\n`;
	res.writeHead(status, {
		"cache-control": "no-store",
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(body),
		"x-content-type-options": "nosniff"
	});
	res.end(body);
}
function planRequest(value) {
	if (!isRecord(value) || typeof value.repositoryId !== "string" || value.action !== "install" && value.action !== "remove") throw new ApiFailure(400, "request-invalid", "Invalid marketplace plan request.");
	return {
		repositoryId: value.repositoryId,
		action: value.action
	};
}
function executeRequest(value) {
	if (!isRecord(value) || typeof value.planId !== "string" || value.planId.length === 0) throw new ApiFailure(400, "request-invalid", "Invalid marketplace execute request.");
	return { planId: value.planId };
}
const INSTALLABILITY_FILTERS = /* @__PURE__ */ new Set([
	"all",
	"one-click-eligible",
	"manual"
]);
const CATEGORY_FILTERS = /* @__PURE__ */ new Set([
	"all",
	"theme",
	"ui",
	"tool",
	"memory",
	"uncategorized"
]);
const SORTS = /* @__PURE__ */ new Set([
	"recommended",
	"stars",
	"recently-updated",
	"recently-added"
]);
function listRequest(value) {
	if (!isRecord(value) || typeof value.query !== "string" || value.query.length > 256 || typeof value.category !== "string" || !CATEGORY_FILTERS.has(value.category) || typeof value.installability !== "string" || !INSTALLABILITY_FILTERS.has(value.installability) || typeof value.sort !== "string" || !SORTS.has(value.sort) || typeof value.page !== "number" || !Number.isSafeInteger(value.page) || value.page < 1) throw new ApiFailure(400, "request-invalid", "Invalid marketplace list request.");
	return value;
}
function detailRequest(value) {
	if (!isRecord(value) || typeof value.repositoryId !== "string" || value.repositoryId.length === 0 || value.repositoryId.length > 128) throw new ApiFailure(400, "request-invalid", "Invalid marketplace detail request.");
	return value.repositoryId;
}
function refreshRequest(value) {
	if (!isRecord(value) || typeof value.currentDigest !== "string" || value.currentDigest.length > 128) throw new ApiFailure(400, "request-invalid", "Invalid marketplace refresh request.");
	return {
		request: listRequest(value.request),
		currentDigest: value.currentDigest
	};
}
function profileRuntime(ctx) {
	if (ctx.baseUrl === void 0 || !ctx.baseUrl.startsWith("file:")) throw new Error("plugin marketplace requires the Loader profile baseUrl");
	const dir = fileURLToPath(ctx.baseUrl);
	const manifest = readProfileManifest("dsh marketplace", dir);
	return {
		profileName: basename(dir),
		dir,
		dependenciesAtLaunch: { ...manifest.dependencies ?? {} },
		bundlesAtLaunch: [...manifest.dsh?.profile?.bundles ?? []]
	};
}
/** Mount the external bundle against public Host services only. */
async function apply(ctx, config) {
	const catalog = new MarketplaceCatalogClient({
		sourceUrl: config.catalogUrl,
		cachePath: dshHomePath("cache", "plugin-marketplace", "catalog-v1.json"),
		maxAgeMs: config.maxAgeMs,
		timeoutMs: config.timeoutMs,
		maxBytes: config.maxBytes
	});
	await catalog.initialize();
	const runtime = profileRuntime(ctx);
	const capabilities = await detectMarketplaceOperationCapabilities(runtime);
	const operations = new MarketplaceProfileOperations({
		runtime,
		catalog: () => catalog.view().catalog,
		capabilities
	});
	const disposeRoute = ctx.webServer.register({
		kind: "exact",
		path: API_PATH,
		handler: async (req, res) => {
			try {
				if (req.method !== "POST") {
					res.setHeader("allow", "POST");
					throw new ApiFailure(405, "method-not-allowed", "Use POST for marketplace API requests.");
				}
				verifySameOrigin(req);
				const body = await readJson(req);
				const method = body.method;
				let value;
				switch (method) {
					case "bootstrap": {
						const request = listRequest(body.params);
						if (catalog.view().catalog === null) await catalog.refresh();
						value = {
							list: queryMarketplaceCatalog(catalog.view(), request),
							capabilities,
							operations: operations.snapshot()
						};
						break;
					}
					case "list":
						value = queryMarketplaceCatalog(catalog.view(), listRequest(body.params));
						break;
					case "detail":
						value = detailMarketplaceEntry(catalog.view(), detailRequest(body.params), operations.snapshot().plugins);
						break;
					case "refresh": {
						const params = refreshRequest(body.params);
						const list = queryMarketplaceCatalog(await catalog.refresh(), params.request);
						const changed = list.digest !== params.currentDigest;
						value = {
							changed,
							list: changed ? list : null,
							source: list.source,
							stale: list.stale,
							lastSuccessfulFetchAt: list.lastSuccessfulFetchAt,
							error: list.error
						};
						break;
					}
					case "operationSnapshot":
						value = operations.snapshot();
						break;
					case "installed":
						value = installedMarketplacePlugins(catalog.view(), operations.snapshot());
						break;
					case "plan":
						value = operations.plan(planRequest(body.params));
						break;
					case "execute":
						value = await operations.execute(executeRequest(body.params));
						break;
					default: throw new ApiFailure(404, "method-unknown", "Unknown marketplace API method.");
				}
				sendJson(res, 200, {
					ok: true,
					value
				});
			} catch (error) {
				const failure = error instanceof ApiFailure ? error : new ApiFailure(500, "request-failed", "The marketplace request could not be completed.");
				sendJson(res, failure.status, {
					ok: false,
					error: {
						code: failure.code,
						message: failure.message
					}
				});
			}
		}
	});
	ctx.effect(() => disposeRoute, "plugin-marketplace.api");
	ctx.effect(() => async () => {
		await operations.close();
		await catalog.close();
	}, "plugin-marketplace.close");
}
//#endregion
export { Config, MarketplaceCatalogParseError, apply, computeMarketplaceCatalogDigest, inject, name, parseMarketplaceCatalogText, sealMarketplaceCatalog };

//# sourceMappingURL=index.mjs.map