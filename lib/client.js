window.__ModuleLoader__.load({
	id: "@w2112515/dsh-plugin-marketplace",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/catalog-query.ts
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
		//#endregion
		//#region src/client/marketplace-adapter.ts
		/** Same-origin Host API to presentation-model adapter for the external marketplace bundle. */
		function toPluginRowModel(entry) {
			return {
				id: entry.repositoryId,
				name: entry.name,
				publisher: entry.publisher,
				author: entry.author,
				packageName: entry.packageName,
				packageVersion: entry.packageVersion,
				repositoryFullName: entry.repositoryFullName,
				repositoryUrl: entry.repositoryUrl,
				description: entry.description,
				license: entry.license,
				stars: entry.stars,
				repositoryCreatedAt: entry.repositoryCreatedAt,
				lastCodePushAt: entry.lastCodePushAt,
				firstSeenAt: entry.firstSeenAt,
				category: entry.category,
				installability: entry.installability,
				compatibility: entry.compatibility,
				freshness: entry.freshness,
				rating: entry.rating,
				voteUrl: entry.voteUrl
			};
		}
		function toListModel(response) {
			return {
				...response,
				items: response.items.map(toPluginRowModel)
			};
		}
		function toPluginDetailModel(response) {
			const entry = response.entry;
			if (entry === null) return null;
			return {
				id: entry.repositoryId,
				name: entry.package.name ?? entry.repository.fullName,
				description: entry.package.description,
				packageName: entry.package.name,
				packageVersion: entry.package.version,
				repositoryFullName: entry.repository.fullName,
				repositoryUrl: entry.repository.url,
				publisher: entry.repository.fullName.split("/")[0] ?? entry.repository.fullName,
				author: entry.package.author,
				license: entry.package.license,
				topics: entry.topics,
				keywords: entry.keywords,
				stars: entry.stars,
				repositoryCreatedAt: entry.repositoryCreatedAt,
				lastCodePushAt: entry.lastCodePushAt,
				firstSeenAt: entry.firstSeenAt,
				category: deriveMarketplaceCategory(entry),
				validationStatus: entry.validation.status,
				validationMessage: entry.validation.message,
				compatibility: entry.compatibility,
				installability: entry.installability,
				riskSignals: entry.riskSignals,
				installScripts: entry.installScripts,
				sourceRef: entry.source.ref,
				freshness: response.freshness ?? 0,
				rating: response.rating,
				voteUrl: response.voteUrl
			};
		}
		async function bootstrapMarketplace(remote, request) {
			const response = await remote.bootstrap(request);
			return {
				list: toListModel(response.list),
				operations: response.operations
			};
		}
		async function listMarketplace(remote, request) {
			return toListModel(await remote.list(request));
		}
		async function detailMarketplace(remote, repositoryId) {
			return toPluginDetailModel(await remote.detail({ repositoryId }));
		}
		async function refreshMarketplace(remote, request, currentDigest) {
			const response = await remote.refresh({
				request,
				currentDigest
			});
			return {
				...response,
				list: response.list === null ? null : toListModel(response.list)
			};
		}
		function readOperationSnapshot(remote) {
			return remote.operationSnapshot();
		}
		function installedMarketplace(remote) {
			return remote.installed();
		}
		function planMarketplaceOperation(remote, request) {
			return remote.plan(request);
		}
		function executeMarketplaceOperation(remote, planId, allowScripts = false) {
			return remote.execute({
				planId,
				...allowScripts ? { allowScripts: true } : {}
			});
		}
		function listMarketplacePacks(remote) {
			return remote.packs();
		}
		function detailMarketplacePack(remote, repositoryId) {
			return remote.packDetail({ repositoryId });
		}
		//#endregion
		//#region \0marketplace-css:src/client/PluginMarketplaceSettingsTab.module.css.mjs
		const css = ".ArH6fa_section{width:100%;min-width:0;max-width:860px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}.ArH6fa_status,.ArH6fa_failure p,.ArH6fa_detailSection h4,.ArH6fa_detailSection p,.ArH6fa_detailTitle p,.ArH6fa_operationHeading h4,.ArH6fa_operationHeading p,.ArH6fa_reviewBox p,.ArH6fa_capabilityNotice,.ArH6fa_capabilityReady,.ArH6fa_restartNotice,.ArH6fa_operationSuccess,.ArH6fa_operationFailure,.ArH6fa_installReason{margin:0}.ArH6fa_status,.ArH6fa_failureDetail,.ArH6fa_freshness,.ArH6fa_filterLabel,.ArH6fa_rowPeople,.ArH6fa_rowMeta,.ArH6fa_detailByline,.ArH6fa_detailPackage,.ArH6fa_operationHeading p,.ArH6fa_installReason{color:var(--dsw-alias-label-tertiary)}.ArH6fa_status,.ArH6fa_failure,.ArH6fa_detailSection p{font-size:13px;line-height:20px}.ArH6fa_skeletonList{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;flex-direction:column;gap:1px;display:flex;overflow:hidden}.ArH6fa_skeletonList div{background:var(--dsw-alias-bg-layer-1);height:118px}.ArH6fa_failure{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary));flex-direction:column;align-items:flex-start;gap:8px;display:flex}.ArH6fa_failure button,.ArH6fa_refreshButton,.ArH6fa_filterButton,.ArH6fa_primaryButton,.ArH6fa_secondaryButton,.ArH6fa_dangerButton{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border-radius:6px}.ArH6fa_inlineError{color:var(--dsw-alias-state-error-primary);margin:-4px 0 0;font-size:12px;line-height:18px}.ArH6fa_statusBar,.ArH6fa_controls,.ArH6fa_filterGroup,.ArH6fa_sortControl,.ArH6fa_rowMeta,.ArH6fa_rowAction,.ArH6fa_actionRow,.ArH6fa_pagination{align-items:center;display:flex}.ArH6fa_viewTabs{border-bottom:1px solid var(--dsw-alias-border-l2);flex-wrap:wrap;gap:2px;display:flex}.ArH6fa_viewTab{color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer;background:0 0;border:0;border-bottom:2px solid #0000;padding:6px 10px;font-size:13px;line-height:20px}.ArH6fa_viewTab:hover{color:var(--dsw-alias-label-primary)}.ArH6fa_viewTab[data-active=true]{border-bottom-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary);font-weight:600}.ArH6fa_statusBar{flex-wrap:wrap;gap:6px 10px;font-size:12px;line-height:18px}.ArH6fa_resultCount{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}.ArH6fa_freshness{overflow-wrap:anywhere;flex:180px;min-width:0}.ArH6fa_refreshButton{flex:none;align-items:center;gap:5px;min-height:28px;padding:3px 9px;font-size:12px;display:inline-flex}.ArH6fa_search{width:100%;min-width:0;color:var(--dsw-alias-label-tertiary);align-items:center;display:flex;position:relative}.ArH6fa_search>svg{pointer-events:none;position:absolute;left:12px}.ArH6fa_search input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:100%;min-width:0;height:36px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;outline:none;padding:0 34px 0 36px;font-size:13px}.ArH6fa_clearSearch{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);background:0 0;border:0;border-radius:5px;justify-content:center;align-items:center;display:inline-flex;position:absolute;right:6px}.ArH6fa_controls{flex-wrap:wrap;gap:8px 14px}.ArH6fa_filterGroup{flex-wrap:wrap;gap:5px}.ArH6fa_filterLabel{font-size:12px;line-height:18px}.ArH6fa_filterButton{min-height:26px;padding:2px 8px;font-size:12px}.ArH6fa_filterCount{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;margin-left:2px}.ArH6fa_filterButton[data-active=true]{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);color:var(--dsw-alias-state-business-primary)}.ArH6fa_sortControl{gap:6px;margin-left:auto}.ArH6fa_sortControl select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-width:0;height:28px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:6px;padding:0 6px;font-size:12px}.ArH6fa_rows{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;flex-direction:column;margin:0;padding:0;list-style:none;display:flex;overflow:hidden}.ArH6fa_row{border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;min-width:0;display:grid}.ArH6fa_row:first-child{border-top:0}.ArH6fa_rowOpen{min-width:0;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;padding:12px 14px}.ArH6fa_rowStatic{min-width:0;padding:12px 14px}.ArH6fa_rowMain{align-items:flex-start;gap:10px;min-width:0;display:flex}.ArH6fa_avatar,.ArH6fa_avatarFallback{border-radius:8px;flex:none;width:40px;height:40px}.ArH6fa_avatar{border:1px solid var(--dsw-alias-border-l2);object-fit:cover;background:var(--dsw-alias-bg-layer-1);display:block}.ArH6fa_avatarFallback{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);color:var(--dsw-alias-state-business-primary);justify-content:center;align-items:center;font-size:16px;font-weight:600;display:inline-flex}.ArH6fa_rowHeading{flex-wrap:wrap;align-items:center;gap:4px 8px;min-width:0;display:flex}.ArH6fa_categoryChip{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);border-radius:999px;flex:none;padding:1px 7px;font-size:11px;line-height:16px}.ArH6fa_updateBadge{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);color:var(--dsw-alias-state-success-primary);border-radius:999px;flex:none;padding:2px 7px;font-size:11px;line-height:18px}.ArH6fa_freshness{align-items:center;gap:5px;display:inline-flex}.ArH6fa_freshnessCells{gap:2px;display:inline-flex}.ArH6fa_freshnessCell{background:var(--dsw-alias-bg-layer-3);border-radius:2px;width:9px;height:8px;overflow:hidden}.ArH6fa_freshnessCellFill{background:var(--dsw-alias-state-business-primary);height:100%;display:block}.ArH6fa_freshnessValue{font-variant-numeric:tabular-nums}.ArH6fa_ratingChip{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);color:var(--dsw-alias-state-business-primary);border-radius:999px;flex:none;padding:1px 7px;font-size:11px;line-height:16px}.ArH6fa_ratingHint{color:var(--dsw-alias-label-tertiary);margin:6px 0 0;font-size:12px}.ArH6fa_voteLink{color:var(--dsw-alias-label-secondary);white-space:nowrap;border-radius:6px;flex:none;align-self:center;align-items:center;gap:3px;padding:4px 8px;font-size:12px;line-height:16px;text-decoration:none;display:inline-flex}.ArH6fa_voteLink:hover{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-state-business-primary)}.ArH6fa_relationChip{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);border-radius:999px;flex:none;padding:1px 7px;font-size:11px;line-height:16px}.ArH6fa_rowOpen:hover{background:var(--dsw-alias-interactive-bg-hover)}.ArH6fa_rowPrimary{flex-direction:column;gap:2px;min-width:0;display:flex}.ArH6fa_rowTitle{-webkit-line-clamp:2;overflow-wrap:anywhere;-webkit-box-orient:vertical;font-size:14px;font-weight:600;line-height:19px;display:-webkit-box;overflow:hidden}.ArH6fa_rowPeople,.ArH6fa_rowPackage,.ArH6fa_rowMeta{font-size:11px;line-height:16px}.ArH6fa_rowPackage{color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);text-overflow:ellipsis;white-space:nowrap;display:block;overflow:hidden}.ArH6fa_rowDescription{-webkit-line-clamp:2;color:var(--dsw-alias-label-secondary);-webkit-box-orient:vertical;margin-top:2px;font-size:12px;line-height:18px;display:-webkit-box;overflow:hidden}.ArH6fa_rowMeta{font-variant-numeric:tabular-nums;flex-wrap:wrap;gap:3px 12px;margin-top:2px}.ArH6fa_rowAction{flex-wrap:wrap;flex:none;justify-content:flex-end;gap:6px;max-width:220px;padding:12px 14px 12px 0}.ArH6fa_primaryButton,.ArH6fa_secondaryButton,.ArH6fa_dangerButton{min-height:30px;padding:4px 10px;font-size:12px;line-height:18px}.ArH6fa_primaryButton{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-on-primary,white)}.ArH6fa_dangerButton{color:var(--dsw-alias-state-error-primary)}a.ArH6fa_secondaryButton{align-items:center;gap:5px;text-decoration:none;display:inline-flex}.ArH6fa_detail{flex-direction:column;gap:12px;min-width:0;display:flex}.ArH6fa_backButton{color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border:0;border-radius:6px;align-self:flex-start;align-items:center;gap:4px;padding:4px 8px 4px 4px;font-size:13px;display:inline-flex}.ArH6fa_detailContent{flex-direction:column;gap:12px;min-width:0;display:flex}.ArH6fa_detailTitle{min-width:0}.ArH6fa_detailName{overflow-wrap:anywhere;margin:0;font-size:18px;line-height:26px}.ArH6fa_detailHeading{align-items:center;gap:10px;min-width:0;display:flex}.ArH6fa_detailHeadingText{flex:auto;min-width:0}.ArH6fa_detailByline,.ArH6fa_detailPackage{overflow-wrap:anywhere;font-size:12px;line-height:18px}.ArH6fa_detailPackage{font-family:var(--ds-font-family-code);margin-top:6px}.ArH6fa_externalHeading{color:var(--dsw-alias-label-secondary);margin:8px 0 0;font-size:13px;line-height:20px}.ArH6fa_packGrid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;display:grid}.ArH6fa_packCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);min-width:0;color:inherit;font:inherit;text-align:left;cursor:pointer;border-radius:8px;flex-direction:column;align-items:flex-start;gap:4px;padding:12px 14px;display:flex}.ArH6fa_packCard:hover{background:var(--dsw-alias-interactive-bg-hover)}.ArH6fa_packCard:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.ArH6fa_scriptReview{flex-direction:column;gap:6px;display:flex}.ArH6fa_scriptList{flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;display:flex}.ArH6fa_scriptList code{color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:11px}.ArH6fa_scriptList pre{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);font-family:var(--ds-font-family-code);white-space:pre-wrap;overflow-wrap:anywhere;border-radius:6px;margin:2px 0 0;padding:6px 8px;font-size:11px;line-height:16px;overflow-x:auto}.ArH6fa_consentRow{color:var(--dsw-alias-label-secondary);cursor:pointer;align-items:flex-start;gap:7px;font-size:12px;line-height:18px;display:flex}.ArH6fa_consentRow input{margin-top:2px}.ArH6fa_detailSection{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:5px;min-width:0;padding-top:10px;display:flex}.ArH6fa_detailSection h4{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.ArH6fa_detailSection p,.ArH6fa_factList dd,.ArH6fa_reviewFacts dd{overflow-wrap:anywhere}.ArH6fa_factList,.ArH6fa_reviewFacts{grid-template-columns:128px minmax(0,1fr);gap:5px 12px;margin:0;display:grid}.ArH6fa_factList div,.ArH6fa_reviewFacts div{display:contents}.ArH6fa_factList dt,.ArH6fa_reviewFacts dt{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.ArH6fa_factList dd,.ArH6fa_reviewFacts dd{min-width:0;margin:0;font-size:12px;line-height:18px}.ArH6fa_riskList{flex-wrap:wrap;gap:5px;margin:0;padding:0;list-style:none;display:flex}.ArH6fa_riskList li{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;border-radius:4px;padding:1px 5px;font-size:11px}.ArH6fa_githubLink{color:var(--dsw-alias-state-business-primary);align-self:flex-start;align-items:center;gap:4px;font-size:13px;line-height:20px;text-decoration:none;display:inline-flex}.ArH6fa_operationPanel{z-index:1;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);min-width:0;box-shadow:0 -4px 16px color-mix(in srgb, var(--dsw-alias-bg-layer-1) 45%, transparent);border-radius:8px;flex-direction:column;gap:9px;padding:12px;display:flex;position:sticky;bottom:8px}.ArH6fa_operationHeading{justify-content:space-between;align-items:flex-start;gap:10px;display:flex}.ArH6fa_operationHeading h4{font-size:13px;line-height:20px}.ArH6fa_operationHeading p,.ArH6fa_capabilityNotice,.ArH6fa_capabilityReady,.ArH6fa_installReason{font-size:12px;line-height:18px}.ArH6fa_capabilityNotice,.ArH6fa_restartNotice,.ArH6fa_operationSuccess,.ArH6fa_operationFailure{border-radius:6px;padding:7px 8px}.ArH6fa_capabilityNotice,.ArH6fa_restartNotice{background:color-mix(in srgb, var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary)) 10%, transparent);color:var(--dsw-alias-label-secondary)}.ArH6fa_capabilityReady,.ArH6fa_operationSuccess{color:var(--dsw-alias-state-success-primary)}.ArH6fa_operationFailure{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);color:var(--dsw-alias-state-error-primary)}.ArH6fa_stateBadge{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);color:var(--dsw-alias-state-business-primary);border-radius:999px;flex:none;padding:2px 7px;font-size:11px;line-height:18px}.ArH6fa_reviewBox{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:6px;flex-direction:column;gap:8px;padding:10px;font-size:12px;line-height:18px;display:flex}.ArH6fa_warningList{color:var(--dsw-alias-label-secondary);flex-direction:column;gap:3px;margin:0;padding-left:18px;display:flex}.ArH6fa_actionRow{flex-wrap:wrap;gap:7px}.ArH6fa_pagination{color:var(--dsw-alias-label-tertiary);flex-wrap:wrap;justify-content:center;gap:8px;font-size:12px}.ArH6fa_visuallyHidden{clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}.ArH6fa_failure button:hover:not(:disabled),.ArH6fa_refreshButton:hover:not(:disabled),.ArH6fa_filterButton:hover:not(:disabled),.ArH6fa_secondaryButton:hover:not(:disabled),.ArH6fa_dangerButton:hover:not(:disabled),.ArH6fa_backButton:hover,.ArH6fa_githubLink:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.ArH6fa_githubLink:hover{background:0 0;text-decoration:underline}.ArH6fa_primaryButton:hover:not(:disabled){filter:brightness(.96)}.ArH6fa_failure button:disabled,.ArH6fa_refreshButton:disabled,.ArH6fa_primaryButton:disabled,.ArH6fa_secondaryButton:disabled,.ArH6fa_dangerButton:disabled{cursor:default;opacity:.55}.ArH6fa_rowOpen:focus-visible,.ArH6fa_viewTab:focus-visible,.ArH6fa_search input:focus-visible,.ArH6fa_clearSearch:focus-visible,.ArH6fa_failure button:focus-visible,.ArH6fa_refreshButton:focus-visible,.ArH6fa_filterButton:focus-visible,.ArH6fa_sortControl select:focus-visible,.ArH6fa_primaryButton:focus-visible,.ArH6fa_secondaryButton:focus-visible,.ArH6fa_dangerButton:focus-visible,.ArH6fa_backButton:focus-visible,.ArH6fa_githubLink:focus-visible,.ArH6fa_detailName:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}@media (width<=520px){.ArH6fa_sortControl{margin-left:0}.ArH6fa_row{grid-template-columns:minmax(0,1fr);gap:0}.ArH6fa_rowAction{max-width:none;padding:0 14px 12px}.ArH6fa_rowAction button{width:100%}.ArH6fa_factList,.ArH6fa_reviewFacts{grid-template-columns:minmax(0,1fr);gap:2px}.ArH6fa_factList div,.ArH6fa_reviewFacts div{display:block}.ArH6fa_operationHeading{flex-direction:column}}";
		const tagId = "@w2112515/dsh-plugin-marketplace/PluginMarketplaceSettingsTab.module.css";
		if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@w2112515/dsh-plugin-marketplace";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var PluginMarketplaceSettingsTab_module_css_default = {
			"actionRow": "ArH6fa_actionRow",
			"avatar": "ArH6fa_avatar",
			"avatarFallback": "ArH6fa_avatarFallback",
			"backButton": "ArH6fa_backButton",
			"capabilityNotice": "ArH6fa_capabilityNotice",
			"capabilityReady": "ArH6fa_capabilityReady",
			"categoryChip": "ArH6fa_categoryChip",
			"clearSearch": "ArH6fa_clearSearch",
			"consentRow": "ArH6fa_consentRow",
			"controls": "ArH6fa_controls",
			"dangerButton": "ArH6fa_dangerButton",
			"detail": "ArH6fa_detail",
			"detailByline": "ArH6fa_detailByline",
			"detailContent": "ArH6fa_detailContent",
			"detailHeading": "ArH6fa_detailHeading",
			"detailHeadingText": "ArH6fa_detailHeadingText",
			"detailName": "ArH6fa_detailName",
			"detailPackage": "ArH6fa_detailPackage",
			"detailSection": "ArH6fa_detailSection",
			"detailTitle": "ArH6fa_detailTitle",
			"externalHeading": "ArH6fa_externalHeading",
			"factList": "ArH6fa_factList",
			"failure": "ArH6fa_failure",
			"failureDetail": "ArH6fa_failureDetail",
			"filterButton": "ArH6fa_filterButton",
			"filterCount": "ArH6fa_filterCount",
			"filterGroup": "ArH6fa_filterGroup",
			"filterLabel": "ArH6fa_filterLabel",
			"freshness": "ArH6fa_freshness",
			"freshnessCell": "ArH6fa_freshnessCell",
			"freshnessCellFill": "ArH6fa_freshnessCellFill",
			"freshnessCells": "ArH6fa_freshnessCells",
			"freshnessValue": "ArH6fa_freshnessValue",
			"githubLink": "ArH6fa_githubLink",
			"inlineError": "ArH6fa_inlineError",
			"installReason": "ArH6fa_installReason",
			"operationFailure": "ArH6fa_operationFailure",
			"operationHeading": "ArH6fa_operationHeading",
			"operationPanel": "ArH6fa_operationPanel",
			"operationSuccess": "ArH6fa_operationSuccess",
			"packCard": "ArH6fa_packCard",
			"packGrid": "ArH6fa_packGrid",
			"pagination": "ArH6fa_pagination",
			"primaryButton": "ArH6fa_primaryButton",
			"ratingChip": "ArH6fa_ratingChip",
			"ratingHint": "ArH6fa_ratingHint",
			"refreshButton": "ArH6fa_refreshButton",
			"relationChip": "ArH6fa_relationChip",
			"restartNotice": "ArH6fa_restartNotice",
			"resultCount": "ArH6fa_resultCount",
			"reviewBox": "ArH6fa_reviewBox",
			"reviewFacts": "ArH6fa_reviewFacts",
			"riskList": "ArH6fa_riskList",
			"row": "ArH6fa_row",
			"rowAction": "ArH6fa_rowAction",
			"rowDescription": "ArH6fa_rowDescription",
			"rowHeading": "ArH6fa_rowHeading",
			"rowMain": "ArH6fa_rowMain",
			"rowMeta": "ArH6fa_rowMeta",
			"rowOpen": "ArH6fa_rowOpen",
			"rowPackage": "ArH6fa_rowPackage",
			"rowPeople": "ArH6fa_rowPeople",
			"rowPrimary": "ArH6fa_rowPrimary",
			"rows": "ArH6fa_rows",
			"rowStatic": "ArH6fa_rowStatic",
			"rowTitle": "ArH6fa_rowTitle",
			"scriptList": "ArH6fa_scriptList",
			"scriptReview": "ArH6fa_scriptReview",
			"search": "ArH6fa_search",
			"secondaryButton": "ArH6fa_secondaryButton",
			"section": "ArH6fa_section",
			"skeletonList": "ArH6fa_skeletonList",
			"sortControl": "ArH6fa_sortControl",
			"stateBadge": "ArH6fa_stateBadge",
			"status": "ArH6fa_status",
			"statusBar": "ArH6fa_statusBar",
			"updateBadge": "ArH6fa_updateBadge",
			"viewTab": "ArH6fa_viewTab",
			"viewTabs": "ArH6fa_viewTabs",
			"visuallyHidden": "ArH6fa_visuallyHidden",
			"voteLink": "ArH6fa_voteLink",
			"warningList": "ArH6fa_warningList"
		};
		//#endregion
		//#region src/client/PluginMarketplaceSettingsTab.tsx
		function formatTime(iso, locale) {
			const time = Date.parse(iso);
			return Number.isNaN(time) ? iso : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(time);
		}
		function requestFor(query, category, filter, sort, page) {
			return {
				query: query.trim(),
				category: category === "packs" ? "all" : category,
				installability: filter === "one-click" ? "one-click-eligible" : filter,
				sort: sort === "updated" ? "recently-updated" : sort === "added" ? "recently-added" : sort,
				page
			};
		}
		const CATEGORY_KEYS = {
			theme: "category.theme",
			ui: "category.ui",
			tool: "category.tool",
			memory: "category.memory",
			provider: "category.provider",
			usage: "category.usage",
			skill: "category.skill",
			security: "category.security",
			channel: "category.channel"
		};
		const ACTION_KEYS = {
			install: "operation.action.install",
			update: "operation.action.update",
			remove: "operation.action.remove"
		};
		const STATE_KEYS = {
			"not-installed": "operation.state.not-installed",
			active: "operation.state.active",
			"pending-install": "operation.state.pending-install",
			"pending-update": "operation.state.pending-update",
			"pending-removal": "operation.state.pending-removal",
			"installed-inactive": "operation.state.installed-inactive"
		};
		const WARNING_KEYS = {
			"compatibility-unknown": "operation.warning.compatibility",
			"git-source": "operation.warning.git",
			"code-executes-on-restart": "operation.warning.code",
			"install-scripts-disabled": "operation.warning.scripts",
			"install-scripts-run": "operation.warning.scriptsRun",
			"restart-required": "operation.warning.restart",
			"origin-differs": "operation.warning.origin"
		};
		const RISK_KEYS = {
			"repository-archived": "risk.repository-archived",
			"git-source": "risk.git-source",
			"unpinned-source": "risk.unpinned-source",
			"lifecycle-script": "risk.lifecycle-script",
			"build-script": "risk.build-script"
		};
		function canChangeProfile(profile) {
			return profile !== null && profile.capabilities.profileWritable && profile.capabilities.packageManager !== "unavailable";
		}
		/**
		* Five-cell maintenance meter, each cell one fifth of the freshness score.
		* Fill is continuous, not quantized: 73% renders three full cells, one at
		* 65%, one empty — the meter shrinks exactly as much as the score does.
		*/
		function FreshnessMeter({ value, t }) {
			const clamped = Math.min(1, Math.max(0, value));
			const percent = Math.round(clamped * 100);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: PluginMarketplaceSettingsTab_module_css_default.freshness,
				title: t("freshness.title", { percent }),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: PluginMarketplaceSettingsTab_module_css_default.freshnessCells,
					"aria-hidden": "true",
					children: [
						0,
						1,
						2,
						3,
						4
					].map((cell) => {
						const fill = Math.round(Math.min(1, Math.max(0, clamped * 5 - cell)) * 1e3) / 10;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.freshnessCell,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.freshnessCellFill,
								style: { width: `${String(fill)}%` }
							})
						}, cell);
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: PluginMarketplaceSettingsTab_module_css_default.freshnessValue,
					children: t("freshness.value", { percent })
				})]
			});
		}
		/** Community verdict chip for rows; rendered only at or above the ten-vote rule. */
		function RatingChip({ rating, t }) {
			const total = rating.up + rating.down;
			if (total < 10) return null;
			const percent = Math.round(100 * rating.up / total);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: PluginMarketplaceSettingsTab_module_css_default.ratingChip,
				title: t("rating.votes", { count: total }),
				children: t("rating.chip", { percent })
			});
		}
		function isRestartPending(state) {
			return state === "pending-install" || state === "pending-update" || state === "pending-removal";
		}
		function CategoryChip({ category, t }) {
			if (category === null) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: PluginMarketplaceSettingsTab_module_css_default.categoryChip,
				children: t(CATEGORY_KEYS[category])
			});
		}
		/** GitHub owner avatar with an honest letter-tile fallback when the image cannot load. */
		function PluginAvatar({ publisher, name }) {
			const [failed, setFailed] = (0, react.useState)(false);
			if (failed) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: PluginMarketplaceSettingsTab_module_css_default.avatarFallback,
				"aria-hidden": "true",
				children: name.trim().charAt(0).toUpperCase() || "?"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
				className: PluginMarketplaceSettingsTab_module_css_default.avatar,
				src: `https://github.com/${encodeURIComponent(publisher)}.png?size=64`,
				alt: "",
				loading: "lazy",
				onError: () => {
					setFailed(true);
				}
			});
		}
		function CapabilityNotice({ profile, t }) {
			if (profile === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: PluginMarketplaceSettingsTab_module_css_default.capabilityNotice,
				children: t("operation.capability.checking")
			});
			const { capabilities } = profile;
			if (!capabilities.profileWritable) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: PluginMarketplaceSettingsTab_module_css_default.capabilityNotice,
				children: capabilities.message ?? t("operation.capability.profileReadOnly")
			});
			if (capabilities.packageManager === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: PluginMarketplaceSettingsTab_module_css_default.capabilityNotice,
				children: capabilities.message ?? t("operation.capability.pnpmMissing")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: PluginMarketplaceSettingsTab_module_css_default.capabilityReady,
				children: t(capabilities.packageManager === "corepack-pnpm" ? "operation.capability.corepackReady" : "operation.capability.ready")
			});
		}
		function PluginRow({ plugin, state, t, dateLocale, onOpen, onInstall, rowRef, canInstall }) {
			const manual = plugin.installability === "manual";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: PluginMarketplaceSettingsTab_module_css_default.row,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					ref: (node) => {
						rowRef(plugin.id, node);
					},
					className: PluginMarketplaceSettingsTab_module_css_default.rowOpen,
					type: "button",
					"data-plugin-id": plugin.id,
					onClick: () => {
						onOpen(plugin.id);
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: PluginMarketplaceSettingsTab_module_css_default.rowMain,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginAvatar, {
							publisher: plugin.publisher,
							name: plugin.name
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.rowPrimary,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.rowHeading,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
										className: PluginMarketplaceSettingsTab_module_css_default.rowTitle,
										title: plugin.name,
										children: plugin.name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CategoryChip, {
										category: plugin.category,
										t
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.rowPeople,
									children: [
										t("row.publisher", { publisher: plugin.publisher }),
										plugin.author && plugin.author !== plugin.publisher ? ` · ${t("row.author", { author: plugin.author })}` : "",
										" · ",
										t("card.stars", { count: plugin.stars })
									]
								}),
								plugin.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.rowDescription,
									children: plugin.description
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.rowMeta,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FreshnessMeter, {
											value: plugin.freshness,
											t
										}),
										plugin.rating !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RatingChip, {
											rating: plugin.rating,
											t
										}) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("card.pushed", { time: formatTime(plugin.lastCodePushAt, dateLocale()) }) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("card.published", { time: formatTime(plugin.repositoryCreatedAt, dateLocale()) }) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: plugin.license ?? t("detail.license.missing") })
									]
								})
							]
						})]
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.rowAction,
					children: [plugin.voteUrl !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
						className: PluginMarketplaceSettingsTab_module_css_default.voteLink,
						href: plugin.voteUrl,
						target: "_blank",
						rel: "noreferrer noopener",
						title: t("rating.hint"),
						children: [t("rating.voteShort"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline14, { "aria-hidden": "true" })]
					}) : null, state !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: PluginMarketplaceSettingsTab_module_css_default.stateBadge,
						children: t(STATE_KEYS[state.state])
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
						onClick: () => {
							onOpen(plugin.id);
						},
						children: t("row.manage")
					})] }) : manual ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
						onClick: () => {
							onOpen(plugin.id);
						},
						children: t("row.manualAction")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
						disabled: !canInstall,
						title: canInstall ? void 0 : t("operation.capability.unavailableTitle"),
						onClick: () => {
							onInstall(plugin.id);
						},
						children: t("row.installAction")
					})]
				})]
			});
		}
		function OperationPanel({ plugin, profile, t, planOperation, executeOperation, onSnapshot, activateTab, initialAction, onInitialActionConsumed }) {
			const pluginState = profile?.plugins.find((entry) => entry.repositoryId === plugin.id);
			const [review, setReview] = (0, react.useState)(null);
			const [result, setResult] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [working, setWorking] = (0, react.useState)(false);
			const [consent, setConsent] = (0, react.useState)(false);
			const restartPending = isRestartPending(pluginState?.state);
			const installed = pluginState?.installedSpec !== null && pluginState?.installedSpec !== void 0;
			const canInstall = canChangeProfile(profile);
			const scriptGated = plugin.installability === "manual" && plugin.installScripts !== null;
			const requestPlan = (action) => {
				setWorking(true);
				setError(null);
				setResult(null);
				setConsent(false);
				planOperation({
					repositoryId: plugin.id,
					action
				}).then(setReview).catch((cause) => {
					setError(cause instanceof Error ? cause.message : String(cause));
				}).finally(() => {
					setWorking(false);
				});
			};
			(0, react.useEffect)(() => {
				if (initialAction === null) return;
				onInitialActionConsumed();
				if (initialAction === "install" && canInstall && !installed && !restartPending) requestPlan("install");
				if (initialAction === "remove" && canInstall && installed && !restartPending) requestPlan("remove");
			}, [initialAction]);
			const confirm = () => {
				if (review?.planId === null || review?.planId === void 0) return;
				if (review.requiresScripts && !consent) return;
				setWorking(true);
				setError(null);
				executeOperation(review.planId, review.requiresScripts).then((next) => {
					setResult(next);
					onSnapshot(next.snapshot);
					if (next.status === "succeeded") setReview(null);
				}).catch((cause) => {
					setError(cause instanceof Error ? cause.message : String(cause));
				}).finally(() => {
					setWorking(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
				className: PluginMarketplaceSettingsTab_module_css_default.operationPanel,
				"aria-label": t("install.title"),
				"aria-busy": working,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PluginMarketplaceSettingsTab_module_css_default.operationHeading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("install.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: profile ? t("operation.profile", { profile: profile.profileName }) : t("operation.loading") })] }), pluginState ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.stateBadge,
							children: t(STATE_KEYS[pluginState.state])
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CapabilityNotice, {
						profile,
						t
					}),
					restartPending ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.restartNotice,
						role: "status",
						children: t("operation.restartPending")
					}) : null,
					result ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: result.status === "succeeded" ? PluginMarketplaceSettingsTab_module_css_default.operationSuccess : PluginMarketplaceSettingsTab_module_css_default.operationFailure,
						role: "status",
						children: result.status === "succeeded" ? t("operation.succeeded", { action: t(ACTION_KEYS[result.action ?? "install"]) }) : t("operation.failed", {
							code: result.code,
							rollback: result.rollback
						})
					}) : null,
					result?.status === "failed" && result.detail !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: PluginMarketplaceSettingsTab_module_css_default.failureDetail,
						role: "status",
						children: result.detail
					}) : null,
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.operationFailure,
						role: "alert",
						children: t("operation.transportError", { error })
					}) : null,
					review?.status === "blocked" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PluginMarketplaceSettingsTab_module_css_default.reviewBox,
						role: "status",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("operation.blocked") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("operation.blockedReason", { code: review.blockCode ?? "unknown" }) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
								onClick: () => {
									setReview(null);
								},
								children: t("operation.dismiss")
							})
						]
					}) : null,
					review?.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PluginMarketplaceSettingsTab_module_css_default.reviewBox,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("operation.reviewTitle") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
								className: PluginMarketplaceSettingsTab_module_css_default.reviewFacts,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("operation.reviewAction") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: t(ACTION_KEYS[review.action ?? "install"]) })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("operation.reviewProfile") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: review.profileName })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("operation.reviewPackage") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: [
										review.packageName,
										" · ",
										review.packageVersion
									] })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("operation.reviewCommit") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: review.commitSha }) })] })
								]
							}),
							review.requiresScripts && review.installScripts !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: PluginMarketplaceSettingsTab_module_css_default.scriptReview,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("scripts.title") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
										className: PluginMarketplaceSettingsTab_module_css_default.scriptList,
										children: Object.entries(review.installScripts).map(([name, body]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: body })] }, name))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: PluginMarketplaceSettingsTab_module_css_default.consentRow,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: consent,
											onChange: (event) => {
												setConsent(event.currentTarget.checked);
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("scripts.consent") })]
									})
								]
							}) : null,
							review.warnings.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: PluginMarketplaceSettingsTab_module_css_default.warningList,
								children: review.warnings.map((warning) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t(WARNING_KEYS[warning]) }, warning))
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: PluginMarketplaceSettingsTab_module_css_default.actionRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
									disabled: working || review.requiresScripts && !consent,
									onClick: confirm,
									children: working ? t("operation.working") : t("operation.confirm")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
									disabled: working,
									onClick: () => {
										setReview(null);
									},
									children: t("operation.cancel")
								})]
							})
						]
					}) : null,
					review === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PluginMarketplaceSettingsTab_module_css_default.actionRow,
						children: [
							!installed && plugin.installability === "one-click-eligible" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
								disabled: working || restartPending || !canInstall,
								onClick: () => {
									requestPlan("install");
								},
								children: t("install.action")
							}) : null,
							!installed && scriptGated ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
								disabled: working || restartPending || !canInstall,
								onClick: () => {
									requestPlan("install");
								},
								children: t("install.actionScripted")
							}) : null,
							!installed && plugin.installability !== "one-click-eligible" && !scriptGated ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
								className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
								href: plugin.repositoryUrl,
								target: "_blank",
								rel: "noreferrer noopener",
								children: [t("row.manualAction"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline14, { "aria-hidden": "true" })]
							}) : null,
							installed && pluginState?.updateAvailable && !restartPending ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
								disabled: working || !canInstall,
								onClick: () => {
									requestPlan("install");
								},
								children: t("operation.update")
							}) : null,
							pluginState?.state === "active" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
								onClick: () => {
									activateTab("configurable");
								},
								children: t("operation.configure")
							}) : null,
							installed && !restartPending ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PluginMarketplaceSettingsTab_module_css_default.dangerButton,
								disabled: working || !canInstall,
								onClick: () => {
									requestPlan("remove");
								},
								children: t("operation.remove")
							}) : null
						]
					}) : null,
					pluginState?.state === "active" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.installReason,
						children: t("operation.configureHint")
					}) : null,
					!installed && scriptGated ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.installReason,
						children: t("install.scriptedHint")
					}) : null,
					!installed && plugin.installability !== "one-click-eligible" && !scriptGated ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.installReason,
						children: t("install.unavailable")
					}) : null
				]
			});
		}
		/** Detail-page community rating: Steam-style overall and trailing-90-day lines. */
		function RatingSection({ plugin, t }) {
			const rating = plugin.rating;
			if (rating === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("rating.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("rating.pending") })]
			});
			const line = (up, count) => {
				if (count === 0) return t("rating.none");
				if (count < 10) return t("rating.insufficient", { count });
				return `${t("rating.positive", { percent: Math.round(100 * up / count) })} · ${t("rating.votes", { count })}`;
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("rating.title") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
						className: PluginMarketplaceSettingsTab_module_css_default.factList,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("rating.overall") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: line(rating.up, rating.up + rating.down) })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("rating.recent") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: line(rating.upRecent, rating.upRecent + rating.downRecent) })] })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.ratingHint,
						children: t("rating.hint")
					}),
					plugin.voteUrl !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
						className: PluginMarketplaceSettingsTab_module_css_default.githubLink,
						href: plugin.voteUrl,
						target: "_blank",
						rel: "noreferrer noopener",
						children: [t("rating.vote"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline14, { "aria-hidden": "true" })]
					}) : null
				]
			});
		}
		function PluginDetail({ plugin, profile, t, dateLocale, onBack, planOperation, executeOperation, onSnapshot, activateTab, initialAction, onInitialActionConsumed }) {
			const headingRef = (0, react.useRef)(null);
			const visibleRisks = plugin.riskSignals.filter((risk) => risk !== "git-source");
			(0, react.useEffect)(() => {
				headingRef.current?.focus();
			}, [plugin.id]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: PluginMarketplaceSettingsTab_module_css_default.detail,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: PluginMarketplaceSettingsTab_module_css_default.backButton,
						type: "button",
						onClick: onBack,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, { "aria-hidden": "true" }), t("detail.back")]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PluginMarketplaceSettingsTab_module_css_default.detailContent,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
								className: PluginMarketplaceSettingsTab_module_css_default.detailTitle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: PluginMarketplaceSettingsTab_module_css_default.detailHeading,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginAvatar, {
											publisher: plugin.publisher,
											name: plugin.name
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: PluginMarketplaceSettingsTab_module_css_default.detailHeadingText,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
												ref: headingRef,
												tabIndex: -1,
												className: PluginMarketplaceSettingsTab_module_css_default.detailName,
												children: plugin.name
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
												className: PluginMarketplaceSettingsTab_module_css_default.detailByline,
												children: [
													t("row.publisher", { publisher: plugin.publisher }),
													plugin.author && plugin.author !== plugin.publisher ? ` · ${t("row.author", { author: plugin.author })}` : "",
													" · ",
													t("card.stars", { count: plugin.stars })
												]
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CategoryChip, {
											category: plugin.category,
											t
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: PluginMarketplaceSettingsTab_module_css_default.detailPackage,
									children: [plugin.packageName ?? plugin.repositoryFullName, plugin.packageVersion ? ` · ${plugin.packageVersion}` : ""]
								})]
							}),
							plugin.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("detail.about") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: plugin.description })]
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("detail.activity") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
									className: PluginMarketplaceSettingsTab_module_css_default.factList,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("freshness.label") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FreshnessMeter, {
											value: plugin.freshness,
											t
										}) })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("detail.stars.label") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: t("card.stars", { count: plugin.stars }) })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("detail.created") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatTime(plugin.repositoryCreatedAt, dateLocale()) })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("detail.pushed") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatTime(plugin.lastCodePushAt, dateLocale()) })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("detail.firstSeen") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatTime(plugin.firstSeenAt, dateLocale()) })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("detail.license") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: plugin.license ?? t("detail.license.missing") })] })
									]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RatingSection, {
								plugin,
								t
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("detail.validation") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [t(`detail.validation.${plugin.validationStatus}`), plugin.validationMessage ? ` · ${plugin.validationMessage}` : ""] })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("detail.compatibility") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(`compatibility.${plugin.compatibility}`) })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("detail.source") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("detail.source.git", { ref: plugin.sourceRef }) })]
							}),
							visibleRisks.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("detail.risks") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									className: PluginMarketplaceSettingsTab_module_css_default.riskList,
									children: visibleRisks.map((risk) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t(RISK_KEYS[risk]) }, risk))
								})]
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
								className: PluginMarketplaceSettingsTab_module_css_default.githubLink,
								href: plugin.repositoryUrl,
								target: "_blank",
								rel: "noreferrer noopener",
								children: [t("detail.viewOnGithub"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline14, { "aria-hidden": "true" })]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OperationPanel, {
						plugin,
						profile,
						t,
						planOperation,
						executeOperation,
						onSnapshot,
						activateTab,
						initialAction,
						onInitialActionConsumed
					})
				]
			});
		}
		function installedCategory(item) {
			return item.plugin?.category ?? null;
		}
		function sortInstalledItems(items, sort) {
			const copy = [...items];
			const byName = (left, right) => (left.plugin?.name ?? left.state.packageName ?? "").localeCompare(right.plugin?.name ?? right.state.packageName ?? "", "en");
			if (sort === "name") return copy.sort(byName);
			if (sort === "updated") return copy.sort((left, right) => Date.parse(right.plugin?.lastCodePushAt ?? "") - Date.parse(left.plugin?.lastCodePushAt ?? "") || byName(left, right));
			return copy.sort((left, right) => Number(right.state.updateAvailable) - Number(left.state.updateAvailable) || byName(left, right));
		}
		function RelationChip({ state, t }) {
			if (state.updateAvailable) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: PluginMarketplaceSettingsTab_module_css_default.updateBadge,
				children: t("installed.updateAvailable")
			});
			if (state.catalogRelation === "diverged") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: PluginMarketplaceSettingsTab_module_css_default.relationChip,
				title: t("installed.divergedHint"),
				children: t("installed.diverged")
			});
			if (state.catalogRelation === "not-in-catalog") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: PluginMarketplaceSettingsTab_module_css_default.relationChip,
				title: t("installed.notInCatalogHint"),
				children: t("installed.notInCatalog")
			});
			return null;
		}
		function InstalledRow({ item, t, dateLocale, canInstall, onOpen, onUpdate, onRemove, onConfigure }) {
			const { state, plugin } = item;
			const name = plugin?.name ?? state.packageName ?? plugin?.repositoryFullName ?? state.installedRepository ?? "";
			const specOwner = state.installedRepository?.split("/")[0] ?? null;
			const pending = isRestartPending(state.state);
			const manageable = plugin !== null && state.repositoryId !== null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: PluginMarketplaceSettingsTab_module_css_default.row,
				children: [plugin === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.rowStatic,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: PluginMarketplaceSettingsTab_module_css_default.rowMain,
						children: [specOwner === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.avatarFallback,
							"aria-hidden": "true",
							children: name.trim().charAt(0).toUpperCase() || "?"
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginAvatar, {
							publisher: specOwner,
							name
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.rowPrimary,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.rowHeading,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
										className: PluginMarketplaceSettingsTab_module_css_default.rowTitle,
										children: name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RelationChip, {
										state,
										t
									})]
								}),
								state.installedRepository !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.rowPeople,
									children: t("row.publisher", { publisher: specOwner ?? "" })
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.rowMeta,
									children: [state.installedVersion !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("installed.version", { version: state.installedVersion }) }) : null, state.installedRepository !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
										className: PluginMarketplaceSettingsTab_module_css_default.rowPackage,
										children: state.installedRepository
									}) : null]
								})
							]
						})]
					})
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: PluginMarketplaceSettingsTab_module_css_default.rowOpen,
					type: "button",
					onClick: () => {
						onOpen(state.repositoryId);
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: PluginMarketplaceSettingsTab_module_css_default.rowMain,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginAvatar, {
							publisher: plugin.publisher,
							name
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.rowPrimary,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.rowHeading,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
											className: PluginMarketplaceSettingsTab_module_css_default.rowTitle,
											title: name,
											children: name
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CategoryChip, {
											category: plugin.category,
											t
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RelationChip, {
											state,
											t
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.rowPeople,
									children: [
										t("row.publisher", { publisher: plugin.publisher }),
										" · ",
										t("card.stars", { count: plugin.stars })
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.rowMeta,
									children: [state.installedVersion !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("installed.version", { version: state.installedVersion }) }) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("card.pushed", { time: formatTime(plugin.lastCodePushAt, dateLocale()) }) })]
								})
							]
						})]
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.rowAction,
					children: [
						plugin !== null && plugin.voteUrl !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
							className: PluginMarketplaceSettingsTab_module_css_default.voteLink,
							href: plugin.voteUrl,
							target: "_blank",
							rel: "noreferrer noopener",
							title: t("rating.hint"),
							children: [t("rating.voteShort"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline14, { "aria-hidden": "true" })]
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.stateBadge,
							children: t(STATE_KEYS[state.state])
						}),
						manageable && state.updateAvailable && !pending ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
							disabled: !canInstall,
							title: canInstall ? void 0 : t("operation.capability.unavailableTitle"),
							onClick: () => {
								onUpdate(state.repositoryId);
							},
							children: t("operation.update")
						}) : null,
						state.state === "active" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
							onClick: onConfigure,
							children: t("operation.configure")
						}) : null,
						manageable && !pending ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: PluginMarketplaceSettingsTab_module_css_default.dangerButton,
							disabled: !canInstall,
							title: canInstall ? void 0 : t("operation.capability.unavailableTitle"),
							onClick: () => {
								onRemove(state.repositoryId);
							},
							children: t("operation.remove")
						}) : null
					]
				})]
			});
		}
		function ExternalRow({ item, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: PluginMarketplaceSettingsTab_module_css_default.row,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.rowStatic,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: PluginMarketplaceSettingsTab_module_css_default.rowMain,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.avatarFallback,
							"aria-hidden": "true",
							children: item.packageName.trim().charAt(0).toUpperCase() || "?"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.rowPrimary,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.rowHeading,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									className: PluginMarketplaceSettingsTab_module_css_default.rowTitle,
									title: item.packageName,
									children: item.packageName
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.rowMeta,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
									className: PluginMarketplaceSettingsTab_module_css_default.rowPackage,
									children: item.installedSpec ?? ""
								})
							})]
						})]
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.rowAction,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: PluginMarketplaceSettingsTab_module_css_default.stateBadge,
						children: t(item.activeAfterRestart ? "operation.state.active" : "operation.state.installed-inactive")
					})
				})]
			});
		}
		const PACK_STATUS_KEYS = {
			installable: "pack.item.installable",
			"script-gated": "pack.item.scriptGated",
			manual: "pack.item.manual",
			unavailable: "pack.item.unavailable",
			installed: "pack.item.installed"
		};
		/** One-line install composition for a pack card: "7 一键 · 2 需审脚本 · 1 手动". */
		function packCompositionLine(pack, t) {
			const segments = [];
			if (pack.composition.oneClick > 0) segments.push(t("pack.composition.oneClick", { count: pack.composition.oneClick }));
			if (pack.composition.scriptGated > 0) segments.push(t("pack.composition.scriptGated", { count: pack.composition.scriptGated }));
			if (pack.composition.manual > 0) segments.push(t("pack.composition.manual", { count: pack.composition.manual }));
			if (pack.composition.unavailable > 0) segments.push(t("pack.composition.unavailable", { count: pack.composition.unavailable }));
			return segments.join(" · ");
		}
		function PackListView({ packs, query, t, onOpen }) {
			const words = query.trim().toLowerCase();
			const visible = words.length === 0 ? packs : packs.filter((pack) => [
				pack.name,
				pack.publisher,
				pack.repositoryFullName,
				pack.description ?? ""
			].some((text) => text.toLowerCase().includes(words)));
			if (visible.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: PluginMarketplaceSettingsTab_module_css_default.status,
				children: t("state.emptySearch")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: PluginMarketplaceSettingsTab_module_css_default.packGrid,
				children: visible.map((pack) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: PluginMarketplaceSettingsTab_module_css_default.packCard,
					onClick: () => {
						onOpen(pack.repositoryId);
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.rowHeading,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									className: PluginMarketplaceSettingsTab_module_css_default.rowTitle,
									title: pack.name,
									children: pack.name
								}),
								pack.featured ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.updateBadge,
									children: t("pack.featured")
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.relationChip,
									children: t("pack.itemCount", { count: pack.itemCount })
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.rowPeople,
							children: [
								t("row.publisher", { publisher: pack.publisher }),
								" · ",
								t("card.stars", { count: pack.stars })
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.rowMeta,
							children: packCompositionLine(pack, t)
						}),
						pack.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.rowDescription,
							children: pack.description
						}) : null
					]
				}, pack.repositoryId))
			});
		}
		function PackItemRow({ item, t, onOpenPlugin }) {
			const owner = item.fullName.split("/")[0] ?? item.fullName;
			const name = item.name ?? item.fullName;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: PluginMarketplaceSettingsTab_module_css_default.row,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.rowStatic,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: PluginMarketplaceSettingsTab_module_css_default.rowMain,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginAvatar, {
							publisher: owner,
							name
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.rowPrimary,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.rowHeading,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
										className: PluginMarketplaceSettingsTab_module_css_default.rowTitle,
										title: name,
										children: name
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: item.status === "installable" ? PluginMarketplaceSettingsTab_module_css_default.updateBadge : PluginMarketplaceSettingsTab_module_css_default.relationChip,
										children: t(PACK_STATUS_KEYS[item.status])
									}),
									item.status === "installed" && item.state !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: PluginMarketplaceSettingsTab_module_css_default.stateBadge,
										children: t(STATE_KEYS[item.state])
									}) : null
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.rowMeta,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
									className: PluginMarketplaceSettingsTab_module_css_default.rowPackage,
									children: item.fullName
								})
							})]
						})]
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.rowAction,
					children: [item.status === "script-gated" && item.repositoryId !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
						onClick: () => {
							onOpenPlugin(item.repositoryId);
						},
						children: t("pack.reviewScripts")
					}) : null, item.repositoryUrl !== null && (item.status === "manual" || item.status === "unavailable") ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
						className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
						href: item.repositoryUrl,
						target: "_blank",
						rel: "noreferrer noopener",
						children: [t("row.manualAction"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline14, { "aria-hidden": "true" })]
					}) : null]
				})]
			});
		}
		function PackDetailView({ detail, profile, t, onBack, planOperation, executeOperation, onSnapshot, onOpenPlugin, onChanged }) {
			const [working, setWorking] = (0, react.useState)(false);
			const [progress, setProgress] = (0, react.useState)(null);
			const [outcomes, setOutcomes] = (0, react.useState)(null);
			const pack = detail.pack;
			const items = detail.items;
			const installable = items.filter((item) => item.status === "installable" && item.repositoryId !== null);
			const canInstall = canChangeProfile(profile) && !profile?.busy;
			const anyRestartPending = (profile?.plugins ?? []).some((state) => isRestartPending(state.state));
			if (pack === null) return null;
			const runInstall = () => {
				setWorking(true);
				setOutcomes(null);
				(async () => {
					const collected = [];
					for (const [index, item] of installable.entries()) {
						const name = item.name ?? item.fullName;
						setProgress({
							index: index + 1,
							total: installable.length,
							name
						});
						try {
							const plan = await planOperation({
								repositoryId: item.repositoryId,
								action: "install"
							});
							if (plan.status !== "ready" || plan.planId === null) {
								collected.push({
									name,
									ok: false,
									code: plan.blockCode ?? "blocked"
								});
								break;
							}
							const result = await executeOperation(plan.planId);
							onSnapshot(result.snapshot);
							collected.push({
								name,
								ok: result.status === "succeeded",
								code: result.code
							});
							if (result.status !== "succeeded") break;
						} catch (cause) {
							collected.push({
								name,
								ok: false,
								code: cause instanceof Error ? cause.message : String(cause)
							});
							break;
						}
					}
					return collected;
				})().then((collected) => {
					setOutcomes(collected);
					if (collected.length > 0) onChanged();
				}).finally(() => {
					setProgress(null);
					setWorking(false);
				});
			};
			const skipped = outcomes === null ? 0 : installable.length - outcomes.length;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: PluginMarketplaceSettingsTab_module_css_default.detail,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: PluginMarketplaceSettingsTab_module_css_default.backButton,
						type: "button",
						onClick: onBack,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, { "aria-hidden": "true" }), t("detail.back")]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PluginMarketplaceSettingsTab_module_css_default.detailContent,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("header", {
								className: PluginMarketplaceSettingsTab_module_css_default.detailTitle,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: PluginMarketplaceSettingsTab_module_css_default.detailHeading,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginAvatar, {
										publisher: pack.publisher,
										name: pack.name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: PluginMarketplaceSettingsTab_module_css_default.detailHeadingText,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
											className: PluginMarketplaceSettingsTab_module_css_default.detailName,
											children: pack.name
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
											className: PluginMarketplaceSettingsTab_module_css_default.detailByline,
											children: [
												t("row.publisher", { publisher: pack.publisher }),
												" · ",
												t("card.stars", { count: pack.stars }),
												" · ",
												t("pack.itemCount", { count: items.length })
											]
										})]
									})]
								})
							}),
							pack.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("detail.about") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: pack.description })]
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
								className: PluginMarketplaceSettingsTab_module_css_default.githubLink,
								href: pack.repositoryUrl,
								target: "_blank",
								rel: "noreferrer noopener",
								children: [t("detail.viewOnGithub"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline14, { "aria-hidden": "true" })]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
						className: PluginMarketplaceSettingsTab_module_css_default.operationPanel,
						"aria-label": t("pack.installTitle"),
						"aria-busy": working,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: PluginMarketplaceSettingsTab_module_css_default.operationHeading,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("pack.installTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("pack.installSummary", {
									installable: installable.length,
									total: items.length
								}) })] })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CapabilityNotice, {
								profile,
								t
							}),
							anyRestartPending ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: PluginMarketplaceSettingsTab_module_css_default.restartNotice,
								role: "status",
								children: t("operation.restartPending")
							}) : null,
							progress !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: PluginMarketplaceSettingsTab_module_css_default.restartNotice,
								role: "status",
								children: t("pack.installing", {
									index: progress.index,
									total: progress.total,
									name: progress.name
								})
							}) : null,
							outcomes !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: PluginMarketplaceSettingsTab_module_css_default.reviewBox,
								role: "status",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("pack.resultTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ul", {
									className: PluginMarketplaceSettingsTab_module_css_default.warningList,
									children: [outcomes.map((outcome) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: outcome.ok ? t("pack.resultOk", { name: outcome.name }) : t("pack.resultFailed", {
										name: outcome.name,
										code: outcome.code
									}) }, outcome.name)), skipped > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t("pack.resultSkipped", { count: skipped }) }) : null]
								})]
							}) : null,
							items.some((item) => item.status === "script-gated") ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: PluginMarketplaceSettingsTab_module_css_default.installReason,
								children: t("pack.scriptGatedHint")
							}) : null,
							items.some((item) => item.status === "unavailable") ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: PluginMarketplaceSettingsTab_module_css_default.installReason,
								children: t("pack.unavailableHint")
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: PluginMarketplaceSettingsTab_module_css_default.actionRow,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
									disabled: working || !canInstall || anyRestartPending || installable.length === 0,
									onClick: runInstall,
									children: working ? t("operation.working") : t("pack.install", { count: installable.length })
								})
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: PluginMarketplaceSettingsTab_module_css_default.rows,
						children: items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PackItemRow, {
							item,
							t,
							onOpenPlugin
						}, item.fullName))
					})
				]
			});
		}
		function PluginMarketplaceSettingsTab({ bootstrap, list, detail, refresh, operationSnapshot, installed, packs, packDetail, plan, execute, activateTab, dateLocale, t }) {
			const [model, setModel] = (0, react.useState)(null);
			const [profile, setProfile] = (0, react.useState)(null);
			const [view, setView] = (0, react.useState)("discover");
			const [query, setQuery] = (0, react.useState)("");
			const [category, setCategory] = (0, react.useState)("all");
			const [filter, setFilter] = (0, react.useState)("all");
			const [sort, setSort] = (0, react.useState)("recommended");
			const [page, setPage] = (0, react.useState)(1);
			const [refreshing, setRefreshing] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [loadAttempt, setLoadAttempt] = (0, react.useState)(0);
			const [selectedId, setSelectedId] = (0, react.useState)(null);
			const [detailState, setDetailState] = (0, react.useState)({ status: "idle" });
			const [initialAction, setInitialAction] = (0, react.useState)(null);
			const [installedModel, setInstalledModel] = (0, react.useState)(null);
			const [installedError, setInstalledError] = (0, react.useState)(false);
			const [installedDirty, setInstalledDirty] = (0, react.useState)(true);
			const [installedCategoryFilter, setInstalledCategoryFilter] = (0, react.useState)("all");
			const [installedSort, setInstalledSort] = (0, react.useState)("updates");
			const [packsModel, setPacksModel] = (0, react.useState)(null);
			const [selectedPackId, setSelectedPackId] = (0, react.useState)(null);
			const [packDetailState, setPackDetailState] = (0, react.useState)({ status: "idle" });
			const [packReload, setPackReload] = (0, react.useState)(0);
			const bootstrapped = (0, react.useRef)(false);
			const rowNodes = (0, react.useRef)(/* @__PURE__ */ new Map());
			const request = (0, react.useMemo)(() => requestFor(query, category, filter, sort, page), [
				query,
				category,
				filter,
				sort,
				page
			]);
			(0, react.useEffect)(() => {
				let current = true;
				if (category === "packs") return () => {
					current = false;
				};
				if (!bootstrapped.current) bootstrap(request).then(({ list: next, operations }) => {
					if (!current) return;
					bootstrapped.current = true;
					setModel(next);
					setProfile(operations);
					setError(next.error?.message ?? null);
					refresh(request, next.digest).then((update) => {
						if (!current) return;
						if (update.list !== null) setModel(update.list);
						else setModel((previous) => previous === null ? previous : {
							...previous,
							source: update.source,
							stale: update.stale,
							lastSuccessfulFetchAt: update.lastSuccessfulFetchAt,
							error: update.error
						});
						setError(update.error?.message ?? null);
					}).catch((cause) => {
						if (current) setError(cause instanceof Error ? cause.message : String(cause));
					});
				}).catch((cause) => {
					if (current) setError(cause instanceof Error ? cause.message : String(cause));
				});
				else list(request).then((next) => {
					if (current) {
						setModel(next);
						setError(next.error?.message ?? null);
					}
				}).catch((cause) => {
					if (current) setError(cause instanceof Error ? cause.message : String(cause));
				});
				return () => {
					current = false;
				};
			}, [
				bootstrap,
				list,
				refresh,
				request,
				loadAttempt
			]);
			(0, react.useEffect)(() => {
				if (view !== "installed" || !installedDirty) return;
				let current = true;
				setInstalledError(false);
				installed().then((next) => {
					if (current) {
						setInstalledModel(next);
						setInstalledDirty(false);
					}
				}).catch(() => {
					if (current) {
						setInstalledError(true);
						setInstalledDirty(false);
					}
				});
				return () => {
					current = false;
				};
			}, [
				view,
				installed,
				installedDirty
			]);
			(0, react.useEffect)(() => {
				let current = true;
				packs().then((next) => {
					if (current) setPacksModel(next.packs);
				}).catch(() => {
					if (current) setPacksModel((previous) => previous ?? []);
				});
				return () => {
					current = false;
				};
			}, [packs, packReload]);
			(0, react.useEffect)(() => {
				if (selectedPackId === null) {
					setPackDetailState({ status: "idle" });
					return;
				}
				let current = true;
				setPackDetailState({ status: "loading" });
				packDetail(selectedPackId).then((next) => {
					if (!current) return;
					setPackDetailState(next.pack === null ? { status: "missing" } : {
						status: "ready",
						detail: next
					});
				}).catch(() => {
					if (current) setPackDetailState({ status: "error" });
				});
				return () => {
					current = false;
				};
			}, [
				packDetail,
				selectedPackId,
				packReload
			]);
			(0, react.useEffect)(() => {
				if (selectedId === null) {
					setDetailState({ status: "idle" });
					return;
				}
				let current = true;
				setDetailState({ status: "loading" });
				detail(selectedId).then((plugin) => {
					if (!current) return;
					setDetailState(plugin === null ? { status: "missing" } : {
						status: "ready",
						plugin
					});
				}).catch((cause) => {
					if (current) setDetailState({
						status: "error",
						message: cause instanceof Error ? cause.message : String(cause)
					});
				});
				return () => {
					current = false;
				};
			}, [detail, selectedId]);
			const onSnapshot = (snapshot) => {
				setProfile(snapshot);
				setInstalledDirty(true);
			};
			const onPackChanged = () => {
				setPackReload((count) => count + 1);
				setInstalledDirty(true);
			};
			const onRefresh = () => {
				if (model === null) return;
				setRefreshing(true);
				setError(null);
				refresh(request, model.digest).then((update) => {
					if (update.list !== null) setModel(update.list);
					else setModel((previous) => previous === null ? previous : {
						...previous,
						source: update.source,
						stale: update.stale,
						lastSuccessfulFetchAt: update.lastSuccessfulFetchAt,
						error: update.error
					});
					setError(update.error?.message ?? null);
					return operationSnapshot();
				}).then((snapshot) => {
					onSnapshot(snapshot);
					setPackReload((count) => count + 1);
				}).catch((cause) => {
					setError(cause instanceof Error ? cause.message : String(cause));
				}).finally(() => {
					setRefreshing(false);
				});
			};
			const rowRef = (id, node) => {
				if (node) rowNodes.current.set(id, node);
				else rowNodes.current.delete(id);
			};
			const openPlugin = (id) => {
				setInitialAction(null);
				setSelectedPackId(null);
				setSelectedId(id);
			};
			const installPlugin = (id) => {
				setInitialAction("install");
				setSelectedPackId(null);
				setSelectedId(id);
			};
			const removePlugin = (id) => {
				setInitialAction("remove");
				setSelectedPackId(null);
				setSelectedId(id);
			};
			const openPack = (id) => {
				setSelectedId(null);
				setInitialAction(null);
				setSelectedPackId(id);
			};
			const backToList = () => {
				const id = selectedId;
				setSelectedId(null);
				setSelectedPackId(null);
				setInitialAction(null);
				if (id !== null) requestAnimationFrame(() => {
					const node = rowNodes.current.get(id);
					node?.focus();
					node?.scrollIntoView?.({ block: "nearest" });
				});
			};
			const retryBootstrap = () => {
				bootstrapped.current = false;
				setModel(null);
				setError(null);
				setLoadAttempt((attempt) => attempt + 1);
			};
			if (selectedPackId !== null) {
				if (packDetailState.status === "ready" && packDetailState.detail.pack !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.section,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PackDetailView, {
						detail: packDetailState.detail,
						profile,
						t,
						onBack: backToList,
						planOperation: plan,
						executeOperation: execute,
						onSnapshot,
						onOpenPlugin: openPlugin,
						onChanged: onPackChanged
					})
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.section,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: PluginMarketplaceSettingsTab_module_css_default.backButton,
						type: "button",
						onClick: backToList,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, { "aria-hidden": "true" }), t("detail.back")]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.status,
						"aria-live": "polite",
						children: packDetailState.status === "loading" ? t("detail.loading") : t("detail.error")
					})]
				});
			}
			if (selectedId !== null) {
				if (detailState.status === "ready") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.section,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginDetail, {
						plugin: detailState.plugin,
						profile,
						t,
						dateLocale,
						onBack: backToList,
						planOperation: plan,
						executeOperation: execute,
						onSnapshot,
						activateTab,
						initialAction,
						onInitialActionConsumed: () => {
							setInitialAction(null);
						}
					})
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.section,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: PluginMarketplaceSettingsTab_module_css_default.backButton,
						type: "button",
						onClick: backToList,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, { "aria-hidden": "true" }), t("detail.back")]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.status,
						"aria-live": "polite",
						children: detailState.status === "loading" ? t("detail.loading") : t("detail.error")
					})]
				});
			}
			if (model === null) {
				if (error) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.section,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PluginMarketplaceSettingsTab_module_css_default.failure,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								role: "alert",
								children: t("state.error.title")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: PluginMarketplaceSettingsTab_module_css_default.failureDetail,
								children: t("state.error.detail")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: retryBootstrap,
								children: t("state.retry")
							})
						]
					})
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.section,
					"aria-busy": "true",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.status,
						children: t("state.loading")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PluginMarketplaceSettingsTab_module_css_default.skeletonList,
						"aria-hidden": "true",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {})
						]
					})]
				});
			}
			if (model.catalogStatus === "unavailable" && model.items.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: PluginMarketplaceSettingsTab_module_css_default.section,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.failure,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							role: "alert",
							children: t("state.error.title")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: PluginMarketplaceSettingsTab_module_css_default.failureDetail,
							children: t("state.error.detail")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: retryBootstrap,
							children: t("state.retry")
						})
					]
				})
			});
			const freshnessAt = model.lastSuccessfulFetchAt ?? model.generatedAt;
			const canInstall = canChangeProfile(profile);
			const profileStates = new Map((profile?.plugins ?? []).map((state) => [state.repositoryId, state]));
			const installedCount = (profile?.plugins.length ?? 0) + (profile?.external.length ?? 0);
			const categoryChips = [
				{
					value: "all",
					label: t("filter.all"),
					count: model.counts.all
				},
				...model.counts.packs > 0 ? [{
					value: "packs",
					label: t("filter.packs"),
					count: model.counts.packs
				}] : [],
				...MARKETPLACE_CATEGORY_PRIORITY.map((value) => ({
					value,
					label: t(CATEGORY_KEYS[value]),
					count: model.counts.categories[value]
				})).filter((chip) => chip.count > 0),
				...model.counts.uncategorized > 0 ? [{
					value: "uncategorized",
					label: t("category.uncategorized"),
					count: model.counts.uncategorized
				}] : []
			];
			const installedItems = installedModel?.items ?? [];
			const installedChips = [{
				value: "all",
				label: t("filter.all"),
				count: installedItems.length + (installedModel?.external.length ?? 0)
			}, ...MARKETPLACE_CATEGORY_PRIORITY.map((value) => ({
				value,
				label: t(CATEGORY_KEYS[value]),
				count: installedItems.filter((item) => installedCategory(item) === value).length
			})).filter((chip) => chip.count > 0)];
			const visibleInstalled = sortInstalledItems(installedCategoryFilter === "all" ? installedItems : installedItems.filter((item) => installedCategory(item) === installedCategoryFilter), installedSort);
			const visibleExternal = installedModel !== null && (installedCategoryFilter === "all" || installedCategoryFilter === "uncategorized") ? installedModel.external : [];
			const anyRestartPending = (profile?.plugins ?? []).some((state) => isRestartPending(state.state));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: PluginMarketplaceSettingsTab_module_css_default.section,
				"aria-busy": refreshing,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.viewTabs,
					role: "group",
					"aria-label": t("tab"),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: PluginMarketplaceSettingsTab_module_css_default.viewTab,
						"aria-pressed": view === "discover",
						"data-active": view === "discover",
						onClick: () => {
							setView("discover");
						},
						children: t("view.discover")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: PluginMarketplaceSettingsTab_module_css_default.viewTab,
						"aria-pressed": view === "installed",
						"data-active": view === "installed",
						onClick: () => {
							setView("installed");
						},
						children: [
							t("view.installed"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.filterCount,
								children: installedCount
							})
						]
					})]
				}), view === "discover" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					category !== "packs" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PluginMarketplaceSettingsTab_module_css_default.statusBar,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.resultCount,
								role: "status",
								"aria-live": "polite",
								children: t("results.count", { count: model.total })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.freshness,
								children: [
									freshnessAt ? t(model.source === "cache" ? "status.cached" : "status.updated", { time: formatTime(freshnessAt, dateLocale()) }) : null,
									model.stale ? ` · ${t("status.stale")}` : "",
									model.catalogStatus === "unavailable" ? ` · ${t("status.offline")}` : ""
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: PluginMarketplaceSettingsTab_module_css_default.refreshButton,
								type: "button",
								onClick: onRefresh,
								disabled: refreshing,
								"aria-label": t("refresh"),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, {
									size: 14,
									"aria-hidden": "true"
								}), refreshing ? t("refreshing") : t("refresh")]
							})
						]
					}) : null,
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.inlineError,
						role: "alert",
						children: t("status.refreshError")
					}) : null,
					!canInstall ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CapabilityNotice, {
						profile,
						t
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: PluginMarketplaceSettingsTab_module_css_default.search,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, { "aria-hidden": "true" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.visuallyHidden,
								children: t("search")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "search",
								value: query,
								placeholder: t("search"),
								onChange: (event) => {
									setQuery(event.currentTarget.value);
									setPage(1);
								}
							}),
							query.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: PluginMarketplaceSettingsTab_module_css_default.clearSearch,
								type: "button",
								"aria-label": t("clearSearch"),
								onClick: () => {
									setQuery("");
									setPage(1);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, {
									size: 12,
									"aria-hidden": "true"
								})
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PluginMarketplaceSettingsTab_module_css_default.controls,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: PluginMarketplaceSettingsTab_module_css_default.filterGroup,
							role: "group",
							"aria-label": t("category.label"),
							children: categoryChips.map((chip) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: PluginMarketplaceSettingsTab_module_css_default.filterButton,
								"aria-pressed": category === chip.value,
								"data-active": category === chip.value,
								onClick: () => {
									setCategory(chip.value);
									setPage(1);
								},
								children: [
									chip.label,
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: PluginMarketplaceSettingsTab_module_css_default.filterCount,
										children: chip.count
									})
								]
							}, chip.value))
						}), category !== "packs" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: PluginMarketplaceSettingsTab_module_css_default.sortControl,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.filterLabel,
								children: t("filter.installability")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								value: filter,
								onChange: (event) => {
									setFilter(event.currentTarget.value);
									setPage(1);
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
										value: "all",
										children: [
											t("filter.all"),
											" (",
											model.counts.all,
											")"
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
										value: "one-click",
										children: [
											t("filter.one-click"),
											" (",
											model.counts.oneClick,
											")"
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
										value: "manual",
										children: [
											t("filter.manual"),
											" (",
											model.counts.manual,
											")"
										]
									})
								]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: PluginMarketplaceSettingsTab_module_css_default.sortControl,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.filterLabel,
								children: t("sort.label")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								value: sort,
								onChange: (event) => {
									setSort(event.currentTarget.value);
									setPage(1);
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "recommended",
										children: t("sort.recommended")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "stars",
										children: t("sort.stars")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "updated",
										children: t("sort.updated")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "added",
										children: t("sort.added")
									})
								]
							})]
						})] }) : null]
					}),
					category === "packs" ? packsModel === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.status,
						children: t("installed.loading")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PackListView, {
						packs: packsModel,
						query,
						t,
						onOpen: openPack
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [model.total === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.status,
						children: query ? t("state.emptySearch") : t("state.empty")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: PluginMarketplaceSettingsTab_module_css_default.rows,
						children: model.items.map((plugin) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginRow, {
							plugin,
							state: profileStates.get(plugin.id),
							t,
							dateLocale,
							onOpen: openPlugin,
							onInstall: installPlugin,
							rowRef,
							canInstall
						}, plugin.id))
					}), model.pageCount > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("nav", {
						className: PluginMarketplaceSettingsTab_module_css_default.pagination,
						"aria-label": t("pagination.label"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
								disabled: model.page === 1,
								onClick: () => {
									setPage(model.page - 1);
								},
								children: t("pagination.previous")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-live": "polite",
								children: t("pagination.page", {
									page: model.page,
									total: model.pageCount
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
								disabled: model.page === model.pageCount,
								onClick: () => {
									setPage(model.page + 1);
								},
								children: t("pagination.next")
							})
						]
					}) : null] })
				] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					anyRestartPending ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.restartNotice,
						role: "status",
						children: t("operation.restartPending")
					}) : null,
					!canInstall ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CapabilityNotice, {
						profile,
						t
					}) : null,
					installedError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.inlineError,
						role: "alert",
						children: t("installed.error")
					}) : null,
					installedModel === null && !installedError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.status,
						children: t("installed.loading")
					}) : null,
					installedModel !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: PluginMarketplaceSettingsTab_module_css_default.controls,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: PluginMarketplaceSettingsTab_module_css_default.filterGroup,
								role: "group",
								"aria-label": t("category.label"),
								children: installedChips.map((chip) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: PluginMarketplaceSettingsTab_module_css_default.filterButton,
									"aria-pressed": installedCategoryFilter === chip.value,
									"data-active": installedCategoryFilter === chip.value,
									onClick: () => {
										setInstalledCategoryFilter(chip.value);
									},
									children: [
										chip.label,
										" ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: PluginMarketplaceSettingsTab_module_css_default.filterCount,
											children: chip.count
										})
									]
								}, chip.value))
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: PluginMarketplaceSettingsTab_module_css_default.sortControl,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.filterLabel,
									children: t("sort.label")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									value: installedSort,
									onChange: (event) => {
										setInstalledSort(event.currentTarget.value);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "updates",
											children: t("installed.sort.updates")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "name",
											children: t("installed.sort.name")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "updated",
											children: t("installed.sort.updated")
										})
									]
								})]
							})]
						}),
						visibleInstalled.length === 0 && visibleExternal.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: PluginMarketplaceSettingsTab_module_css_default.status,
							children: t("installed.empty")
						}) : null,
						visibleInstalled.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: PluginMarketplaceSettingsTab_module_css_default.rows,
							children: visibleInstalled.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InstalledRow, {
								item,
								t,
								dateLocale,
								canInstall,
								onOpen: openPlugin,
								onUpdate: installPlugin,
								onRemove: removePlugin,
								onConfigure: () => {
									activateTab("configurable");
								}
							}, item.state.repositoryId ?? item.state.packageName))
						}) : null,
						visibleExternal.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
								className: PluginMarketplaceSettingsTab_module_css_default.externalHeading,
								children: t("installed.external")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: PluginMarketplaceSettingsTab_module_css_default.status,
								children: t("installed.externalHint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: PluginMarketplaceSettingsTab_module_css_default.rows,
								children: visibleExternal.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ExternalRow, {
									item,
									t
								}, item.packageName))
							})
						] }) : null
					] }) : null
				] })]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Copy dictionaries for the read-only plugin Marketplace Settings tab. */
		/** Simplified Chinese dictionary and key source of truth. */
		const zh = {
			tab: "插件市场",
			"view.discover": "发现",
			"view.installed": "已安装",
			"category.label": "分类",
			"category.theme": "主题",
			"category.ui": "界面",
			"category.tool": "工具",
			"category.memory": "记忆",
			"category.provider": "模型接入",
			"category.usage": "用量",
			"category.skill": "技能",
			"category.security": "安全",
			"category.channel": "消息渠道",
			"category.uncategorized": "未分类",
			"installed.loading": "正在读取已安装列表…",
			"installed.error": "无法读取已安装列表，请切换分页重试。",
			"installed.empty": "当前 profile 尚未安装目录中的插件。",
			"installed.version": "版本 {version}",
			"installed.updateAvailable": "可更新",
			"installed.diverged": "与目录版本不同",
			"installed.divergedHint": "当前固定的提交与目录收录的提交不一致，无法判定新旧，因此不提供更新入口。",
			"installed.notInCatalog": "目录未收录",
			"installed.notInCatalogHint": "已安装的来源仓库不在当前目录中；请前往该仓库页面自行维护，或通过命令行卸载。",
			"installed.sort.updates": "可更新优先",
			"installed.sort.name": "按名称",
			"installed.sort.updated": "按最近更新",
			"installed.external": "目录之外的包",
			"installed.externalHint": "这些包通过其他途径进入当前 profile，插件市场无法自动管理，请按各自文档维护。",
			search: "搜索插件名称、描述、作者或关键词",
			clearSearch: "清除搜索",
			refresh: "刷新目录",
			refreshing: "正在刷新…",
			"status.updated": "更新于 {time}",
			"status.cached": "缓存于 {time}",
			"status.stale": "目录可能已过期",
			"status.offline": "当前离线，正在展示最近一次成功的目录",
			"status.refreshError": "刷新失败，已保留当前目录。",
			"results.count": "{count} 个插件",
			"filter.installability": "安装资格",
			"filter.all": "全部",
			"filter.packs": "整合方案",
			"filter.one-click": "可自动安装",
			"filter.manual": "手动安装",
			"compatibility.compatible": "兼容",
			"compatibility.incompatible": "不兼容",
			"compatibility.unknown": "兼容性未知",
			"sort.label": "排序",
			"sort.recommended": "推荐",
			"sort.stars": "Stars 最多",
			"sort.updated": "最近代码更新",
			"sort.added": "最近收录",
			"row.publisher": "发布者：{publisher}",
			"row.author": "作者：{author}",
			"row.installAction": "自动安装",
			"row.manualAction": "查看手动安装说明",
			"pagination.label": "目录分页",
			"pagination.previous": "上一页",
			"pagination.next": "下一页",
			"pagination.page": "第 {page} / {total} 页",
			"state.loading": "正在读取插件目录…",
			"state.empty": "目录中暂无插件。",
			"state.emptySearch": "没有匹配的插件。",
			"state.error.title": "暂时无法读取插件目录",
			"state.error.detail": "目录数据不可用，也没有可展示的缓存。你可以稍后重试。",
			"state.retry": "重试",
			"risk.repository-archived": "仓库已归档",
			"risk.git-source": "仅从 Git 源码分发",
			"risk.unpinned-source": "源码未固定版本",
			"risk.lifecycle-script": "含生命周期脚本",
			"risk.build-script": "含构建脚本",
			"card.stars": "{count} stars",
			"card.pushed": "更新于 {time}",
			"card.published": "发布于 {time}",
			"row.manage": "管理",
			"detail.back": "返回列表",
			"detail.loading": "正在读取插件详情…",
			"detail.error": "无法读取此插件详情。请返回列表后重试。",
			"detail.about": "用途",
			"detail.compatibility": "兼容性",
			"detail.validation": "静态校验",
			"detail.validation.valid": "Bundle 声明与补丁通过静态校验",
			"detail.validation.invalid": "未通过静态校验",
			"detail.validation.archived": "仓库已归档",
			"detail.source": "来源",
			"detail.source.git": "Git 源码 · {ref}",
			"detail.risks": "风险信号",
			"detail.activity": "活跃度",
			"freshness.label": "新鲜度",
			"freshness.title": "维护新鲜度 {percent}%：刚更新为 100%，一年未更新 50%，三年未维护归零",
			"freshness.value": "{percent}%",
			"rating.title": "社区评分",
			"rating.overall": "总评分",
			"rating.recent": "近 90 天",
			"rating.positive": "{percent}% 好评",
			"rating.votes": "{count} 票",
			"rating.insufficient": "票数不足（{count}/10），暂不计分",
			"rating.none": "暂无评分",
			"rating.hint": "评分即 GitHub 表情投票（👍/👎），每张票对应真实 GitHub 账号；满 10 票才显示结论。",
			"rating.vote": "前往 GitHub 评分",
			"rating.voteShort": "去评分",
			"rating.pending": "该插件的评分通道将随下次目录更新开放。",
			"rating.chip": "👍 {percent}%",
			"detail.stars.label": "Stars",
			"detail.created": "仓库创建",
			"detail.pushed": "最近代码提交",
			"detail.firstSeen": "收录时间",
			"detail.license": "许可证",
			"detail.license.missing": "未声明",
			"detail.viewOnGithub": "在 GitHub 查看",
			"install.title": "安装",
			"install.unavailable": "该条目未达到安全的自动安装条件，请先在 GitHub 查看说明。",
			"install.action": "自动安装",
			"install.actionScripted": "运行脚本安装",
			"install.scriptedHint": "该插件未随仓库提供构建产物，安装时需要运行其声明的脚本；确认前可逐条审阅脚本内容。",
			"scripts.title": "该插件声明了以下安装脚本",
			"scripts.consent": "我已逐条阅读并信任上述脚本，允许本次安装运行它们。",
			"pack.featured": "推荐",
			"pack.composition.oneClick": "{count} 一键",
			"pack.composition.scriptGated": "{count} 需审脚本",
			"pack.composition.manual": "{count} 手动",
			"pack.composition.unavailable": "{count} 未收录",
			"pack.itemCount": "{count} 个插件",
			"pack.installTitle": "安装整合方案",
			"pack.installSummary": "可自动安装 {installable} 项，共 {total} 项",
			"pack.install": "自动安装 {count} 个插件",
			"pack.installing": "正在安装第 {index}/{total} 项：{name}",
			"pack.resultTitle": "安装结果",
			"pack.resultOk": "{name}：已写入 profile",
			"pack.resultFailed": "{name}：失败（{code}），已停止后续安装",
			"pack.resultSkipped": "{count} 项因前序失败而未执行",
			"pack.scriptGatedHint": "标注“需确认脚本”的插件包含安装脚本，请进入其详情页逐条审阅后单独安装；整合安装不会代为同意。",
			"pack.unavailableHint": "标注“未收录”的插件不在目录中，整合安装会跳过它们，请按各自仓库说明手动安装。",
			"pack.reviewScripts": "审阅脚本并安装",
			"pack.item.installable": "将自动安装",
			"pack.item.scriptGated": "需确认脚本",
			"pack.item.manual": "需手动安装",
			"pack.item.unavailable": "未收录",
			"pack.item.installed": "已在 profile 中",
			"operation.profile": "将修改当前 WebUI 的 {profile} profile",
			"operation.loading": "正在读取当前 profile 状态…",
			"operation.capability.checking": "正在读取当前 profile 的安装能力…",
			"operation.capability.ready": "Host 已确认 pnpm 可用且 profile 可写。",
			"operation.capability.corepackReady": "Host 将通过 Corepack 使用 pnpm，且 profile 可写。",
			"operation.capability.pnpmMissing": "Host 未找到可用的 pnpm/Corepack，因此不能自动修改 profile。",
			"operation.capability.profileReadOnly": "当前 profile 不可写，因此不能自动修改。",
			"operation.capability.unavailableTitle": "Host 尚未确认当前 profile 可以安全地自动安装。",
			"operation.state.not-installed": "未安装",
			"operation.state.active": "运行中",
			"operation.state.pending-install": "待重启启用",
			"operation.state.pending-update": "待重启更新",
			"operation.state.pending-removal": "待重启移除",
			"operation.state.installed-inactive": "已安装未启用",
			"operation.restartPending": "profile 已更新。请重启 DSH WebUI，使运行中的插件树与磁盘状态一致。",
			"operation.succeeded": "{action}已写入 profile；重启后生效。",
			"operation.failed": "操作失败（{code}）；回滚状态：{rollback}。",
			"operation.transportError": "无法完成操作：{error}",
			"operation.blocked": "Host 已阻止该操作",
			"operation.blockedReason": "原因：{code}。目录或 profile 状态可能已经变化，请刷新后重试。",
			"operation.dismiss": "知道了",
			"operation.reviewTitle": "确认 profile 变更",
			"operation.reviewAction": "操作",
			"operation.reviewProfile": "Profile",
			"operation.reviewPackage": "包",
			"operation.reviewCommit": "固定提交",
			"operation.warning.compatibility": "兼容性尚无可验证声明。",
			"operation.warning.git": "包直接来自 GitHub Git 源码。",
			"operation.warning.code": "插件代码会在下次启动时进入 DSH 进程。",
			"operation.warning.scripts": "安装阶段已禁用第三方生命周期脚本。",
			"operation.warning.scriptsRun": "安装阶段将运行上方列出的第三方脚本，仅限本次固定的提交。",
			"operation.warning.restart": "提交后必须重启 WebUI 才会生效。",
			"operation.warning.origin": "当前安装的同名插件来自另一个仓库，继续将替换为它。",
			"operation.action.install": "安装",
			"operation.action.update": "更新",
			"operation.action.remove": "卸载",
			"operation.working": "处理中…",
			"operation.confirm": "确认并写入 profile",
			"operation.cancel": "取消",
			"operation.update": "更新插件",
			"operation.configure": "打开配置",
			"operation.remove": "卸载插件",
			"operation.configureHint": "插件提供 Web 配置时会出现在“可配置”页；否则请按仓库说明编辑 profile patch。"
		};
		/** English dictionary checked against the Chinese key set. */
		const en = {
			tab: "Marketplace",
			"view.discover": "Discover",
			"view.installed": "Installed",
			"category.label": "Category",
			"category.theme": "Themes",
			"category.ui": "UI",
			"category.tool": "Tools",
			"category.memory": "Memory",
			"category.provider": "Providers",
			"category.usage": "Usage",
			"category.skill": "Skills",
			"category.security": "Security",
			"category.channel": "Channels",
			"category.uncategorized": "Uncategorized",
			"installed.loading": "Loading installed plugins…",
			"installed.error": "The installed list could not be read. Switch views to retry.",
			"installed.empty": "No catalog plugins are installed in this profile yet.",
			"installed.version": "Version {version}",
			"installed.updateAvailable": "Update available",
			"installed.diverged": "Differs from catalog",
			"installed.divergedHint": "The pinned commit differs from the catalog pin and the direction cannot be proven, so no update is offered.",
			"installed.notInCatalog": "Not in catalog",
			"installed.notInCatalogHint": "The installed repository is not in the catalog; maintain it from its repository page, or uninstall via the CLI.",
			"installed.sort.updates": "Updates first",
			"installed.sort.name": "By name",
			"installed.sort.updated": "By recently updated",
			"installed.external": "Packages outside the catalog",
			"installed.externalHint": "These packages entered the profile outside the catalog and cannot be managed here; maintain them per their own documentation.",
			search: "Search plugin names, descriptions, authors, or keywords",
			clearSearch: "Clear search",
			refresh: "Refresh catalog",
			refreshing: "Refreshing…",
			"status.updated": "Updated {time}",
			"status.cached": "Cached {time}",
			"status.stale": "The catalog may be stale",
			"status.offline": "Offline — showing the last successful catalog",
			"status.refreshError": "Refresh failed; the current catalog was preserved.",
			"results.count": "{count} plugins",
			"filter.installability": "Eligibility",
			"filter.all": "All",
			"filter.packs": "Solution packs",
			"filter.one-click": "Automatic install",
			"filter.manual": "Manual",
			"compatibility.compatible": "Compatible",
			"compatibility.incompatible": "Incompatible",
			"compatibility.unknown": "Compatibility unknown",
			"sort.label": "Sort",
			"sort.recommended": "Recommended",
			"sort.stars": "Most stars",
			"sort.updated": "Recently updated",
			"sort.added": "Recently added",
			"row.publisher": "Publisher: {publisher}",
			"row.author": "Author: {author}",
			"row.installAction": "Install automatically",
			"row.manualAction": "View manual instructions",
			"pagination.label": "Catalog pagination",
			"pagination.previous": "Previous",
			"pagination.next": "Next",
			"pagination.page": "Page {page} of {total}",
			"state.loading": "Loading the plugin catalog…",
			"state.empty": "The catalog has no plugins yet.",
			"state.emptySearch": "No plugins match.",
			"state.error.title": "The plugin catalog is temporarily unavailable",
			"state.error.detail": "Catalog data could not be read and no cache is available. You can retry.",
			"state.retry": "Retry",
			"risk.repository-archived": "Repository archived",
			"risk.git-source": "Distributed as Git source only",
			"risk.unpinned-source": "Unpinned source",
			"risk.lifecycle-script": "Lifecycle scripts present",
			"risk.build-script": "Build scripts present",
			"card.stars": "{count} stars",
			"card.pushed": "Updated {time}",
			"card.published": "Published {time}",
			"row.manage": "Manage",
			"detail.back": "Back to list",
			"detail.loading": "Loading plugin details…",
			"detail.error": "This plugin detail could not be read. Return to the list and try again.",
			"detail.about": "About",
			"detail.compatibility": "Compatibility",
			"detail.validation": "Static validation",
			"detail.validation.valid": "Bundle declaration and patch passed static validation",
			"detail.validation.invalid": "Static validation failed",
			"detail.validation.archived": "Repository archived",
			"detail.source": "Source",
			"detail.source.git": "Git source · {ref}",
			"detail.risks": "Risk signals",
			"detail.activity": "Activity",
			"freshness.label": "Freshness",
			"freshness.title": "Maintenance freshness {percent}%: 100% when just updated, 50% after one silent year, zero after three",
			"freshness.value": "{percent}%",
			"rating.title": "Community rating",
			"rating.overall": "Overall",
			"rating.recent": "Last 90 days",
			"rating.positive": "{percent}% positive",
			"rating.votes": "{count} votes",
			"rating.insufficient": "Too few votes ({count}/10) — no verdict yet",
			"rating.none": "No votes yet",
			"rating.hint": "Votes are GitHub 👍/👎 reactions tied to real GitHub accounts; a verdict appears only at 10 or more votes.",
			"rating.vote": "Rate on GitHub",
			"rating.voteShort": "Rate",
			"rating.pending": "Voting for this plugin opens with the next catalog update.",
			"rating.chip": "👍 {percent}%",
			"detail.stars.label": "Stars",
			"detail.created": "Repository created",
			"detail.pushed": "Last code push",
			"detail.firstSeen": "First indexed",
			"detail.license": "License",
			"detail.license.missing": "Not declared",
			"detail.viewOnGithub": "View on GitHub",
			"install.title": "Install",
			"install.unavailable": "This entry does not meet safe automatic-install criteria. Review its GitHub instructions first.",
			"install.action": "Install automatically",
			"install.actionScripted": "Install with scripts",
			"install.scriptedHint": "This plugin does not ship built output, so installation must run its declared scripts. Review every script before confirming.",
			"scripts.title": "This plugin declares the following install scripts",
			"scripts.consent": "I have read and trust the scripts above, and allow them to run for this install.",
			"pack.featured": "Featured",
			"pack.composition.oneClick": "{count} one-click",
			"pack.composition.scriptGated": "{count} script-review",
			"pack.composition.manual": "{count} manual",
			"pack.composition.unavailable": "{count} not in catalog",
			"pack.itemCount": "{count} plugins",
			"pack.installTitle": "Install solution pack",
			"pack.installSummary": "{installable} of {total} items can be installed automatically",
			"pack.install": "Install {count} plugins",
			"pack.installing": "Installing {index}/{total}: {name}",
			"pack.resultTitle": "Install results",
			"pack.resultOk": "{name}: written to the profile",
			"pack.resultFailed": "{name}: failed ({code}); remaining items stopped",
			"pack.resultSkipped": "{count} items not attempted after an earlier failure",
			"pack.scriptGatedHint": "Plugins marked \"needs script review\" declare install scripts. Open each detail page to review and install it individually — pack installs never consent on your behalf.",
			"pack.unavailableHint": "Plugins marked \"not in catalog\" are skipped by pack installs; follow their repository instructions to install them manually.",
			"pack.reviewScripts": "Review scripts and install",
			"pack.item.installable": "Will auto-install",
			"pack.item.scriptGated": "Needs script review",
			"pack.item.manual": "Manual install",
			"pack.item.unavailable": "Not in catalog",
			"pack.item.installed": "In profile",
			"operation.profile": "Changes the {profile} profile that booted this WebUI",
			"operation.loading": "Reading the current profile state…",
			"operation.capability.checking": "Reading installation capability for the current profile…",
			"operation.capability.ready": "Host confirmed pnpm is available and the profile is writable.",
			"operation.capability.corepackReady": "Host will use pnpm through Corepack and the profile is writable.",
			"operation.capability.pnpmMissing": "Host cannot find usable pnpm or Corepack, so it cannot change the profile automatically.",
			"operation.capability.profileReadOnly": "The current profile is not writable, so it cannot be changed automatically.",
			"operation.capability.unavailableTitle": "Host has not confirmed that this profile can be changed safely.",
			"operation.state.not-installed": "Not installed",
			"operation.state.active": "Active",
			"operation.state.pending-install": "Enable on restart",
			"operation.state.pending-update": "Update on restart",
			"operation.state.pending-removal": "Remove on restart",
			"operation.state.installed-inactive": "Installed, inactive",
			"operation.restartPending": "The profile is updated. Restart DSH WebUI so the running plugin tree matches disk state.",
			"operation.succeeded": "{action} was written to the profile; restart to apply it.",
			"operation.failed": "Operation failed ({code}); rollback status: {rollback}.",
			"operation.transportError": "Could not complete the operation: {error}",
			"operation.blocked": "The Host blocked this operation",
			"operation.blockedReason": "Reason: {code}. The catalog or profile may have changed; refresh and retry.",
			"operation.dismiss": "Dismiss",
			"operation.reviewTitle": "Review profile change",
			"operation.reviewAction": "Action",
			"operation.reviewProfile": "Profile",
			"operation.reviewPackage": "Package",
			"operation.reviewCommit": "Pinned commit",
			"operation.warning.compatibility": "No verifiable compatibility declaration is available.",
			"operation.warning.git": "The package comes directly from GitHub Git source.",
			"operation.warning.code": "Plugin code enters the DSH process on the next launch.",
			"operation.warning.scripts": "Third-party lifecycle scripts are disabled during installation.",
			"operation.warning.scriptsRun": "The scripts listed above will run during installation, pinned to this exact commit only.",
			"operation.warning.restart": "You must restart WebUI after committing this change.",
			"operation.warning.origin": "The installed same-name plugin comes from a different repository and will be replaced.",
			"operation.action.install": "Install",
			"operation.action.update": "Update",
			"operation.action.remove": "Remove",
			"operation.working": "Working…",
			"operation.confirm": "Confirm and update profile",
			"operation.cancel": "Cancel",
			"operation.update": "Update plugin",
			"operation.configure": "Open configuration",
			"operation.remove": "Remove plugin",
			"operation.configureHint": "Plugin-provided Web settings appear under Configurable; otherwise follow the repository instructions to edit the profile patch."
		};
		//#endregion
		//#region src/client/index.ts
		const NS = "settings.pluginMarketplace";
		const inject = ["slots", "locale"];
		async function apiCall(method, params) {
			const response = await fetch("/api/plugin-marketplace", {
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					method,
					...params === void 0 ? {} : { params }
				})
			});
			const result = await response.json();
			if (!response.ok || !result.ok) {
				const message = result.ok ? `Marketplace API returned HTTP ${String(response.status)}` : result.error.message;
				throw new Error(message);
			}
			return result.value;
		}
		const remote = {
			bootstrap: (request) => apiCall("bootstrap", request),
			list: (request) => apiCall("list", request),
			detail: (request) => apiCall("detail", request),
			refresh: (request) => apiCall("refresh", request),
			operationSnapshot: () => apiCall("operationSnapshot"),
			installed: () => apiCall("installed"),
			packs: () => apiCall("packs"),
			packDetail: (request) => apiCall("packDetail", request),
			plan: (request) => apiCall("plan", request),
			execute: (request) => apiCall("execute", request)
		};
		function activateSettingsPluginTab(id) {
			const suffix = `-tab-${id}`;
			const tab = [...document.querySelectorAll("[role=\"tab\"][id]")].find((element) => element.id.endsWith(suffix));
			tab?.click();
			tab?.focus();
		}
		/** Register the Marketplace tab without changing any DSH workspace package. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "plugin-marketplace: dictionaries");
			const t = ctx.locale.bind(NS);
			const injected = () => ({
				bootstrap: (request) => bootstrapMarketplace(remote, request),
				list: (request) => listMarketplace(remote, request),
				detail: (repositoryId) => detailMarketplace(remote, repositoryId),
				refresh: (request, currentDigest) => refreshMarketplace(remote, request, currentDigest),
				operationSnapshot: () => readOperationSnapshot(remote),
				installed: () => installedMarketplace(remote),
				packs: () => listMarketplacePacks(remote),
				packDetail: (repositoryId) => detailMarketplacePack(remote, repositoryId),
				plan: (request) => planMarketplaceOperation(remote, request),
				execute: (planId, allowScripts) => executeMarketplaceOperation(remote, planId, allowScripts),
				activateTab: activateSettingsPluginTab,
				dateLocale: () => ctx.locale.getLocale().active
			});
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "marketplace",
				order: 20,
				label: () => t("tab"),
				locale: NS,
				inject: injected
			}, PluginMarketplaceSettingsTab));
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map