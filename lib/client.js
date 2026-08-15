window.__ModuleLoader__.load({
	id: "dsh-plugin-marketplace",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/marketplace-adapter.ts
		/**
		* Adapt one Host entry into the private presentation model.
		* @param entry - Strict catalog entry returned by the Host API.
		* @returns UI-only plugin facts with no wire parsing responsibility.
		*/
		function toPluginModel(entry) {
			return {
				id: entry.repositoryId,
				name: entry.package.name ?? entry.repository.fullName,
				description: entry.package.description,
				packageName: entry.package.name,
				packageVersion: entry.package.version,
				repositoryFullName: entry.repository.fullName,
				repositoryUrl: entry.repository.url,
				author: entry.package.author,
				license: entry.package.license,
				topics: entry.topics,
				keywords: entry.keywords,
				stars: entry.stars,
				starsObservedAt: entry.indexedAt,
				repositoryCreatedAt: entry.repositoryCreatedAt,
				lastCodePushAt: entry.lastCodePushAt,
				firstSeenAt: entry.firstSeenAt,
				indexedAt: entry.indexedAt,
				archived: entry.repository.archived,
				validationStatus: entry.validation.status,
				validationMessage: entry.validation.message,
				compatibility: entry.compatibility,
				installability: entry.installability,
				riskSignals: entry.riskSignals,
				sourceKind: entry.source.kind,
				sourceRef: entry.source.ref
			};
		}
		/**
		* Adapt the Host projection into the private catalog model.
		* @param view - Catalog snapshot and freshness state returned by the Host.
		* @returns Presentation state consumed by the Marketplace tab.
		*/
		function toCatalogModel(view) {
			return {
				status: view.status,
				source: view.source,
				lastSuccessfulFetchAt: view.lastSuccessfulFetchAt,
				generatedAt: view.catalog?.generatedAt ?? null,
				stale: view.stale,
				error: view.error,
				plugins: view.catalog?.entries.map(toPluginModel) ?? []
			};
		}
		/**
		* Build an unavailable catalog model from a Remote or transport failure.
		* @param error - Sanitized failure safe for the browser presentation layer.
		* @returns Empty unavailable state that preserves the public error.
		*/
		function unavailableCatalogModel(error) {
			return {
				status: "unavailable",
				source: "none",
				lastSuccessfulFetchAt: null,
				generatedAt: null,
				stale: false,
				error,
				plugins: []
			};
		}
		/**
		* Read one Host projection and contain transport failures inside the adapter.
		* @param remote - Package-private Marketplace API face.
		* @param method - Cache-only snapshot or conditional refresh operation.
		* @returns Adapted presentation state; transport failures become unavailable state.
		*/
		async function readCatalogModel(remote, method) {
			try {
				return toCatalogModel(await remote[method]());
			} catch (cause) {
				return unavailableCatalogModel({
					code: "transport-error",
					message: cause instanceof Error ? cause.message : String(cause)
				});
			}
		}
		/**
		* Read current-profile Marketplace operation state.
		* @param remote - Package-private Marketplace API client.
		* @returns Current installed and restart-pending plugin states.
		*/
		function readOperationSnapshot(remote) {
			return remote.operationSnapshot();
		}
		/**
		* Qualify an install, update, or remove request for explicit review.
		* @param remote - Package-private Marketplace API client.
		* @param request - Repository and requested operation.
		* @returns A short-lived review plan or a blocked decision.
		*/
		function planMarketplaceOperation(remote, request) {
			return remote.plan(request);
		}
		/**
		* Execute one short-lived plan after the user confirms its exact facts.
		* @param remote - Package-private Marketplace API client.
		* @param planId - Host-issued plan identifier from the review step.
		* @returns Committed or rolled-back operation result.
		*/
		function executeMarketplaceOperation(remote, planId) {
			return remote.execute({ planId });
		}
		//#endregion
		//#region \0marketplace-css:/D:/Work/dsh-plugin-marketplace/src/client/PluginMarketplaceSettingsTab.module.css.mjs
		const css = ".n0YSWa_section{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:14px;display:flex}.n0YSWa_status,.n0YSWa_failure p,.n0YSWa_detailSection h4,.n0YSWa_detailSection p{margin:0}.n0YSWa_status{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.n0YSWa_skeletonGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;display:grid}.n0YSWa_skeletonCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;height:96px}.n0YSWa_failure{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary));flex-direction:column;align-items:flex-start;gap:8px;font-size:13px;line-height:20px;display:flex}.n0YSWa_failureDetail{color:var(--dsw-alias-label-tertiary)}.n0YSWa_inlineError{color:var(--dsw-alias-state-error-primary);margin:-6px 0 0;font-size:12px;line-height:18px}.n0YSWa_failure button{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:4px 10px}.n0YSWa_failure button:disabled{cursor:default;opacity:.6}.n0YSWa_statusBar{color:var(--dsw-alias-label-tertiary);flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:12px;line-height:18px;display:flex}.n0YSWa_resultCount{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}.n0YSWa_freshness{flex:auto;min-width:0}.n0YSWa_refreshButton{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border-radius:6px;align-items:center;gap:5px;padding:3px 9px;font-size:12px;display:inline-flex}.n0YSWa_refreshButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.n0YSWa_refreshButton:disabled{cursor:default;opacity:.6}.n0YSWa_search{width:100%;color:var(--dsw-alias-label-tertiary);align-items:center;display:flex;position:relative}.n0YSWa_search>svg{pointer-events:none;position:absolute;left:12px}.n0YSWa_search input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:100%;height:36px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;outline:none;padding:0 34px 0 36px;font-size:13px}.n0YSWa_search input::placeholder{color:var(--dsw-alias-label-tertiary)}.n0YSWa_search input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}.n0YSWa_clearSearch{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:6px;justify-content:center;align-items:center;display:inline-flex;position:absolute;right:6px}.n0YSWa_clearSearch:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.n0YSWa_controls{flex-wrap:wrap;align-items:center;gap:8px 14px;display:flex}.n0YSWa_filterGroup{flex-wrap:wrap;align-items:center;gap:6px;display:flex}.n0YSWa_filterLabel{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.n0YSWa_sortControl{align-items:center;gap:6px;margin-left:auto;display:inline-flex}.n0YSWa_sortControl select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);height:26px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:6px;padding:0 6px;font-size:12px}.n0YSWa_sortControl select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.n0YSWa_cards{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:10px;margin:0;padding:0;list-style:none;display:grid}.n0YSWa_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;min-width:0;overflow:hidden}.n0YSWa_cardContent{box-sizing:border-box;width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;flex-direction:column;gap:8px;padding:12px 14px;display:flex}.n0YSWa_cardContent:hover{background:var(--dsw-alias-interactive-bg-hover)}.n0YSWa_cardContent:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.n0YSWa_cardHead{align-items:center;gap:10px;min-width:0;display:flex}.n0YSWa_letterTile{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:28px;height:28px;color:var(--dsw-alias-label-secondary);border-radius:7px;flex:none;justify-content:center;align-items:center;font-size:13px;font-weight:600;display:inline-flex}.n0YSWa_letterTile[data-size=large]{border-radius:9px;width:36px;height:36px;font-size:16px}.n0YSWa_cardIdentity{flex-direction:column;flex:auto;min-width:0;display:flex}.n0YSWa_cardTitle{text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600;line-height:20px;overflow:hidden}.n0YSWa_cardPackage{color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;overflow:hidden}.n0YSWa_badges{flex-wrap:wrap;flex:none;justify-content:flex-end;gap:5px;display:inline-flex}.n0YSWa_badge{background:var(--dsw-alias-bg-layer-1);min-height:20px;color:var(--dsw-alias-label-secondary);white-space:nowrap;border-radius:5px;align-items:center;padding:1px 6px;font-size:11px;line-height:16px;display:inline-flex}.n0YSWa_badge[data-tone=compatible],.n0YSWa_badge[data-tone=one-click-eligible]{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);color:var(--dsw-alias-state-success-primary)}.n0YSWa_badge[data-tone=incompatible],.n0YSWa_badge[data-tone=browse-only]{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);color:var(--dsw-alias-state-error-primary)}.n0YSWa_badge[data-tone=unknown],.n0YSWa_badge[data-tone=manual]{background:color-mix(in srgb, var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-tertiary)) 10%, transparent);color:var(--dsw-alias-label-secondary)}.n0YSWa_cardDescription{-webkit-line-clamp:2;color:var(--dsw-alias-label-secondary);-webkit-box-orient:vertical;font-size:12px;line-height:18px;display:-webkit-box;overflow:hidden}.n0YSWa_cardMeta{color:var(--dsw-alias-label-tertiary);flex-wrap:wrap;gap:4px 12px;font-size:11px;line-height:16px;display:flex}.n0YSWa_metaItem{font-variant-numeric:tabular-nums;white-space:nowrap}.n0YSWa_cardRisks{color:var(--dsw-alias-state-error-primary);align-items:center;gap:5px;font-size:11px;line-height:16px;display:inline-flex}.n0YSWa_detail{flex-direction:column;gap:14px;display:flex}.n0YSWa_detailHeader{align-items:center;display:flex}.n0YSWa_backButton{color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border:0;border-radius:6px;align-items:center;gap:4px;padding:4px 8px 4px 4px;font-size:13px;display:inline-flex}.n0YSWa_backButton:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.n0YSWa_backButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.n0YSWa_detailTitle{align-items:center;gap:12px;min-width:0;display:flex}.n0YSWa_detailIdentity{flex-direction:column;flex:auto;min-width:0;display:flex}.n0YSWa_detailName{overflow-wrap:anywhere;margin:0;font-size:18px;font-weight:600;line-height:26px}.n0YSWa_detailName:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px;border-radius:4px}.n0YSWa_detailPackage{overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);margin:0;font-size:12px;line-height:18px}.n0YSWa_detailSection{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:6px;padding-top:12px;display:flex}.n0YSWa_detailSection h4{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:600;line-height:18px}.n0YSWa_detailSection p{overflow-wrap:anywhere;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}.n0YSWa_riskList,.n0YSWa_tokenList{flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none;display:flex}.n0YSWa_riskList li{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);color:var(--dsw-alias-state-error-primary);border-radius:5px;padding:1px 6px;font-size:11px;line-height:16px}.n0YSWa_tokenList li{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:5px;padding:1px 6px;font-size:11px;line-height:16px}.n0YSWa_factList{grid-template-columns:130px minmax(0,1fr);gap:6px 12px;margin:0;display:grid}.n0YSWa_factList div{display:contents}.n0YSWa_factList dt{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.n0YSWa_factList dd{overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;margin:0;font-size:12px;line-height:18px}.n0YSWa_installEligibility{color:var(--dsw-alias-label-secondary)}.n0YSWa_validationMessage{color:var(--dsw-alias-label-tertiary)!important}.n0YSWa_operationPanel{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;flex-direction:column;gap:10px;padding:14px;display:flex}.n0YSWa_operationHeading{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}.n0YSWa_operationHeading h4,.n0YSWa_operationHeading p,.n0YSWa_reviewBox p,.n0YSWa_restartNotice,.n0YSWa_operationSuccess,.n0YSWa_operationFailure{margin:0}.n0YSWa_operationHeading h4{font-size:13px;line-height:20px}.n0YSWa_operationHeading p{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.n0YSWa_stateBadge{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);color:var(--dsw-alias-state-business-primary);border-radius:999px;flex:none;padding:2px 8px;font-size:11px;line-height:18px}.n0YSWa_restartNotice,.n0YSWa_operationSuccess,.n0YSWa_operationFailure{border-radius:7px;padding:8px 10px;font-size:12px;line-height:18px}.n0YSWa_restartNotice{background:color-mix(in srgb, var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary)) 10%, transparent);color:var(--dsw-alias-label-secondary)}.n0YSWa_operationSuccess{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);color:var(--dsw-alias-state-success-primary)}.n0YSWa_operationFailure{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);color:var(--dsw-alias-state-error-primary)}.n0YSWa_reviewBox{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:8px;flex-direction:column;gap:9px;padding:12px;font-size:12px;line-height:18px;display:flex}.n0YSWa_reviewFacts{grid-template-columns:90px minmax(0,1fr);gap:5px 10px;margin:0;display:grid}.n0YSWa_reviewFacts div{display:contents}.n0YSWa_reviewFacts dt{color:var(--dsw-alias-label-tertiary)}.n0YSWa_reviewFacts dd{overflow-wrap:anywhere;min-width:0;margin:0}.n0YSWa_reviewFacts code{font-family:var(--ds-font-family-code);font-size:11px}.n0YSWa_warningList{color:var(--dsw-alias-label-secondary);flex-direction:column;gap:3px;margin:0;padding-left:18px;display:flex}.n0YSWa_actionRow{flex-wrap:wrap;gap:8px;display:flex}.n0YSWa_primaryButton,.n0YSWa_secondaryButton,.n0YSWa_dangerButton{font:inherit;cursor:pointer;font-size:13px;line-height:20px}.n0YSWa_primaryButton{border:1px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-on-primary,white);border-radius:7px;padding:5px 13px}.n0YSWa_secondaryButton,.n0YSWa_dangerButton{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0;border-radius:7px;padding:5px 12px}.n0YSWa_dangerButton{color:var(--dsw-alias-state-error-primary)}.n0YSWa_primaryButton:hover:not(:disabled),.n0YSWa_secondaryButton:hover:not(:disabled),.n0YSWa_dangerButton:hover:not(:disabled){filter:brightness(.96)}.n0YSWa_primaryButton:focus-visible,.n0YSWa_secondaryButton:focus-visible,.n0YSWa_dangerButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.n0YSWa_primaryButton:disabled,.n0YSWa_secondaryButton:disabled,.n0YSWa_dangerButton:disabled{cursor:default;opacity:.55}.n0YSWa_installReason{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.n0YSWa_githubLink{color:var(--dsw-alias-state-business-primary);align-self:flex-start;align-items:center;gap:4px;font-size:13px;line-height:20px;text-decoration:none;display:inline-flex}.n0YSWa_githubLink:hover{text-decoration:underline}.n0YSWa_githubLink:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px;border-radius:3px}.n0YSWa_visuallyHidden{clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}@media (prefers-reduced-motion:no-preference){.n0YSWa_cardContent,.n0YSWa_refreshButton,.n0YSWa_backButton,.n0YSWa_clearSearch{transition:background-color .14s var(--ds-ease-in-out), color .14s var(--ds-ease-in-out)}}@media (width<=680px){.n0YSWa_cards,.n0YSWa_skeletonGrid{grid-template-columns:minmax(0,1fr)}.n0YSWa_sortControl{margin-left:0}.n0YSWa_factList{grid-template-columns:minmax(0,1fr);gap:2px}.n0YSWa_factList div{display:block}.n0YSWa_operationHeading{flex-direction:column;align-items:stretch}.n0YSWa_stateBadge{align-self:flex-start}.n0YSWa_reviewFacts{grid-template-columns:minmax(0,1fr);gap:2px}.n0YSWa_reviewFacts div{display:block}}";
		const tagId = "dsh-plugin-marketplace/PluginMarketplaceSettingsTab.module.css";
		if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-marketplace";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var PluginMarketplaceSettingsTab_module_css_default = {
			"detailSection": "n0YSWa_detailSection",
			"controls": "n0YSWa_controls",
			"warningList": "n0YSWa_warningList",
			"cardPackage": "n0YSWa_cardPackage",
			"reviewBox": "n0YSWa_reviewBox",
			"cardTitle": "n0YSWa_cardTitle",
			"cardDescription": "n0YSWa_cardDescription",
			"tokenList": "n0YSWa_tokenList",
			"operationFailure": "n0YSWa_operationFailure",
			"dangerButton": "n0YSWa_dangerButton",
			"inlineError": "n0YSWa_inlineError",
			"cards": "n0YSWa_cards",
			"failure": "n0YSWa_failure",
			"actionRow": "n0YSWa_actionRow",
			"validationMessage": "n0YSWa_validationMessage",
			"detail": "n0YSWa_detail",
			"detailPackage": "n0YSWa_detailPackage",
			"restartNotice": "n0YSWa_restartNotice",
			"filterLabel": "n0YSWa_filterLabel",
			"detailTitle": "n0YSWa_detailTitle",
			"filterGroup": "n0YSWa_filterGroup",
			"freshness": "n0YSWa_freshness",
			"metaItem": "n0YSWa_metaItem",
			"skeletonCard": "n0YSWa_skeletonCard",
			"cardContent": "n0YSWa_cardContent",
			"card": "n0YSWa_card",
			"cardRisks": "n0YSWa_cardRisks",
			"letterTile": "n0YSWa_letterTile",
			"installReason": "n0YSWa_installReason",
			"cardMeta": "n0YSWa_cardMeta",
			"badges": "n0YSWa_badges",
			"installEligibility": "n0YSWa_installEligibility",
			"detailHeader": "n0YSWa_detailHeader",
			"operationPanel": "n0YSWa_operationPanel",
			"primaryButton": "n0YSWa_primaryButton",
			"backButton": "n0YSWa_backButton",
			"operationHeading": "n0YSWa_operationHeading",
			"clearSearch": "n0YSWa_clearSearch",
			"secondaryButton": "n0YSWa_secondaryButton",
			"githubLink": "n0YSWa_githubLink",
			"skeletonGrid": "n0YSWa_skeletonGrid",
			"statusBar": "n0YSWa_statusBar",
			"badge": "n0YSWa_badge",
			"operationSuccess": "n0YSWa_operationSuccess",
			"sortControl": "n0YSWa_sortControl",
			"riskList": "n0YSWa_riskList",
			"detailName": "n0YSWa_detailName",
			"search": "n0YSWa_search",
			"reviewFacts": "n0YSWa_reviewFacts",
			"visuallyHidden": "n0YSWa_visuallyHidden",
			"status": "n0YSWa_status",
			"factList": "n0YSWa_factList",
			"stateBadge": "n0YSWa_stateBadge",
			"resultCount": "n0YSWa_resultCount",
			"refreshButton": "n0YSWa_refreshButton",
			"cardHead": "n0YSWa_cardHead",
			"failureDetail": "n0YSWa_failureDetail",
			"detailIdentity": "n0YSWa_detailIdentity",
			"cardIdentity": "n0YSWa_cardIdentity",
			"section": "n0YSWa_section"
		};
		//#endregion
		//#region src/client/PluginMarketplaceSettingsTab.tsx
		const DEFAULT_FILTERS = {
			compatibility: "all",
			installability: "all",
			maintenance: "all"
		};
		/** Localized date without a runtime dependency; falls back to the raw value. */
		function formatTime(iso) {
			const time = Date.parse(iso);
			if (Number.isNaN(time)) return iso;
			return new Intl.DateTimeFormat(void 0, { dateStyle: "medium" }).format(time);
		}
		/** Deterministic letter fallback for a plugin identity (no external avatars). */
		function letterOf(name) {
			return (/[a-z0-9]/i.exec(name)?.[0] ?? "?").toUpperCase();
		}
		/** Whether one plugin matches the normalized local query. */
		function matchesQuery(plugin, query) {
			if (query.length === 0) return true;
			return [
				plugin.name,
				plugin.description ?? "",
				plugin.author ?? "",
				plugin.packageName ?? "",
				plugin.repositoryFullName,
				...plugin.topics,
				...plugin.keywords
			].some((value) => value.toLocaleLowerCase().includes(query));
		}
		/** Relevance score used only when a query is active. */
		function relevance(plugin, query) {
			if (query.length === 0) return 0;
			let score = 0;
			if (plugin.name.toLocaleLowerCase().includes(query)) score += 4;
			if (plugin.packageName?.toLocaleLowerCase().includes(query)) score += 4;
			if (plugin.description?.toLocaleLowerCase().includes(query)) score += 2;
			if (plugin.author?.toLocaleLowerCase().includes(query)) score += 1;
			if (plugin.topics.some((topic) => topic.toLocaleLowerCase().includes(query))) score += 1;
			if (plugin.keywords.some((keyword) => keyword.toLocaleLowerCase().includes(query))) score += 1;
			return score;
		}
		/** Apply the maintenance (archived) filter dimension. */
		function matchesMaintenance(plugin, filter) {
			if (filter === "active") return !plugin.archived;
			if (filter === "archived") return plugin.archived;
			return true;
		}
		/** Filter + sort the full catalog locally; never triggers any request. */
		function selectVisible(plugins, query, filters, sort) {
			const visible = plugins.filter((plugin) => matchesQuery(plugin, query) && (filters.compatibility === "all" || plugin.compatibility === filters.compatibility) && (filters.installability === "all" || plugin.installability === filters.installability) && matchesMaintenance(plugin, filters.maintenance));
			const byStars = (a, b) => b.stars - a.stars;
			switch (sort) {
				case "stars": return [...visible].sort(byStars);
				case "pushed": return [...visible].sort((a, b) => Date.parse(b.lastCodePushAt) - Date.parse(a.lastCodePushAt));
				case "added": return [...visible].sort((a, b) => Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt));
				case "relevance":
					if (query.length === 0) return visible;
					return [...visible].sort((a, b) => relevance(b, query) - relevance(a, query) || byStars(a, b));
			}
		}
		const COMPATIBILITY_KEYS = {
			compatible: "compatibility.compatible",
			incompatible: "compatibility.incompatible",
			unknown: "compatibility.unknown"
		};
		const INSTALLABILITY_KEYS = {
			"browse-only": "installability.browse-only",
			manual: "installability.manual",
			"one-click-eligible": "installability.one-click-eligible"
		};
		const RISK_KEYS = {
			"repository-archived": "risk.repository-archived",
			"git-source": "risk.git-source",
			"unpinned-source": "risk.unpinned-source",
			"lifecycle-script": "risk.lifecycle-script",
			"build-script": "risk.build-script"
		};
		const WARNING_KEYS = {
			"compatibility-unknown": "operation.warning.compatibility",
			"git-source": "operation.warning.git",
			"code-executes-on-restart": "operation.warning.code",
			"install-scripts-disabled": "operation.warning.scripts",
			"restart-required": "operation.warning.restart"
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
		const VALIDATION_KEYS = {
			valid: "detail.validation.valid",
			invalid: "detail.validation.invalid",
			archived: "detail.validation.archived"
		};
		/** Compact compatibility + eligibility badge pair shared by card and detail. */
		function StatusBadges({ plugin, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: PluginMarketplaceSettingsTab_module_css_default.badges,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: PluginMarketplaceSettingsTab_module_css_default.badge,
					"data-tone": plugin.compatibility,
					children: t(COMPATIBILITY_KEYS[plugin.compatibility])
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: PluginMarketplaceSettingsTab_module_css_default.badge,
					"data-tone": plugin.installability,
					children: t(INSTALLABILITY_KEYS[plugin.installability])
				})]
			});
		}
		/** One plugin card in the catalog grid. */
		function PluginCard({ plugin, t, onOpen, cardRef }) {
			const risks = plugin.riskSignals;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
				className: PluginMarketplaceSettingsTab_module_css_default.card,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					ref: (node) => {
						cardRef(plugin.id, node);
					},
					className: PluginMarketplaceSettingsTab_module_css_default.cardContent,
					type: "button",
					"data-plugin-id": plugin.id,
					onClick: () => {
						onOpen(plugin.id);
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.cardHead,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.letterTile,
									"aria-hidden": "true",
									children: letterOf(plugin.name)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.cardIdentity,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
										className: PluginMarketplaceSettingsTab_module_css_default.cardTitle,
										title: plugin.name,
										children: plugin.name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: PluginMarketplaceSettingsTab_module_css_default.cardPackage,
										title: plugin.packageName ?? plugin.repositoryFullName,
										children: plugin.packageName ?? plugin.repositoryFullName
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusBadges, {
									plugin,
									t
								})
							]
						}),
						plugin.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.cardDescription,
							children: plugin.description
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.cardMeta,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.metaItem,
									children: t("card.stars", { count: plugin.stars })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.metaItem,
									children: t("card.pushed", { time: formatTime(plugin.lastCodePushAt) })
								}),
								plugin.license ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.metaItem,
									children: plugin.license
								}) : null
							]
						}),
						risks.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.cardRisks,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, {
								size: 12,
								"aria-hidden": "true"
							}), risks.map((risk) => t(RISK_KEYS[risk])).join(" · ")]
						}) : null
					]
				})
			});
		}
		/** Safe profile operation controls with an explicit plan-review-confirm boundary. */
		function OperationPanel({ plugin, profile, t, planOperation, executeOperation, onSnapshot, activateTab }) {
			const pluginState = profile?.plugins.find((entry) => entry.repositoryId === plugin.id);
			const [review, setReview] = (0, react.useState)(null);
			const [result, setResult] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [working, setWorking] = (0, react.useState)(false);
			const restartPending = pluginState?.state === "pending-install" || pluginState?.state === "pending-update" || pluginState?.state === "pending-removal";
			const installed = pluginState?.installedSpec !== null && pluginState?.installedSpec !== void 0;
			const requestPlan = (action) => {
				setWorking(true);
				setError(null);
				setResult(null);
				planOperation({
					repositoryId: plugin.id,
					action
				}).then((next) => {
					setReview(next);
				}).catch((cause) => {
					setError(cause instanceof Error ? cause.message : String(cause));
				}).finally(() => {
					setWorking(false);
				});
			};
			const confirm = () => {
				if (review?.planId === null || review?.planId === void 0) return;
				setWorking(true);
				setError(null);
				executeOperation(review.planId).then((next) => {
					setResult(next);
					onSnapshot(next.snapshot);
					if (next.status === "succeeded") setReview(null);
				}).catch((cause) => {
					setError(cause instanceof Error ? cause.message : String(cause));
				}).finally(() => {
					setWorking(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: PluginMarketplaceSettingsTab_module_css_default.operationPanel,
				"aria-busy": working,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PluginMarketplaceSettingsTab_module_css_default.operationHeading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("install.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: profile ? t("operation.profile", { profile: profile.profileName }) : t("operation.loading") })] }), pluginState ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.stateBadge,
							children: t(STATE_KEYS[pluginState.state])
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.installEligibility,
						children: t("install.eligibility", {
							source: plugin.sourceRef,
							eligibility: t(INSTALLABILITY_KEYS[plugin.installability])
						})
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: PluginMarketplaceSettingsTab_module_css_default.warningList,
								children: review.warnings.map((warning) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t(WARNING_KEYS[warning]) }, warning))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: PluginMarketplaceSettingsTab_module_css_default.actionRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
									disabled: working,
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
							!installed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
								disabled: working || restartPending || plugin.installability !== "one-click-eligible" || profile === null,
								onClick: () => {
									requestPlan("install");
								},
								children: t("install.action")
							}) : null,
							installed && pluginState.updateAvailable && !restartPending ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
								disabled: working,
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
								disabled: working,
								onClick: () => {
									requestPlan("remove");
								},
								children: t("operation.remove")
							}) : null
						]
					}) : null,
					!installed && plugin.installability !== "one-click-eligible" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.installReason,
						children: t("install.unavailable")
					}) : null,
					pluginState?.state === "active" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.installReason,
						children: t("operation.configureHint")
					}) : null
				]
			});
		}
		/** Inline detail sub-view for one plugin; replaces the list inside the tab. */
		function PluginDetail({ plugin, profile, t, onBack, planOperation, executeOperation, onSnapshot, activateTab }) {
			const headingRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				headingRef.current?.focus();
			}, [plugin.id]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: PluginMarketplaceSettingsTab_module_css_default.detail,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: PluginMarketplaceSettingsTab_module_css_default.detailHeader,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							className: PluginMarketplaceSettingsTab_module_css_default.backButton,
							type: "button",
							onClick: onBack,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, { "aria-hidden": "true" }), t("detail.back")]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PluginMarketplaceSettingsTab_module_css_default.detailTitle,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.letterTile,
								"data-size": "large",
								"aria-hidden": "true",
								children: letterOf(plugin.name)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: PluginMarketplaceSettingsTab_module_css_default.detailIdentity,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									ref: headingRef,
									tabIndex: -1,
									className: PluginMarketplaceSettingsTab_module_css_default.detailName,
									children: plugin.name
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: PluginMarketplaceSettingsTab_module_css_default.detailPackage,
									children: [plugin.packageName ?? plugin.repositoryFullName, plugin.packageVersion ? ` · ${plugin.packageVersion}` : ""]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusBadges, {
								plugin,
								t
							})
						]
					}),
					plugin.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("detail.about") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: plugin.description })]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("detail.compatibility") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(COMPATIBILITY_KEYS[plugin.compatibility]) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("detail.validation") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(VALIDATION_KEYS[plugin.validationStatus]) }),
							plugin.validationMessage ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: PluginMarketplaceSettingsTab_module_css_default.validationMessage,
								children: plugin.validationMessage
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("detail.source") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("detail.source.git", { ref: plugin.sourceRef }) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("detail.risks") }), plugin.riskSignals.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("detail.risks.none") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: PluginMarketplaceSettingsTab_module_css_default.riskList,
							children: plugin.riskSignals.map((risk) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t(RISK_KEYS[risk]) }, risk))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("detail.activity") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
							className: PluginMarketplaceSettingsTab_module_css_default.factList,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("detail.stars.label") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: t("card.stars", { count: plugin.stars }) })] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("detail.created") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatTime(plugin.repositoryCreatedAt) })] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("detail.pushed") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatTime(plugin.lastCodePushAt) })] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("detail.firstSeen") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatTime(plugin.firstSeenAt) })] })
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
						className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
							className: PluginMarketplaceSettingsTab_module_css_default.factList,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("detail.author") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: plugin.author ?? "—" })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("detail.license") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: plugin.license ?? t("detail.license.missing") })] })]
						})
					}),
					plugin.topics.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("detail.topics") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: PluginMarketplaceSettingsTab_module_css_default.tokenList,
							children: plugin.topics.map((topic) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: topic }, topic))
						})]
					}) : null,
					plugin.keywords.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: PluginMarketplaceSettingsTab_module_css_default.detailSection,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("detail.keywords") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: PluginMarketplaceSettingsTab_module_css_default.tokenList,
							children: plugin.keywords.map((keyword) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: keyword }, keyword))
						})]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OperationPanel, {
						plugin,
						profile,
						t,
						planOperation,
						executeOperation,
						onSnapshot,
						activateTab
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
						className: PluginMarketplaceSettingsTab_module_css_default.githubLink,
						href: plugin.repositoryUrl,
						target: "_blank",
						rel: "noreferrer noopener",
						children: [t("detail.viewOnGithub"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline14, { "aria-hidden": "true" })]
					})
				]
			});
		}
		/** One labeled filter-chip dimension. */
		function FilterGroup({ label, options, value, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: PluginMarketplaceSettingsTab_module_css_default.filterGroup,
				role: "group",
				"aria-label": label,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: PluginMarketplaceSettingsTab_module_css_default.filterLabel,
					children: label
				}), options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
					active: value === option.value,
					"aria-pressed": value === option.value,
					onClick: () => {
						onChange(option.value);
					},
					children: option.label
				}, option.value))]
			});
		}
		/** Render the plugin Marketplace tab. */
		function PluginMarketplaceSettingsTab({ snapshot, refresh, operationSnapshot, plan, execute, activateTab, t }) {
			const [state, setState] = (0, react.useState)({ status: "loading" });
			const [refreshing, setRefreshing] = (0, react.useState)(false);
			const [refreshError, setRefreshError] = (0, react.useState)(null);
			const [profile, setProfile] = (0, react.useState)(null);
			const [query, setQuery] = (0, react.useState)("");
			const [filters, setFilters] = (0, react.useState)(DEFAULT_FILTERS);
			const [sort, setSort] = (0, react.useState)("relevance");
			const [selectedId, setSelectedId] = (0, react.useState)(null);
			const cardNodes = (0, react.useRef)(/* @__PURE__ */ new Map());
			(0, react.useEffect)(() => {
				let current = true;
				Promise.resolve().then(() => snapshot()).then((model) => {
					if (!current) return;
					setState({
						status: "ready",
						model
					});
					refresh().then((refreshed) => {
						if (!current) return;
						setState({
							status: "ready",
							model: refreshed
						});
						return operationSnapshot().then((next) => {
							if (current) setProfile(next);
						});
					}).catch((cause) => {
						if (current) setRefreshError(cause instanceof Error ? cause.message : String(cause));
					});
				}).catch((cause) => {
					if (!current) return;
					setState({
						status: "ready",
						model: {
							status: "unavailable",
							source: "none",
							lastSuccessfulFetchAt: null,
							generatedAt: null,
							stale: false,
							plugins: [],
							error: {
								code: "transport-error",
								message: String(cause)
							}
						}
					});
				});
				return () => {
					current = false;
				};
			}, [
				snapshot,
				refresh,
				operationSnapshot
			]);
			(0, react.useEffect)(() => {
				let current = true;
				operationSnapshot().then((next) => {
					if (current) setProfile(next);
				}).catch((cause) => {
					if (current) setRefreshError(cause instanceof Error ? cause.message : String(cause));
				});
				return () => {
					current = false;
				};
			}, [operationSnapshot]);
			const model = state.status === "ready" ? state.model : null;
			const normalizedQuery = query.trim().toLocaleLowerCase();
			const visible = (0, react.useMemo)(() => model ? selectVisible(model.plugins, normalizedQuery, filters, sort) : [], [
				model,
				normalizedQuery,
				filters,
				sort
			]);
			(0, react.useEffect)(() => {
				if (selectedId !== null && model && !model.plugins.some((plugin) => plugin.id === selectedId)) setSelectedId(null);
			}, [selectedId, model]);
			const onRefresh = () => {
				setRefreshing(true);
				setRefreshError(null);
				refresh().then((refreshed) => {
					setState({
						status: "ready",
						model: refreshed
					});
					return operationSnapshot();
				}).then((next) => {
					setProfile(next);
				}).catch((cause) => {
					setRefreshError(cause instanceof Error ? cause.message : String(cause));
				}).finally(() => {
					setRefreshing(false);
				});
			};
			const cardRef = (id, node) => {
				if (node) cardNodes.current.set(id, node);
				else cardNodes.current.delete(id);
			};
			const backToList = () => {
				const id = selectedId;
				setSelectedId(null);
				if (id === null) return;
				requestAnimationFrame(() => {
					const node = cardNodes.current.get(id);
					if (!node) return;
					node.focus();
					if (typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest" });
				});
			};
			if (state.status === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: PluginMarketplaceSettingsTab_module_css_default.section,
				"aria-busy": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: PluginMarketplaceSettingsTab_module_css_default.status,
					children: t("state.loading")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.skeletonGrid,
					"aria-hidden": "true",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: PluginMarketplaceSettingsTab_module_css_default.skeletonCard }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: PluginMarketplaceSettingsTab_module_css_default.skeletonCard })]
				})]
			});
			if (selectedId !== null && model) {
				const plugin = model.plugins.find((entry) => entry.id === selectedId);
				if (plugin) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.section,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginDetail, {
						plugin,
						profile,
						t,
						onBack: backToList,
						planOperation: plan,
						executeOperation: execute,
						onSnapshot: setProfile,
						activateTab
					})
				});
			}
			if (!model || model.status === "unavailable" && model.plugins.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
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
						model ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: onRefresh,
							disabled: refreshing,
							children: refreshing ? t("refreshing") : t("state.retry")
						}) : null
					]
				})
			});
			const offline = model.status === "unavailable" && model.plugins.length > 0;
			const freshnessAt = model.lastSuccessfulFetchAt ?? model.generatedAt;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: PluginMarketplaceSettingsTab_module_css_default.section,
				"aria-busy": refreshing,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PluginMarketplaceSettingsTab_module_css_default.statusBar,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.resultCount,
								role: "status",
								"aria-live": "polite",
								children: t("results.count", { count: visible.length })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.freshness,
								role: "status",
								children: [
									freshnessAt ? t(model.source === "cache" ? "status.cached" : "status.updated", { time: formatTime(freshnessAt) }) : null,
									model.stale ? ` · ${t("status.stale")}` : "",
									offline ? ` · ${t("status.offline")}` : "",
									` · ${t("status.readonly")}`
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
					}),
					refreshError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.inlineError,
						role: "alert",
						children: t("status.refreshError")
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
								"aria-label": t("search"),
								onChange: (event) => {
									setQuery(event.currentTarget.value);
								}
							}),
							query.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: PluginMarketplaceSettingsTab_module_css_default.clearSearch,
								type: "button",
								"aria-label": t("clearSearch"),
								onClick: () => {
									setQuery("");
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
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FilterGroup, {
								label: t("filter.compatibility"),
								value: filters.compatibility,
								onChange: (value) => {
									setFilters((current) => ({
										...current,
										compatibility: value
									}));
								},
								options: [
									{
										value: "all",
										label: t("filter.all")
									},
									{
										value: "compatible",
										label: t("compatibility.compatible")
									},
									{
										value: "incompatible",
										label: t("compatibility.incompatible")
									},
									{
										value: "unknown",
										label: t("compatibility.unknown")
									}
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FilterGroup, {
								label: t("filter.installability"),
								value: filters.installability,
								onChange: (value) => {
									setFilters((current) => ({
										...current,
										installability: value
									}));
								},
								options: [
									{
										value: "all",
										label: t("filter.all")
									},
									{
										value: "one-click-eligible",
										label: t("installability.one-click-eligible")
									},
									{
										value: "manual",
										label: t("installability.manual")
									},
									{
										value: "browse-only",
										label: t("installability.browse-only")
									}
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FilterGroup, {
								label: t("filter.maintenance"),
								value: filters.maintenance,
								onChange: (value) => {
									setFilters((current) => ({
										...current,
										maintenance: value
									}));
								},
								options: [
									{
										value: "all",
										label: t("filter.all")
									},
									{
										value: "active",
										label: t("maintenance.active")
									},
									{
										value: "archived",
										label: t("maintenance.archived")
									}
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: PluginMarketplaceSettingsTab_module_css_default.sortControl,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.filterLabel,
									children: t("sort.label")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									value: sort,
									"aria-label": t("sort.label"),
									onChange: (event) => {
										setSort(event.currentTarget.value);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "relevance",
											children: t("sort.relevance")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "stars",
											children: t("sort.stars")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "pushed",
											children: t("sort.pushed")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "added",
											children: t("sort.added")
										})
									]
								})]
							})
						]
					}),
					model.status === "empty" || model.plugins.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.status,
						children: t("state.empty")
					}) : null,
					model.plugins.length > 0 && visible.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.status,
						children: t("state.emptySearch")
					}) : null,
					visible.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: PluginMarketplaceSettingsTab_module_css_default.cards,
						children: visible.map((plugin) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginCard, {
							plugin,
							t,
							onOpen: setSelectedId,
							cardRef
						}, plugin.id))
					}) : null
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Copy dictionaries for the read-only plugin Marketplace Settings tab. */
		/** Simplified Chinese dictionary and key source of truth. */
		const zh = {
			tab: "插件市场",
			search: "搜索插件名称、描述、作者或关键词",
			clearSearch: "清除搜索",
			refresh: "刷新目录",
			refreshing: "正在刷新…",
			"status.updated": "更新于 {time}",
			"status.cached": "缓存于 {time}",
			"status.stale": "目录可能已过期",
			"status.offline": "当前离线，正在展示最近一次成功的目录",
			"status.readonly": "Host 校验目录",
			"status.refreshError": "刷新失败，已保留当前目录。",
			"results.count": "{count} 个插件",
			"filter.compatibility": "兼容性",
			"filter.installability": "安装资格",
			"filter.maintenance": "维护状态",
			"filter.all": "全部",
			"compatibility.compatible": "兼容",
			"compatibility.incompatible": "不兼容",
			"compatibility.unknown": "兼容性未知",
			"installability.browse-only": "仅浏览",
			"installability.manual": "手动安装",
			"installability.one-click-eligible": "可一键安装",
			"maintenance.active": "活跃",
			"maintenance.archived": "已归档",
			"sort.label": "排序",
			"sort.relevance": "相关性",
			"sort.stars": "Stars 最多",
			"sort.pushed": "最近代码更新",
			"sort.added": "最近收录",
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
			"detail.back": "返回列表",
			"detail.about": "用途",
			"detail.compatibility": "兼容性",
			"detail.validation": "静态校验",
			"detail.validation.valid": "Bundle 声明与补丁通过静态校验",
			"detail.validation.invalid": "未通过静态校验",
			"detail.validation.archived": "仓库已归档",
			"detail.source": "来源",
			"detail.source.git": "Git 源码 · {ref}",
			"detail.risks": "风险信号",
			"detail.risks.none": "未发现静态风险信号",
			"detail.activity": "活跃度",
			"detail.stars.label": "Stars",
			"detail.created": "仓库创建",
			"detail.pushed": "最近代码提交",
			"detail.firstSeen": "收录时间",
			"detail.author": "作者",
			"detail.license": "许可证",
			"detail.license.missing": "未声明",
			"detail.topics": "Topics",
			"detail.keywords": "关键词",
			"detail.viewOnGithub": "在 GitHub 查看",
			"install.title": "安装",
			"install.eligibility": "来源 {source} · 资格：{eligibility}",
			"install.unavailable": "该条目未达到安全的一键安装条件，请先在 GitHub 查看说明。",
			"install.action": "安装插件",
			"operation.profile": "将修改当前 WebUI 的 {profile} profile",
			"operation.loading": "正在读取当前 profile 状态…",
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
			"operation.warning.restart": "提交后必须重启 WebUI 才会生效。",
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
			search: "Search plugin names, descriptions, authors, or keywords",
			clearSearch: "Clear search",
			refresh: "Refresh catalog",
			refreshing: "Refreshing…",
			"status.updated": "Updated {time}",
			"status.cached": "Cached {time}",
			"status.stale": "The catalog may be stale",
			"status.offline": "Offline — showing the last successful catalog",
			"status.readonly": "Host-validated catalog",
			"status.refreshError": "Refresh failed; the current catalog was preserved.",
			"results.count": "{count} plugins",
			"filter.compatibility": "Compatibility",
			"filter.installability": "Eligibility",
			"filter.maintenance": "Maintenance",
			"filter.all": "All",
			"compatibility.compatible": "Compatible",
			"compatibility.incompatible": "Incompatible",
			"compatibility.unknown": "Compatibility unknown",
			"installability.browse-only": "Browse only",
			"installability.manual": "Manual install",
			"installability.one-click-eligible": "One-click eligible",
			"maintenance.active": "Active",
			"maintenance.archived": "Archived",
			"sort.label": "Sort",
			"sort.relevance": "Relevance",
			"sort.stars": "Most stars",
			"sort.pushed": "Recently updated",
			"sort.added": "Recently added",
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
			"detail.back": "Back to list",
			"detail.about": "About",
			"detail.compatibility": "Compatibility",
			"detail.validation": "Static validation",
			"detail.validation.valid": "Bundle declaration and patch passed static validation",
			"detail.validation.invalid": "Static validation failed",
			"detail.validation.archived": "Repository archived",
			"detail.source": "Source",
			"detail.source.git": "Git source · {ref}",
			"detail.risks": "Risk signals",
			"detail.risks.none": "No static risk signals found",
			"detail.activity": "Activity",
			"detail.stars.label": "Stars",
			"detail.created": "Repository created",
			"detail.pushed": "Last code push",
			"detail.firstSeen": "First indexed",
			"detail.author": "Author",
			"detail.license": "License",
			"detail.license.missing": "Not declared",
			"detail.topics": "Topics",
			"detail.keywords": "Keywords",
			"detail.viewOnGithub": "View on GitHub",
			"install.title": "Install",
			"install.eligibility": "Source {source} · Eligibility: {eligibility}",
			"install.unavailable": "This entry does not meet safe one-click criteria. Review its GitHub instructions first.",
			"install.action": "Install plugin",
			"operation.profile": "Changes the {profile} profile that booted this WebUI",
			"operation.loading": "Reading the current profile state…",
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
			"operation.warning.restart": "You must restart WebUI after committing this change.",
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
			snapshot: () => apiCall("snapshot"),
			refresh: () => apiCall("refresh"),
			operationSnapshot: () => apiCall("operationSnapshot"),
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
				snapshot: () => readCatalogModel(remote, "snapshot"),
				refresh: () => readCatalogModel(remote, "refresh"),
				operationSnapshot: () => readOperationSnapshot(remote),
				plan: (request) => planMarketplaceOperation(remote, request),
				execute: (planId) => executeMarketplaceOperation(remote, planId),
				activateTab: activateSettingsPluginTab
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