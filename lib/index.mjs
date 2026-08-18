import { MarketplaceCatalogParseError, computeMarketplaceCatalogDigest, parseMarketplaceCatalogText, sealMarketplaceCatalog } from "./catalog.mjs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadOverlayPatches, loadProfile, readProfileManifest } from "@deepseek-ai/dsh-app-boot";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { constants, readFileSync } from "node:fs";
import { execa } from "execa";
const YEAR_MS = 315576e5;
const RATING_BOOST_WEIGHT = 2;
/**
* Maintenance freshness of a repository, 0..1: just pushed is 100%, one year
* without updates is 50%, three years is zero. Piecewise linear so the curve
* reads exactly like its description; measured at query time, not scan time.
*/
function marketplaceFreshness(lastCodePushAt, nowMs) {
	const years = (nowMs - Date.parse(lastCodePushAt)) / YEAR_MS;
	if (!Number.isFinite(years) || years <= 0) return 1;
	if (years < 1) return 1 - .5 * years;
	if (years < 3) return .75 - .25 * years;
	return 0;
}
/** Wilson lower bound (95%) — two unprompted upvotes never outrank a proven record. */
function wilsonLowerBound(up, total) {
	if (total === 0) return 0;
	const z = 1.96;
	const phat = up / total;
	const zz = z * z;
	return (phat + zz / (2 * total) - z * Math.sqrt((phat * (1 - phat) + zz / (4 * total)) / total)) / (1 + zz / total);
}
/**
* Recommended score inside one trust tier: freshness multiplies a log-star
* quality term (log compresses so star giants cannot crush fresh work), and a
* vote-gated Wilson rating boost adds independently — a universally loved but
* unmaintained plugin sinks low yet never falsely claims a fresh project's slot.
*/
function recommendedScore(entry, nowMs) {
	const quality = 1 + Math.log1p(entry.stars);
	const rating = entry.rating;
	const total = rating === null ? 0 : rating.up + rating.down;
	const boost = rating !== null && total >= 10 ? RATING_BOOST_WEIGHT * wilsonLowerBound(rating.up, total) : 0;
	return marketplaceFreshness(entry.lastCodePushAt, nowMs) * quality + boost;
}
/** Fixed taxonomy priority: the first matching category wins, one chip per row. */
const MARKETPLACE_CATEGORY_PRIORITY = [
	"theme",
	"memory",
	"usage",
	"skill",
	"security",
	"channel",
	"ui",
	"tool",
	"provider"
];
/**
* Conservative fallback tokens matched against whole words from topics, keywords,
* and repository/package names. Precision beats recall: a wrong chip is worse
* than an honest "uncategorized", so attributive product names (codex, claude,
* openai — "Codex-style pet", "import Claude sessions") never classify.
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
	usage: [
		"usage",
		"balance",
		"billing",
		"quota",
		"cost",
		"costs",
		"metering",
		"spend"
	],
	skill: ["skill", "skills"],
	security: [
		"security",
		"audit",
		"audits",
		"approval",
		"approvals",
		"sandbox",
		"permission",
		"permissions",
		"policy"
	],
	channel: [
		"feishu",
		"lark",
		"telegram",
		"discord",
		"wechat",
		"dingtalk",
		"slack",
		"qq",
		"qqbot"
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
		"layout",
		"pet",
		"pets",
		"widget",
		"widgets"
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
		"notification",
		"workflow",
		"workflows",
		"scheduler",
		"session",
		"sessions"
	],
	provider: [
		"provider",
		"providers",
		"openrouter",
		"oauth"
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
function summary(entry, nowMs, issueUrl) {
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
		riskSignals: entry.riskSignals,
		freshness: marketplaceFreshness(entry.lastCodePushAt, nowMs),
		rating: entry.rating === null ? null : {
			up: entry.rating.up,
			down: entry.rating.down,
			upRecent: entry.rating.upRecent,
			downRecent: entry.rating.downRecent
		},
		voteUrl: entry.rating === null || issueUrl === null ? null : `${issueUrl}#issuecomment-${String(entry.rating.commentId)}`
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
function compareRecommended(left, right, nowMs) {
	const installability = Number(right.installability === "one-click-eligible") - Number(left.installability === "one-click-eligible");
	if (installability !== 0) return installability;
	const score = recommendedScore(right, nowMs) - recommendedScore(left, nowMs);
	if (score !== 0) return score;
	const pushed = Date.parse(right.lastCodePushAt) - Date.parse(left.lastCodePushAt);
	if (pushed !== 0) return pushed;
	return compareText(left.repository.fullName, right.repository.fullName);
}
function compareRanked(left, right, request, nowMs) {
	if (left.relevance !== right.relevance) return right.relevance - left.relevance;
	switch (request.sort) {
		case "stars": return right.entry.stars - left.entry.stars || compareRecommended(left.entry, right.entry, nowMs);
		case "recently-updated": return Date.parse(right.entry.lastCodePushAt) - Date.parse(left.entry.lastCodePushAt) || compareRecommended(left.entry, right.entry, nowMs);
		case "recently-added": return Date.parse(right.entry.firstSeenAt) - Date.parse(left.entry.firstSeenAt) || compareRecommended(left.entry, right.entry, nowMs);
		case "recommended": return compareRecommended(left.entry, right.entry, nowMs);
	}
}
/** Query one catalog view without leaking the full scanner payload to the browser. */
function queryMarketplaceCatalog(view, request, now) {
	const nowMs = now === void 0 ? Date.now() : Date.parse(now);
	const admitted = view.catalog?.entries.filter(isPublicMarketplaceEntry) ?? [];
	const categorized = admitted.map((entry) => ({
		entry,
		category: deriveMarketplaceCategory(entry)
	}));
	const counts = {
		all: admitted.length,
		oneClick: admitted.filter((entry) => entry.installability === "one-click-eligible").length,
		manual: admitted.filter((entry) => entry.installability === "manual").length,
		categories: Object.fromEntries(MARKETPLACE_CATEGORY_PRIORITY.map((category) => [category, categorized.filter((item) => item.category === category).length])),
		uncategorized: categorized.filter((item) => item.category === null).length,
		packs: (view.catalog?.packs ?? []).filter(isPublicMarketplacePack).length
	};
	const words = normalizedWords(request.query);
	const selected = categorized.filter((item) => request.category === "all" || (request.category === "uncategorized" ? item.category === null : item.category === request.category)).filter((item) => request.installability === "all" || item.entry.installability === request.installability).map((item) => ({
		entry: item.entry,
		relevance: relevance(item.entry, words)
	})).filter((item) => item.relevance >= 0).sort((left, right) => compareRanked(left, right, request, nowMs));
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
		items: selected.slice(offset, offset + 50).map((item) => summary(item.entry, nowMs, view.catalog?.ratings?.issueUrl ?? null)),
		error: view.error
	};
}
/** Return full evidence only for an admitted entry and attach sparse profile state. */
function detailMarketplaceEntry(view, repositoryId, states, now) {
	const entry = view.catalog?.entries.find((candidate) => candidate.repositoryId === repositoryId && isPublicMarketplaceEntry(candidate)) ?? null;
	if (entry === null) return {
		entry: null,
		state: null,
		freshness: null,
		rating: null,
		voteUrl: null
	};
	const nowMs = now === void 0 ? Date.now() : Date.parse(now);
	const issueUrl = view.catalog?.ratings?.issueUrl ?? null;
	return {
		entry,
		state: states.find((candidate) => candidate.repositoryId === repositoryId) ?? null,
		freshness: marketplaceFreshness(entry.lastCodePushAt, nowMs),
		rating: entry.rating === null ? null : {
			up: entry.rating.up,
			down: entry.rating.down,
			upRecent: entry.rating.upRecent,
			downRecent: entry.rating.downRecent
		},
		voteUrl: entry.rating === null || issueUrl === null ? null : `${issueUrl}#issuecomment-${String(entry.rating.commentId)}`
	};
}
/** Join the current-profile operation snapshot with admitted catalog summaries in one call. */
function installedMarketplacePlugins(view, snapshot) {
	const nowMs = Date.now();
	const issueUrl = view.catalog?.ratings?.issueUrl ?? null;
	const summaries = /* @__PURE__ */ new Map();
	for (const entry of view.catalog?.entries.filter(isPublicMarketplaceEntry) ?? []) summaries.set(entry.repositoryId, summary(entry, nowMs, issueUrl));
	return {
		profileName: snapshot.profileName,
		busy: snapshot.busy,
		capabilities: snapshot.capabilities,
		items: snapshot.plugins.map((state) => ({
			state,
			plugin: state.repositoryId === null ? null : summaries.get(state.repositoryId) ?? null
		})),
		external: snapshot.external
	};
}
/** Conservative admission defense for packs mirrors the plugin defense. */
function isPublicMarketplacePack(pack) {
	return pack.validation.status === "valid" && !pack.repository.archived;
}
/**
* Editorial order chosen by the marketplace maintainers, applied before every
* other pack ordering. Packs are curated artifacts, not popularity contests:
* ranking them by stars would reward stuffing a pack with the most-starred
* plugins — a star-sorted category view in disguise. Featured packs are
* reviewed for coherence and honesty (every item resolves, the install
* composition is disclosed, no padding); the rest sort by freshness.
*/
const FEATURED_MARKETPLACE_PACKS = ["w2112515/dsh-essentials-pack"];
/** Catalog-truth status of one pack item; the profile only ever adds 'installed'. */
function catalogPackItemStatus(entry) {
	if (entry === void 0) return "unavailable";
	if (entry.installability === "one-click-eligible") return "installable";
	if (entry.installScripts !== null && entry.repository.commitSha !== null && entry.package.name !== null && entry.package.version !== null) return "script-gated";
	return "manual";
}
function packSummary(pack, entriesById) {
	const separator = pack.repository.fullName.indexOf("/");
	const composition = {
		oneClick: 0,
		scriptGated: 0,
		manual: 0,
		unavailable: 0
	};
	for (const item of pack.items) {
		const status = catalogPackItemStatus(item.repositoryId === null ? void 0 : entriesById.get(item.repositoryId));
		if (status === "installable") composition.oneClick += 1;
		else if (status === "script-gated") composition.scriptGated += 1;
		else if (status === "manual") composition.manual += 1;
		else composition.unavailable += 1;
	}
	return {
		repositoryId: pack.repositoryId,
		name: pack.name,
		publisher: separator === -1 ? pack.repository.fullName : pack.repository.fullName.slice(0, separator),
		repositoryFullName: pack.repository.fullName,
		repositoryUrl: pack.repository.url,
		description: pack.description,
		stars: pack.stars,
		itemCount: pack.items.length,
		lastCodePushAt: pack.lastCodePushAt,
		featured: FEATURED_MARKETPLACE_PACKS.includes(pack.repository.fullName),
		composition
	};
}
/**
* List admitted packs: editorial picks first in their declared order, then by
* freshness — never by stars. Packs are few and unpaged by design.
*/
function listMarketplacePacks(view) {
	const entriesById = /* @__PURE__ */ new Map();
	for (const entry of view.catalog?.entries.filter(isPublicMarketplaceEntry) ?? []) entriesById.set(entry.repositoryId, entry);
	const featuredOrder = new Map(FEATURED_MARKETPLACE_PACKS.map((fullName, index) => [fullName, index]));
	const packs = (view.catalog?.packs ?? []).filter(isPublicMarketplacePack).sort((left, right) => {
		const leftFeatured = featuredOrder.get(left.repository.fullName);
		const rightFeatured = featuredOrder.get(right.repository.fullName);
		if (leftFeatured !== void 0 || rightFeatured !== void 0) {
			if (leftFeatured === void 0) return 1;
			if (rightFeatured === void 0) return -1;
			return leftFeatured - rightFeatured;
		}
		return Date.parse(right.lastCodePushAt) - Date.parse(left.lastCodePushAt) || compareText(left.repository.fullName, right.repository.fullName);
	}).map((pack) => packSummary(pack, entriesById));
	return {
		digest: view.catalog?.integrity.digest ?? "",
		catalogStatus: view.catalog === null ? view.status : "ready",
		source: view.source,
		stale: view.stale,
		packs,
		error: view.error
	};
}
function packItemStatus(entry, state) {
	if (state !== void 0) return "installed";
	return catalogPackItemStatus(entry);
}
/**
* Resolve one pack against catalog and profile truth. Every item keeps its
* declared identity; the status chip is derived, never asserted by the pack.
*/
function detailMarketplacePack(view, snapshot, repositoryId) {
	const pack = view.catalog?.packs.find((candidate) => candidate.repositoryId === repositoryId && isPublicMarketplacePack(candidate)) ?? null;
	if (pack === null) return {
		pack: null,
		items: []
	};
	const admitted = /* @__PURE__ */ new Map();
	for (const entry of view.catalog?.entries.filter(isPublicMarketplaceEntry) ?? []) admitted.set(entry.repositoryId, entry);
	const states = new Map(snapshot.plugins.flatMap((state) => state.repositoryId === null ? [] : [[state.repositoryId, state]]));
	const items = pack.items.map((item) => {
		const entry = item.repositoryId === null ? void 0 : admitted.get(item.repositoryId);
		const state = entry === void 0 ? void 0 : states.get(entry.repositoryId);
		return {
			fullName: item.fullName,
			repositoryId: entry?.repositoryId ?? item.repositoryId,
			status: packItemStatus(entry, state),
			name: entry === void 0 ? null : entry.package.name ?? entry.repository.fullName,
			packageName: entry?.package.name ?? null,
			repositoryUrl: entry?.repository.url ?? null,
			state: state?.state ?? null
		};
	});
	return {
		pack: packSummary(pack, admitted),
		items
	};
}
//#endregion
//#region src/agent-tools.ts
const SEARCH_LIMIT = 10;
const GUIDE_MAX_CHARS = 2e3;
const GUIDE_FETCH_TIMEOUT_MS = 1e4;
const CATEGORY_VALUES = [
	"theme",
	"memory",
	"usage",
	"skill",
	"security",
	"channel",
	"ui",
	"tool",
	"provider",
	"uncategorized"
];
const SORT_VALUES = [
	"recommended",
	"stars",
	"recently-updated",
	"recently-added"
];
function asString(value) {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
function normalizeEnum(value, allowed, fallback) {
	return typeof value === "string" && allowed.includes(value) ? value : fallback;
}
/** Verdict is shown only at 10+ total votes, matching the WebUI rating chip. */
function formatAgentRating(rating) {
	if (rating === null) return "no vote channel yet";
	const total = rating.up + rating.down;
	if (total === 0) return "no votes yet";
	if (total < 10) return `insufficient votes (${total}/10) — no verdict`;
	const percent = Math.round(rating.up / total * 100);
	const recentTotal = rating.upRecent + rating.downRecent;
	return `${percent}% positive of ${total} votes${recentTotal > 0 ? `, last 90 days ${Math.round(rating.upRecent / recentTotal * 100)}% of ${recentTotal}` : ""}`;
}
function installabilityLabel(entry) {
	return entry.installability;
}
function findEntry(view, repositoryId) {
	return view.catalog?.entries.find((entry) => entry.repositoryId === repositoryId) ?? null;
}
function catalogUnavailable() {
	return {
		available: false,
		message: "The marketplace catalog is not loaded yet; retry in a few seconds."
	};
}
/** Extract install-relevant README sections; falls back to the document head. */
function extractInstallGuide(markdown, maxChars = GUIDE_MAX_CHARS) {
	const wanted = markdown.split(/^(?=#{1,3}\s)/m).filter((section) => /^#{1,3}\s.*(install|setup|getting started|usage|quickstart|安装|使用|快速开始)/i.test(section));
	const trimmed = (wanted.length > 0 ? wanted.join("\n") : markdown.slice(0, maxChars)).trim();
	return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}\n… (truncated)` : trimmed;
}
async function fetchReadme(fullName, signal) {
	for (const name of [
		"README.md",
		"readme.md",
		"README.zh-CN.md"
	]) try {
		const response = await fetch(`https://raw.githubusercontent.com/${fullName}/HEAD/${name}`, {
			signal,
			redirect: "follow"
		});
		if (response.ok) return await response.text();
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") throw error;
	}
	return null;
}
function applyMarketplaceAgentTools(ctx, deps) {
	ctx.systemPrompt.section({
		name: "tool:marketplace",
		order: 112,
		text: "The marketplace_search, marketplace_detail, marketplace_install, and marketplace_manual_guide tools expose the DSH Plugin Marketplace catalog. Prefer marketplace_search over web_search when the user asks about DSH plugins. marketplace_install handles only catalog entries whose installability is \"one-click-eligible\"; every install asks the user for one-time approval and consent is never persisted. For \"script-gated\" entries, direct the user to Settings → Plugins → Marketplace to review the install scripts verbatim — never try to bypass that review. For \"manual\" entries, call marketplace_manual_guide and follow the returned instructions with your ordinary shell tools under the session permission mode. Installed plugins activate only after the user restarts dsh web — always say so."
	});
	ctx.tools.register(defineTool({
		name: "marketplace_search",
		description: "Search the DSH Plugin Marketplace catalog. Returns compact rows (name, repository id, stars, category, installability, freshness, community rating) for discovered DSH plugins and solution packs. Read-only.",
		parameters: {
			query: {
				type: "string",
				description: "Optional free-text search over names, descriptions, authors, and keywords."
			},
			category: {
				type: "string",
				description: `Optional category filter: ${CATEGORY_VALUES.join(" | ")}.`
			},
			installability: {
				type: "string",
				description: "Optional filter: one-click-eligible | manual."
			},
			sort: {
				type: "string",
				description: `Optional sort: ${SORT_VALUES.join(" | ")} (default recommended).`
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					available: {
						type: "boolean",
						required: true
					},
					message: { type: "string" },
					total: { type: "number" },
					applied: { type: "string" },
					items: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								name: {
									type: "string",
									required: true
								},
								repositoryId: {
									type: "string",
									required: true
								},
								repository: {
									type: "string",
									required: true
								},
								stars: {
									type: "number",
									required: true
								},
								category: {
									type: "string",
									required: true
								},
								installability: {
									type: "string",
									required: true
								},
								freshnessPercent: {
									type: "number",
									required: true
								},
								rating: {
									type: "string",
									required: true
								},
								description: {
									type: "string",
									required: true
								}
							}
						}
					}
				}
			},
			render: (_args, value) => {
				const result = value;
				if (!result.available) return [{
					type: "text",
					text: result.message ?? "Catalog unavailable."
				}];
				const lines = (result.items ?? []).map((item) => `- ${item.name} (${item.repository}) [id ${item.repositoryId}] — ★${item.stars}, ${item.category}, ${item.installability}, freshness ${item.freshnessPercent}%, ${item.rating}. ${item.description}`);
				return [{
					type: "text",
					text: `${result.total ?? 0} matches; showing ${lines.length}:\n${lines.join("\n")}`
				}];
			}
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const view = deps.catalog();
			if (view.catalog === null) return catalogUnavailable();
			const query = asString(args.query) ?? "";
			const category = normalizeEnum(args.category, CATEGORY_VALUES, "all");
			const installability = normalizeEnum(args.installability, ["one-click-eligible", "manual"], "all");
			const sort = normalizeEnum(args.sort, SORT_VALUES, "recommended");
			const list = queryMarketplaceCatalog(view, {
				query,
				category,
				installability,
				sort,
				page: 1
			});
			return {
				available: true,
				total: list.total,
				applied: `query=${JSON.stringify(query)} category=${category} installability=${installability} sort=${sort}`,
				items: list.items.slice(0, SEARCH_LIMIT).map((item) => ({
					name: item.name,
					repositoryId: item.repositoryId,
					repository: item.repositoryFullName,
					stars: item.stars,
					category: item.category ?? "uncategorized",
					installability: item.installability,
					freshnessPercent: Math.round(item.freshness * 100),
					rating: formatAgentRating(item.rating),
					description: (item.description ?? "").slice(0, 120)
				}))
			};
		}
	}));
	ctx.tools.register(defineTool({
		name: "marketplace_detail",
		description: "Full marketplace evidence for one catalog entry: validation status, risk signals, installability, freshness, community rating, and current profile state. Read-only. Use the repositoryId from marketplace_search.",
		parameters: { repositoryId: {
			type: "string",
			required: true,
			description: "The catalog repositoryId of the plugin."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					found: {
						type: "boolean",
						required: true
					},
					message: { type: "string" },
					detail: { type: "string" }
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: String(value.detail ?? value.message ?? "")
			}]
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const repositoryId = asString(args.repositoryId);
			if (repositoryId === null) return {
				found: false,
				message: "repositoryId is required."
			};
			const view = deps.catalog();
			if (view.catalog === null) return {
				found: false,
				message: catalogUnavailable().message
			};
			const response = detailMarketplaceEntry(view, repositoryId, deps.operations.snapshot().plugins);
			const entry = response.entry;
			if (entry === null) return {
				found: false,
				message: `No catalog entry for repositoryId ${repositoryId}.`
			};
			const guidance = entry.installability === "one-click-eligible" ? "Installable via marketplace_install (the user approves once)." : entry.installScripts !== null ? "Script-gated: install scripts must be reviewed verbatim in Settings → Plugins → Marketplace; agent install is refused by design." : "Manual install only: use marketplace_manual_guide and follow the repository instructions.";
			return {
				found: true,
				detail: [
					`${entry.package.name} (${entry.repository.fullName}) [id ${entry.repositoryId}]`,
					entry.package.description ?? "",
					`Publisher ${entry.repository.fullName.split("/")[0]} · author ${entry.package.author ?? "unknown"} · license ${entry.package.license ?? "undeclared"} · ★${entry.stars}`,
					`Created ${entry.repositoryCreatedAt} · last push ${entry.lastCodePushAt} · first indexed ${entry.firstSeenAt}`,
					`Freshness ${response.freshness === null ? "unknown" : `${Math.round(response.freshness * 100)}%`} · rating: ${formatAgentRating(response.rating)}`,
					`Validation ${entry.validation.status} · compatibility ${entry.compatibility} · installability ${installabilityLabel(entry)}`,
					`Risk signals: ${entry.riskSignals.length > 0 ? entry.riskSignals.join(", ") : "none"}`,
					`Pinned source: ${entry.source.ref}`,
					`Profile state: ${response.state === null ? "not installed" : response.state.state}`,
					response.voteUrl === null ? "Vote channel pending." : `Vote: ${response.voteUrl}`,
					`Repository: ${entry.repository.url}`,
					`Guidance: ${guidance}`
				].join("\n")
			};
		}
	}));
	ctx.tools.register(defineTool({
		name: "marketplace_install",
		description: "Install a one-click-eligible marketplace plugin into the current DSH profile. Every call asks the user for one-time approval; script-gated and manual entries are refused. The plugin activates after the user restarts dsh web.",
		parameters: { repositoryId: {
			type: "string",
			required: true,
			description: "The catalog repositoryId of the plugin to install."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					installed: {
						type: "boolean",
						required: true
					},
					code: {
						type: "string",
						required: true
					},
					message: {
						type: "string",
						required: true
					},
					requiresRestart: { type: "boolean" },
					rollback: { type: "string" }
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: value.message
			}]
		},
		async execute(args) {
			const repositoryId = asString(args.repositoryId);
			if (repositoryId === null) return {
				installed: false,
				code: "request-invalid",
				message: "repositoryId is required."
			};
			if (!deps.capabilities.profileWritable || deps.capabilities.packageManager === "unavailable") return {
				installed: false,
				code: "capabilities-unavailable",
				message: deps.capabilities.message ?? "The Host cannot write this profile or no package manager is available; ask the user to open Settings → Plugins → Marketplace for recovery steps."
			};
			const plan = deps.operations.plan({
				repositoryId,
				action: "install"
			});
			if (plan.status !== "ready" || plan.planId === null) {
				const why = plan.blockCode === "not-one-click-eligible" ? "This entry is not one-click-eligible. Script-gated entries must be reviewed verbatim by the user in Settings → Plugins → Marketplace; manual entries have no automatic path (use marketplace_manual_guide)." : `The plan was blocked: ${plan.blockCode ?? "unknown"}.`;
				return {
					installed: false,
					code: plan.blockCode ?? "blocked",
					message: why
				};
			}
			const result = await deps.operations.execute({ planId: plan.planId });
			const succeeded = result.status === "succeeded";
			return {
				installed: succeeded,
				code: result.code,
				rollback: result.rollback,
				requiresRestart: succeeded,
				message: succeeded ? `Installed ${result.packageName ?? repositoryId} into profile "${plan.profileName}". Tell the user to restart dsh web to activate it.` : `Install failed (${result.code}); rollback: ${result.rollback}.`
			};
		}
	}));
	ctx.on("tools/pre-execute", async (exec, next) => {
		if (exec.name !== "marketplace_install") return next();
		const repositoryId = asString(exec.arguments.repositoryId);
		const entry = repositoryId === null ? null : findEntry(deps.catalog(), repositoryId);
		return {
			kind: "ask",
			reason: entry === null ? `Approve installing marketplace entry ${repositoryId ?? "?"} into profile "${deps.capabilities.profileName}"? One-time approval; consent is never persisted.` : `Approve installing DSH plugin "${entry.package.name}" (${entry.repository.fullName}) into profile "${deps.capabilities.profileName}" at pinned commit ${(entry.repository.commitSha ?? "unknown").slice(0, 10)}? Risk signals: ${entry.riskSignals.length > 0 ? entry.riskSignals.join(", ") : "none"}. One-time approval; consent is never persisted.`
		};
	});
	ctx.tools.register(defineTool({
		name: "marketplace_manual_guide",
		description: "Fetch the install/usage sections of a manual-install marketplace entry's README so you can follow them with your ordinary shell tools. Read-only; the marketplace never executes manual installs.",
		parameters: { repositoryId: {
			type: "string",
			required: true,
			description: "The catalog repositoryId of the plugin."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					found: {
						type: "boolean",
						required: true
					},
					message: { type: "string" },
					repositoryUrl: { type: "string" },
					guide: { type: "string" }
				}
			},
			render: (_args, value) => {
				const result = value;
				return [{
					type: "text",
					text: result.found ? result.guide ?? "" : result.message ?? "Not found."
				}];
			}
		},
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			const repositoryId = asString(args.repositoryId);
			if (repositoryId === null) return {
				found: false,
				message: "repositoryId is required."
			};
			const entry = findEntry(deps.catalog(), repositoryId);
			if (entry === null) return {
				found: false,
				message: `No catalog entry for repositoryId ${repositoryId}.`
			};
			if (entry.installability !== "manual") return {
				found: false,
				repositoryUrl: entry.repository.url,
				message: `${entry.repository.fullName} is "${entry.installability}", not manual — use marketplace_install (one-click) or the WebUI script review (script-gated).`
			};
			const signal = AbortSignal.any([exec.signal, AbortSignal.timeout(GUIDE_FETCH_TIMEOUT_MS)]);
			const readme = await fetchReadme(entry.repository.fullName, signal);
			if (readme === null) return {
				found: false,
				repositoryUrl: entry.repository.url,
				message: `Could not fetch a README for ${entry.repository.fullName}. Read the repository directly: ${entry.repository.url}`
			};
			return {
				found: true,
				repositoryUrl: entry.repository.url,
				guide: `Install/usage excerpt from ${entry.repository.fullName}'s README (source: ${entry.repository.url}):\n\n${extractInstallGuide(readme)}`
			};
		}
	}));
}
//#endregion
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
		const attempts = 2;
		for (let attempt = 1; attempt <= attempts; attempt += 1) try {
			await this.pull();
			return this.view();
		} catch (error) {
			const failure = publicError(error);
			if (!(!this.disposed && attempt < attempts && (failure.code === "network-error" || failure.code === "http-error"))) {
				this.error = failure;
				return this.view();
			}
		}
		return this.view();
	}
	async pull() {
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
			return;
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
const MAX_FAILURE_OUTPUT_CHARS = 2e3;
/** Keep the diagnostic tail of a failed package-manager run, bounded and trimmed. */
function outputTail(text) {
	const trimmed = text?.trim() ?? "";
	if (trimmed.length === 0) return null;
	return trimmed.length > MAX_FAILURE_OUTPUT_CHARS ? trimmed.slice(-2e3) : trimmed;
}
async function runPackageManager(manager, args, cwd, signal) {
	if (manager === "unavailable") return {
		exitCode: 1,
		unavailable: true,
		output: null
	};
	const command = manager === "pnpm" ? "pnpm" : "corepack";
	const commandArgs = manager === "pnpm" ? args : ["pnpm", ...args];
	try {
		const result = await execa(command, commandArgs, {
			cwd,
			env: sanitizedEnvironment(),
			reject: false,
			cancelSignal: signal,
			forceKillAfterDelay: 5e3,
			maxBuffer: MAX_PROCESS_OUTPUT_BYTES
		});
		return {
			exitCode: result.exitCode ?? 1,
			unavailable: false,
			output: outputTail(result.stderr) ?? outputTail(result.stdout)
		};
	} catch (error) {
		return {
			exitCode: 1,
			unavailable: error?.code === "ENOENT",
			output: null
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
/** Entry-independent lifecycle: what the profile manifest and launch snapshot prove. */
function coreProfileState(runtime, manifest, packageName) {
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
		state,
		installedSpec
	};
}
/** Project one catalog entry against the profile; identity comes from the entry by construction. */
function pluginState(runtime, manifest, entry, records = {}) {
	const packageName = entry.package.name;
	if (packageName === null) return {
		repositoryId: entry.repositoryId,
		packageName,
		state: "not-installed",
		installedVersion: null,
		installedSpec: null,
		installedRepository: null,
		catalogSpec: entry.source.ref,
		catalogRelation: "up-to-date",
		updateAvailable: false
	};
	const core = coreProfileState(runtime, manifest, packageName);
	const origin = installedOrigin(core.installedSpec);
	const relation = origin !== null && sameRepository(origin, entry) ? catalogRelationFor(core.installedSpec, entry, records[packageName]) : core.installedSpec === null ? "up-to-date" : "diverged";
	return {
		repositoryId: entry.repositoryId,
		packageName,
		state: core.state,
		installedVersion: core.installedSpec === null ? null : installedVersion(runtime.dir, packageName),
		installedSpec: core.installedSpec,
		installedRepository: installedOrigin(core.installedSpec ?? runtime.dependenciesAtLaunch[packageName] ?? null)?.fullName ?? null,
		catalogSpec: entry.source.ref,
		catalogRelation: relation,
		updateAvailable: relation === "update-available"
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
		requiresScripts: false,
		installScripts: null,
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
		fullName,
		commitSha: match?.[2]?.toLowerCase() ?? null
	};
}
function sameRepository(origin, entry) {
	return origin.fullName.toLowerCase() === entry.repository.fullName.toLowerCase();
}
const INSTALL_STATE_FILE = "dsh-plugin-marketplace.installs.json";
/** Read pins this Marketplace installed, best-effort; anything unreadable degrades to no provenance. */
function readInstallRecords(profileDir) {
	try {
		const value = JSON.parse(requireText(join(profileDir, INSTALL_STATE_FILE)));
		if (!isRecord$1(value) || value.schemaVersion !== 1 || !isRecord$1(value.installs)) return {};
		return Object.fromEntries(Object.entries(value.installs).flatMap(([name, record]) => {
			if (!isRecord$1(record) || typeof record.spec !== "string") return [];
			return [[name, {
				spec: record.spec,
				commitSha: typeof record.commitSha === "string" ? record.commitSha.toLowerCase() : null,
				installedAt: typeof record.installedAt === "string" ? record.installedAt : "",
				scripts: record.scripts === true
			}]];
		}));
	} catch {
		return {};
	}
}
/**
* Relate the installed pin to the origin-matched catalog entry. An update is
* claimed only when the Marketplace itself placed the current pin and the
* catalog has moved since; scanner pins advance along the default branch, so
* a moved catalog pin is newer. Anything else that differs is honestly
* 'diverged' — never an update offer, and never a silent downgrade funnel.
*/
function catalogRelationFor(installedSpec, entry, record) {
	if (installedSpec === null) return "up-to-date";
	const installedSha = installedOrigin(installedSpec)?.commitSha ?? null;
	const catalogSha = entry.repository.commitSha?.toLowerCase() ?? null;
	if (installedSha !== null && catalogSha !== null ? installedSha === catalogSha : installedSpec === entry.source.ref) return "up-to-date";
	if (record !== void 0 && installedSha !== null && record.commitSha === installedSha) return "update-available";
	return "diverged";
}
function marketplacePlanId(value) {
	return value;
}
const WORKSPACE_FILE = "pnpm-workspace.yaml";
function hasExactReviewedSource(entry) {
	const commitSha = entry.repository.commitSha;
	if (commitSha === null || !/^[0-9a-f]{40}$/.test(commitSha)) return false;
	return entry.source.ref === `git+https://github.com/${entry.repository.fullName}.git#${commitSha}`;
}
/**
* allow-build keys that actually authorize a git-hosted dep's prepare. pnpm
* matches allowBuilds against the resolved depPath, and a bare package name
* never matches a non-semver resolution (trustPackageIdentity stays false at
* the git-prepare call site). A pinned GitHub ref is fetched as a codeload
* tarball, so the exact tarball key is the form pnpm itself demands; the
* hashless repo key (pnpm >= 11.15) additionally covers the clone fallback.
*/
function allowBuildFlags(packageName, sourceRef) {
	const match = /^git\+https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)\.git#([0-9a-f]{40})$/i.exec(sourceRef);
	if (match === null) return [`--allow-build=${packageName}`];
	const [, repoPath, sha] = match;
	return [`--allow-build=${packageName}@https://codeload.github.com/${repoPath}/tar.gz/${sha}`, `--allow-build=${packageName}@git+https://github.com/${repoPath}.git`];
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
		const records = readInstallRecords(this.options.runtime.dir);
		const entriesByName = /* @__PURE__ */ new Map();
		for (const entry of catalog?.entries ?? []) {
			if (entry.package.name === null) continue;
			const list = entriesByName.get(entry.package.name);
			if (list === void 0) entriesByName.set(entry.package.name, [entry]);
			else list.push(entry);
		}
		const packageNames = /* @__PURE__ */ new Set([
			...Object.keys(manifest.dependencies ?? {}),
			...manifestBundles(manifest),
			...Object.keys(this.options.runtime.dependenciesAtLaunch),
			...this.options.runtime.bundlesAtLaunch
		]);
		const plugins = [];
		for (const packageName of [...packageNames].sort((left, right) => left.localeCompare(right))) {
			const candidates = entriesByName.get(packageName);
			if (candidates === void 0) continue;
			const core = coreProfileState(this.options.runtime, manifest, packageName);
			if (core.state === "not-installed") continue;
			const origin = installedOrigin(core.installedSpec ?? this.options.runtime.dependenciesAtLaunch[packageName] ?? null);
			const match = origin === null ? void 0 : candidates.find((entry) => sameRepository(origin, entry));
			if (match === void 0) {
				plugins.push({
					repositoryId: null,
					packageName,
					state: core.state,
					installedVersion: core.installedSpec === null ? null : installedVersion(this.options.runtime.dir, packageName),
					installedSpec: core.installedSpec,
					installedRepository: origin?.fullName ?? null,
					catalogSpec: null,
					catalogRelation: "not-in-catalog",
					updateAvailable: false
				});
				continue;
			}
			plugins.push(pluginState(this.options.runtime, manifest, match, records));
		}
		return {
			profileName: this.options.runtime.profileName,
			busy: this.busy,
			capabilities: this.options.capabilities,
			plugins,
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
		const state = pluginState(this.options.runtime, manifest, entry, readInstallRecords(this.options.runtime.dir));
		if (isRestartPending(state.state)) return emptyPlan(request, this.options.runtime.profileName, "restart-required", entry);
		const origin = installedOrigin(state.installedSpec);
		const sameOrigin = origin !== null && sameRepository(origin, entry);
		let action;
		let requiresScripts = false;
		if (request.action === "remove") {
			if (state.installedSpec === null) return emptyPlan(request, this.options.runtime.profileName, "not-installed", entry);
			action = "remove";
		} else {
			if (entry.package.name === null || entry.package.version === null || !hasExactReviewedSource(entry)) return emptyPlan(request, this.options.runtime.profileName, "package-metadata-missing", entry);
			if (entry.installability !== "one-click-eligible") {
				if (entry.installability !== "manual" || entry.installScripts === null) return emptyPlan(request, this.options.runtime.profileName, "not-one-click-eligible", entry);
				requiresScripts = true;
			}
			if (state.state === "active" && sameOrigin && !state.updateAvailable) return emptyPlan(request, this.options.runtime.profileName, "already-installed", entry);
			action = state.installedSpec === null ? "install" : "update";
		}
		const warnings = ["code-executes-on-restart", "restart-required"];
		if (action !== "remove") {
			warnings.unshift("git-source", requiresScripts ? "install-scripts-run" : "install-scripts-disabled");
			if (entry.compatibility === "unknown") warnings.unshift("compatibility-unknown");
			if (state.installedSpec !== null && !sameOrigin) warnings.push("origin-differs");
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
			requiresScripts,
			installScripts: requiresScripts ? entry.installScripts : null,
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
		if (stored.plan.requiresScripts && request.allowScripts !== true) return Promise.resolve(this.failure("consent-required", stored.plan));
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
	failure(code, plan, rollback = "not-needed", detail = null) {
		return {
			status: "failed",
			code,
			action: plan?.action ?? null,
			profileName: this.options.runtime.profileName,
			packageName: plan?.packageName ?? null,
			requiresRestart: false,
			rollback,
			detail,
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
			backup(join(this.options.runtime.dir, WORKSPACE_FILE))
		]);
		const args = plan.action === "remove" ? ["remove", packageName] : plan.requiresScripts ? [
			"add",
			"--save-exact",
			...allowBuildFlags(packageName, plan.sourceRef),
			"--config.strict-dep-builds=false",
			plan.sourceRef
		] : [
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
			return this.failure(command.unavailable ? "pnpm-unavailable" : "pnpm-failed", plan, rollback, command.output);
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
		try {
			const records = { ...readInstallRecords(this.options.runtime.dir) };
			if (plan.action === "remove") delete records[packageName];
			else records[packageName] = {
				spec: plan.sourceRef,
				commitSha: plan.commitSha?.toLowerCase() ?? null,
				installedAt: new Date(this.now()).toISOString(),
				scripts: plan.requiresScripts
			};
			await writeFileAtomic(join(this.options.runtime.dir, INSTALL_STATE_FILE), `${JSON.stringify({
				schemaVersion: 1,
				installs: records
			}, void 0, 2)}\n`, {
				mode: 384,
				dirMode: 448
			});
		} catch {}
		return {
			status: "succeeded",
			code: "succeeded",
			action: plan.action,
			profileName: this.options.runtime.profileName,
			packageName,
			requiresRestart: true,
			rollback: "not-needed",
			detail: null,
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
/** Catalog API mounts on webServer alone. Agent tools wait for tools + systemPrompt. */
const inject = ["webServer"];
const Config = z.object({
	catalogUrl: z.string().default(""),
	maxAgeMs: z.natural().min(1).default(1728e5),
	timeoutMs: z.natural().min(1).default(6e4),
	maxBytes: z.natural().min(1).default(15e6),
	agentTools: z.boolean().default(true)
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
	if (!isRecord(value) || typeof value.planId !== "string" || value.planId.length === 0 || value.allowScripts !== void 0 && typeof value.allowScripts !== "boolean") throw new ApiFailure(400, "request-invalid", "Invalid marketplace execute request.");
	return {
		planId: value.planId,
		...typeof value.allowScripts === "boolean" ? { allowScripts: value.allowScripts } : {}
	};
}
const INSTALLABILITY_FILTERS = /* @__PURE__ */ new Set([
	"all",
	"one-click-eligible",
	"manual"
]);
const CATEGORY_FILTERS = /* @__PURE__ */ new Set([
	"all",
	"uncategorized",
	...MARKETPLACE_CATEGORY_PRIORITY
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
					case "packs":
						value = listMarketplacePacks(catalog.view());
						break;
					case "packDetail":
						value = detailMarketplacePack(catalog.view(), operations.snapshot(), detailRequest(body.params));
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
	if (config.agentTools) ctx.inject(["tools", "systemPrompt"], (agentCtx) => {
		applyMarketplaceAgentTools(agentCtx, {
			catalog: () => catalog.view(),
			operations,
			capabilities
		});
	});
	ctx.effect(() => async () => {
		await operations.close();
		await catalog.close();
	}, "plugin-marketplace.close");
}
//#endregion
export { Config, MarketplaceCatalogParseError, apply, computeMarketplaceCatalogDigest, inject, name, parseMarketplaceCatalogText, sealMarketplaceCatalog };

//# sourceMappingURL=index.mjs.map