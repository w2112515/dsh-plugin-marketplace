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
				lastCodePushAt: entry.lastCodePushAt,
				firstSeenAt: entry.firstSeenAt,
				installability: entry.installability,
				compatibility: entry.compatibility
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
				validationStatus: entry.validation.status,
				validationMessage: entry.validation.message,
				compatibility: entry.compatibility,
				installability: entry.installability,
				riskSignals: entry.riskSignals,
				sourceRef: entry.source.ref
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
		function planMarketplaceOperation(remote, request) {
			return remote.plan(request);
		}
		function executeMarketplaceOperation(remote, planId) {
			return remote.execute({ planId });
		}
		//#endregion
		//#region \0marketplace-css:/D:/Work/dsh-plugin-marketplace/src/client/PluginMarketplaceSettingsTab.module.css.mjs
		const css = ".n0YSWa_section{width:100%;min-width:0;max-width:860px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}.n0YSWa_status,.n0YSWa_failure p,.n0YSWa_detailSection h4,.n0YSWa_detailSection p,.n0YSWa_detailTitle p,.n0YSWa_operationHeading h4,.n0YSWa_operationHeading p,.n0YSWa_reviewBox p,.n0YSWa_capabilityNotice,.n0YSWa_capabilityReady,.n0YSWa_restartNotice,.n0YSWa_operationSuccess,.n0YSWa_operationFailure,.n0YSWa_installReason{margin:0}.n0YSWa_status,.n0YSWa_failureDetail,.n0YSWa_freshness,.n0YSWa_filterLabel,.n0YSWa_rowPeople,.n0YSWa_rowMeta,.n0YSWa_detailByline,.n0YSWa_detailPackage,.n0YSWa_operationHeading p,.n0YSWa_installReason{color:var(--dsw-alias-label-tertiary)}.n0YSWa_status,.n0YSWa_failure,.n0YSWa_detailSection p{font-size:13px;line-height:20px}.n0YSWa_skeletonList{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;flex-direction:column;gap:1px;display:flex;overflow:hidden}.n0YSWa_skeletonList div{background:var(--dsw-alias-bg-layer-1);height:118px}.n0YSWa_failure{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary));flex-direction:column;align-items:flex-start;gap:8px;display:flex}.n0YSWa_failure button,.n0YSWa_refreshButton,.n0YSWa_filterButton,.n0YSWa_primaryButton,.n0YSWa_secondaryButton,.n0YSWa_dangerButton{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border-radius:6px}.n0YSWa_inlineError{color:var(--dsw-alias-state-error-primary);margin:-4px 0 0;font-size:12px;line-height:18px}.n0YSWa_statusBar,.n0YSWa_controls,.n0YSWa_filterGroup,.n0YSWa_sortControl,.n0YSWa_rowMeta,.n0YSWa_rowAction,.n0YSWa_actionRow,.n0YSWa_pagination{align-items:center;display:flex}.n0YSWa_statusBar{flex-wrap:wrap;gap:6px 10px;font-size:12px;line-height:18px}.n0YSWa_resultCount{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}.n0YSWa_freshness{overflow-wrap:anywhere;flex:180px;min-width:0}.n0YSWa_refreshButton{flex:none;align-items:center;gap:5px;min-height:28px;padding:3px 9px;font-size:12px;display:inline-flex}.n0YSWa_search{width:100%;min-width:0;color:var(--dsw-alias-label-tertiary);align-items:center;display:flex;position:relative}.n0YSWa_search>svg{pointer-events:none;position:absolute;left:12px}.n0YSWa_search input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:100%;min-width:0;height:36px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;outline:none;padding:0 34px 0 36px;font-size:13px}.n0YSWa_clearSearch{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);background:0 0;border:0;border-radius:5px;justify-content:center;align-items:center;display:inline-flex;position:absolute;right:6px}.n0YSWa_controls{flex-wrap:wrap;gap:8px 14px}.n0YSWa_filterGroup{flex-wrap:wrap;gap:5px}.n0YSWa_filterLabel{font-size:12px;line-height:18px}.n0YSWa_filterButton{min-height:26px;padding:2px 8px;font-size:12px}.n0YSWa_filterCount{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;margin-left:2px}.n0YSWa_filterButton[data-active=true]{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);color:var(--dsw-alias-state-business-primary)}.n0YSWa_sortControl{gap:6px;margin-left:auto}.n0YSWa_sortControl select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-width:0;height:28px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:6px;padding:0 6px;font-size:12px}.n0YSWa_rows{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;flex-direction:column;margin:0;padding:0;list-style:none;display:flex;overflow:hidden}.n0YSWa_row{border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;min-width:0;display:grid}.n0YSWa_row:first-child{border-top:0}.n0YSWa_rowOpen{min-width:0;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;padding:12px 14px}.n0YSWa_rowOpen:hover{background:var(--dsw-alias-interactive-bg-hover)}.n0YSWa_rowPrimary{flex-direction:column;gap:2px;min-width:0;display:flex}.n0YSWa_rowTitle{-webkit-line-clamp:2;overflow-wrap:anywhere;-webkit-box-orient:vertical;font-size:14px;font-weight:600;line-height:19px;display:-webkit-box;overflow:hidden}.n0YSWa_rowPeople,.n0YSWa_rowPackage,.n0YSWa_rowMeta{font-size:11px;line-height:16px}.n0YSWa_rowPackage{color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);text-overflow:ellipsis;white-space:nowrap;display:block;overflow:hidden}.n0YSWa_rowDescription{-webkit-line-clamp:2;color:var(--dsw-alias-label-secondary);-webkit-box-orient:vertical;margin-top:2px;font-size:12px;line-height:18px;display:-webkit-box;overflow:hidden}.n0YSWa_rowMeta{font-variant-numeric:tabular-nums;flex-wrap:wrap;gap:3px 12px;margin-top:2px}.n0YSWa_rowAction{flex:none;padding:12px 14px 12px 0}.n0YSWa_primaryButton,.n0YSWa_secondaryButton,.n0YSWa_dangerButton{min-height:30px;padding:4px 10px;font-size:12px;line-height:18px}.n0YSWa_primaryButton{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-on-primary,white)}.n0YSWa_dangerButton{color:var(--dsw-alias-state-error-primary)}.n0YSWa_detail{flex-direction:column;gap:12px;min-width:0;display:flex}.n0YSWa_backButton{color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border:0;border-radius:6px;align-self:flex-start;align-items:center;gap:4px;padding:4px 8px 4px 4px;font-size:13px;display:inline-flex}.n0YSWa_detailContent{flex-direction:column;gap:12px;min-width:0;display:flex}.n0YSWa_detailTitle{min-width:0}.n0YSWa_detailName{overflow-wrap:anywhere;margin:0;font-size:18px;line-height:26px}.n0YSWa_detailByline,.n0YSWa_detailPackage{overflow-wrap:anywhere;font-size:12px;line-height:18px}.n0YSWa_detailPackage{font-family:var(--ds-font-family-code)}.n0YSWa_detailSection{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:5px;min-width:0;padding-top:10px;display:flex}.n0YSWa_detailSection h4{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.n0YSWa_detailSection p,.n0YSWa_factList dd,.n0YSWa_reviewFacts dd{overflow-wrap:anywhere}.n0YSWa_factList,.n0YSWa_reviewFacts{grid-template-columns:128px minmax(0,1fr);gap:5px 12px;margin:0;display:grid}.n0YSWa_factList div,.n0YSWa_reviewFacts div{display:contents}.n0YSWa_factList dt,.n0YSWa_reviewFacts dt{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.n0YSWa_factList dd,.n0YSWa_reviewFacts dd{min-width:0;margin:0;font-size:12px;line-height:18px}.n0YSWa_riskList{flex-wrap:wrap;gap:5px;margin:0;padding:0;list-style:none;display:flex}.n0YSWa_riskList li{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;border-radius:4px;padding:1px 5px;font-size:11px}.n0YSWa_githubLink{color:var(--dsw-alias-state-business-primary);align-self:flex-start;align-items:center;gap:4px;font-size:13px;line-height:20px;text-decoration:none;display:inline-flex}.n0YSWa_operationPanel{z-index:1;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);min-width:0;box-shadow:0 -4px 16px color-mix(in srgb, var(--dsw-alias-bg-layer-1) 45%, transparent);border-radius:8px;flex-direction:column;gap:9px;padding:12px;display:flex;position:sticky;bottom:8px}.n0YSWa_operationHeading{justify-content:space-between;align-items:flex-start;gap:10px;display:flex}.n0YSWa_operationHeading h4{font-size:13px;line-height:20px}.n0YSWa_operationHeading p,.n0YSWa_capabilityNotice,.n0YSWa_capabilityReady,.n0YSWa_installReason{font-size:12px;line-height:18px}.n0YSWa_capabilityNotice,.n0YSWa_restartNotice,.n0YSWa_operationSuccess,.n0YSWa_operationFailure{border-radius:6px;padding:7px 8px}.n0YSWa_capabilityNotice,.n0YSWa_restartNotice{background:color-mix(in srgb, var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary)) 10%, transparent);color:var(--dsw-alias-label-secondary)}.n0YSWa_capabilityReady,.n0YSWa_operationSuccess{color:var(--dsw-alias-state-success-primary)}.n0YSWa_operationFailure{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);color:var(--dsw-alias-state-error-primary)}.n0YSWa_stateBadge{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);color:var(--dsw-alias-state-business-primary);border-radius:999px;flex:none;padding:2px 7px;font-size:11px;line-height:18px}.n0YSWa_reviewBox{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:6px;flex-direction:column;gap:8px;padding:10px;font-size:12px;line-height:18px;display:flex}.n0YSWa_warningList{color:var(--dsw-alias-label-secondary);flex-direction:column;gap:3px;margin:0;padding-left:18px;display:flex}.n0YSWa_actionRow{flex-wrap:wrap;gap:7px}.n0YSWa_pagination{color:var(--dsw-alias-label-tertiary);flex-wrap:wrap;justify-content:center;gap:8px;font-size:12px}.n0YSWa_visuallyHidden{clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}.n0YSWa_failure button:hover:not(:disabled),.n0YSWa_refreshButton:hover:not(:disabled),.n0YSWa_filterButton:hover:not(:disabled),.n0YSWa_secondaryButton:hover:not(:disabled),.n0YSWa_dangerButton:hover:not(:disabled),.n0YSWa_backButton:hover,.n0YSWa_githubLink:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.n0YSWa_githubLink:hover{background:0 0;text-decoration:underline}.n0YSWa_primaryButton:hover:not(:disabled){filter:brightness(.96)}.n0YSWa_failure button:disabled,.n0YSWa_refreshButton:disabled,.n0YSWa_primaryButton:disabled,.n0YSWa_secondaryButton:disabled,.n0YSWa_dangerButton:disabled{cursor:default;opacity:.55}.n0YSWa_rowOpen:focus-visible,.n0YSWa_search input:focus-visible,.n0YSWa_clearSearch:focus-visible,.n0YSWa_failure button:focus-visible,.n0YSWa_refreshButton:focus-visible,.n0YSWa_filterButton:focus-visible,.n0YSWa_sortControl select:focus-visible,.n0YSWa_primaryButton:focus-visible,.n0YSWa_secondaryButton:focus-visible,.n0YSWa_dangerButton:focus-visible,.n0YSWa_backButton:focus-visible,.n0YSWa_githubLink:focus-visible,.n0YSWa_detailName:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}@media (width<=520px){.n0YSWa_sortControl{margin-left:0}.n0YSWa_row{grid-template-columns:minmax(0,1fr);gap:0}.n0YSWa_rowAction{padding:0 14px 12px}.n0YSWa_rowAction button{width:100%}.n0YSWa_factList,.n0YSWa_reviewFacts{grid-template-columns:minmax(0,1fr);gap:2px}.n0YSWa_factList div,.n0YSWa_reviewFacts div{display:block}.n0YSWa_operationHeading{flex-direction:column}}";
		const tagId = "dsh-plugin-marketplace/PluginMarketplaceSettingsTab.module.css";
		if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-marketplace";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var PluginMarketplaceSettingsTab_module_css_default = {
			"actionRow": "n0YSWa_actionRow",
			"backButton": "n0YSWa_backButton",
			"capabilityNotice": "n0YSWa_capabilityNotice",
			"capabilityReady": "n0YSWa_capabilityReady",
			"clearSearch": "n0YSWa_clearSearch",
			"controls": "n0YSWa_controls",
			"dangerButton": "n0YSWa_dangerButton",
			"detail": "n0YSWa_detail",
			"detailByline": "n0YSWa_detailByline",
			"detailContent": "n0YSWa_detailContent",
			"detailName": "n0YSWa_detailName",
			"detailPackage": "n0YSWa_detailPackage",
			"detailSection": "n0YSWa_detailSection",
			"detailTitle": "n0YSWa_detailTitle",
			"factList": "n0YSWa_factList",
			"failure": "n0YSWa_failure",
			"failureDetail": "n0YSWa_failureDetail",
			"filterButton": "n0YSWa_filterButton",
			"filterCount": "n0YSWa_filterCount",
			"filterGroup": "n0YSWa_filterGroup",
			"filterLabel": "n0YSWa_filterLabel",
			"freshness": "n0YSWa_freshness",
			"githubLink": "n0YSWa_githubLink",
			"inlineError": "n0YSWa_inlineError",
			"installReason": "n0YSWa_installReason",
			"operationFailure": "n0YSWa_operationFailure",
			"operationHeading": "n0YSWa_operationHeading",
			"operationPanel": "n0YSWa_operationPanel",
			"operationSuccess": "n0YSWa_operationSuccess",
			"pagination": "n0YSWa_pagination",
			"primaryButton": "n0YSWa_primaryButton",
			"refreshButton": "n0YSWa_refreshButton",
			"restartNotice": "n0YSWa_restartNotice",
			"resultCount": "n0YSWa_resultCount",
			"reviewBox": "n0YSWa_reviewBox",
			"reviewFacts": "n0YSWa_reviewFacts",
			"riskList": "n0YSWa_riskList",
			"row": "n0YSWa_row",
			"rowAction": "n0YSWa_rowAction",
			"rowDescription": "n0YSWa_rowDescription",
			"rowMeta": "n0YSWa_rowMeta",
			"rowOpen": "n0YSWa_rowOpen",
			"rowPackage": "n0YSWa_rowPackage",
			"rowPeople": "n0YSWa_rowPeople",
			"rowPrimary": "n0YSWa_rowPrimary",
			"rows": "n0YSWa_rows",
			"rowTitle": "n0YSWa_rowTitle",
			"search": "n0YSWa_search",
			"secondaryButton": "n0YSWa_secondaryButton",
			"section": "n0YSWa_section",
			"skeletonList": "n0YSWa_skeletonList",
			"sortControl": "n0YSWa_sortControl",
			"stateBadge": "n0YSWa_stateBadge",
			"status": "n0YSWa_status",
			"statusBar": "n0YSWa_statusBar",
			"visuallyHidden": "n0YSWa_visuallyHidden",
			"warningList": "n0YSWa_warningList"
		};
		//#endregion
		//#region src/client/PluginMarketplaceSettingsTab.tsx
		function formatTime(iso) {
			const time = Date.parse(iso);
			return Number.isNaN(time) ? iso : new Intl.DateTimeFormat(void 0, { dateStyle: "medium" }).format(time);
		}
		function requestFor(query, filter, sort, page) {
			return {
				query: query.trim(),
				installability: filter === "one-click" ? "one-click-eligible" : filter,
				sort: sort === "updated" ? "recently-updated" : sort === "added" ? "recently-added" : sort,
				page
			};
		}
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
			"restart-required": "operation.warning.restart"
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
		function PluginRow({ plugin, t, onOpen, onInstall, rowRef, canInstall }) {
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
						className: PluginMarketplaceSettingsTab_module_css_default.rowPrimary,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
								className: PluginMarketplaceSettingsTab_module_css_default.rowTitle,
								title: plugin.name,
								children: plugin.name
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.rowPeople,
								children: [t("row.publisher", { publisher: plugin.publisher }), plugin.author && plugin.author !== plugin.publisher ? ` · ${t("row.author", { author: plugin.author })}` : ""]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
								className: PluginMarketplaceSettingsTab_module_css_default.rowPackage,
								children: plugin.packageName ?? plugin.repositoryFullName
							}),
							plugin.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.rowDescription,
								children: plugin.description
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.rowMeta,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("card.stars", { count: plugin.stars }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("card.pushed", { time: formatTime(plugin.lastCodePushAt) }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: plugin.license ?? t("detail.license.missing") })
								]
							})
						]
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.rowAction,
					children: manual ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
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
					})
				})]
			});
		}
		function OperationPanel({ plugin, profile, t, planOperation, executeOperation, onSnapshot, activateTab, initialAction, onInitialActionConsumed }) {
			const pluginState = profile?.plugins.find((entry) => entry.repositoryId === plugin.id);
			const [review, setReview] = (0, react.useState)(null);
			const [result, setResult] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [working, setWorking] = (0, react.useState)(false);
			const restartPending = pluginState?.state === "pending-install" || pluginState?.state === "pending-update" || pluginState?.state === "pending-removal";
			const installed = pluginState?.installedSpec !== null && pluginState?.installedSpec !== void 0;
			const canInstall = canChangeProfile(profile);
			const requestPlan = (action) => {
				setWorking(true);
				setError(null);
				setResult(null);
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
			}, [initialAction]);
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
							review.warnings.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: PluginMarketplaceSettingsTab_module_css_default.warningList,
								children: review.warnings.map((warning) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t(WARNING_KEYS[warning]) }, warning))
							}) : null,
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
								disabled: working || restartPending || !canInstall || plugin.installability !== "one-click-eligible",
								onClick: () => {
									requestPlan("install");
								},
								children: t("install.action")
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
					!installed && plugin.installability !== "one-click-eligible" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.installReason,
						children: t("install.unavailable")
					}) : null
				]
			});
		}
		function PluginDetail({ plugin, profile, t, onBack, planOperation, executeOperation, onSnapshot, activateTab, initialAction, onInitialActionConsumed }) {
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
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										ref: headingRef,
										tabIndex: -1,
										className: PluginMarketplaceSettingsTab_module_css_default.detailName,
										children: plugin.name
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: PluginMarketplaceSettingsTab_module_css_default.detailByline,
										children: [t("row.publisher", { publisher: plugin.publisher }), plugin.author && plugin.author !== plugin.publisher ? ` · ${t("row.author", { author: plugin.author })}` : ""]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: PluginMarketplaceSettingsTab_module_css_default.detailPackage,
										children: [plugin.packageName ?? plugin.repositoryFullName, plugin.packageVersion ? ` · ${plugin.packageVersion}` : ""]
									})
								]
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
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("detail.stars.label") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: t("card.stars", { count: plugin.stars }) })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("detail.created") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatTime(plugin.repositoryCreatedAt) })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("detail.pushed") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatTime(plugin.lastCodePushAt) })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("detail.firstSeen") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatTime(plugin.firstSeenAt) })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("detail.license") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: plugin.license ?? t("detail.license.missing") })] })
									]
								})]
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
		function PluginMarketplaceSettingsTab({ bootstrap, list, detail, refresh, operationSnapshot, plan, execute, activateTab, t }) {
			const [model, setModel] = (0, react.useState)(null);
			const [profile, setProfile] = (0, react.useState)(null);
			const [query, setQuery] = (0, react.useState)("");
			const [filter, setFilter] = (0, react.useState)("all");
			const [sort, setSort] = (0, react.useState)("recommended");
			const [page, setPage] = (0, react.useState)(1);
			const [refreshing, setRefreshing] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [loadAttempt, setLoadAttempt] = (0, react.useState)(0);
			const [selectedId, setSelectedId] = (0, react.useState)(null);
			const [detailState, setDetailState] = (0, react.useState)({ status: "idle" });
			const [initialAction, setInitialAction] = (0, react.useState)(null);
			const bootstrapped = (0, react.useRef)(false);
			const rowNodes = (0, react.useRef)(/* @__PURE__ */ new Map());
			const request = (0, react.useMemo)(() => requestFor(query, filter, sort, page), [
				query,
				filter,
				sort,
				page
			]);
			(0, react.useEffect)(() => {
				let current = true;
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
				}).then(setProfile).catch((cause) => {
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
				setSelectedId(id);
			};
			const installPlugin = (id) => {
				setInitialAction("install");
				setSelectedId(id);
			};
			const backToList = () => {
				const id = selectedId;
				setSelectedId(null);
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
			if (selectedId !== null) {
				if (detailState.status === "ready") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.section,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginDetail, {
						plugin: detailState.plugin,
						profile,
						t,
						onBack: backToList,
						planOperation: plan,
						executeOperation: execute,
						onSnapshot: setProfile,
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
			const filterCounts = {
				all: model.counts.all,
				"one-click": model.counts.oneClick,
				manual: model.counts.manual
			};
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
								children: t("results.count", { count: model.total })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.freshness,
								children: [
									freshnessAt ? t(model.source === "cache" ? "status.cached" : "status.updated", { time: formatTime(freshnessAt) }) : null,
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
					}),
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
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: PluginMarketplaceSettingsTab_module_css_default.filterGroup,
							role: "group",
							"aria-label": t("filter.installability"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.filterLabel,
								children: t("filter.installability")
							}), [
								"all",
								"one-click",
								"manual"
							].map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: PluginMarketplaceSettingsTab_module_css_default.filterButton,
								"aria-pressed": filter === value,
								"data-active": filter === value,
								onClick: () => {
									setFilter(value);
									setPage(1);
								},
								children: [
									t(`filter.${value}`),
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: PluginMarketplaceSettingsTab_module_css_default.filterCount,
										children: filterCounts[value]
									})
								]
							}, value))]
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
						})]
					}),
					model.total === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.status,
						children: query ? t("state.emptySearch") : t("state.empty")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: PluginMarketplaceSettingsTab_module_css_default.rows,
						children: model.items.map((plugin) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginRow, {
							plugin,
							t,
							onOpen: openPlugin,
							onInstall: installPlugin,
							rowRef,
							canInstall
						}, plugin.id))
					}),
					model.pageCount > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("nav", {
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
			"filter.one-click": "可自动安装",
			"filter.manual": "手动安装",
			"compatibility.compatible": "兼容",
			"compatibility.incompatible": "不兼容",
			"compatibility.unknown": "兼容性未知",
			"installability.browse-only": "仅浏览",
			"installability.manual": "手动安装",
			"installability.one-click-eligible": "可自动安装",
			"maintenance.active": "活跃",
			"maintenance.archived": "已归档",
			"sort.label": "排序",
			"sort.relevance": "相关性",
			"sort.recommended": "推荐",
			"sort.stars": "Stars 最多",
			"sort.pushed": "最近代码更新",
			"sort.updated": "最近代码更新",
			"sort.added": "最近收录",
			"row.publisher": "发布者：{publisher}",
			"row.owner": "GitHub 所有者：{owner}",
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
			"install.unavailable": "该条目未达到安全的自动安装条件，请先在 GitHub 查看说明。",
			"install.action": "自动安装",
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
			"filter.one-click": "Automatic install",
			"filter.manual": "Manual",
			"compatibility.compatible": "Compatible",
			"compatibility.incompatible": "Incompatible",
			"compatibility.unknown": "Compatibility unknown",
			"installability.browse-only": "Browse only",
			"installability.manual": "Manual install",
			"installability.one-click-eligible": "Automatic install",
			"maintenance.active": "Active",
			"maintenance.archived": "Archived",
			"sort.label": "Sort",
			"sort.relevance": "Relevance",
			"sort.recommended": "Recommended",
			"sort.stars": "Most stars",
			"sort.pushed": "Recently updated",
			"sort.updated": "Recently updated",
			"sort.added": "Recently added",
			"row.publisher": "Publisher: {publisher}",
			"row.owner": "GitHub owner: {owner}",
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
			"install.unavailable": "This entry does not meet safe automatic-install criteria. Review its GitHub instructions first.",
			"install.action": "Install automatically",
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
			bootstrap: (request) => apiCall("bootstrap", request),
			list: (request) => apiCall("list", request),
			detail: (request) => apiCall("detail", request),
			refresh: (request) => apiCall("refresh", request),
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
				bootstrap: (request) => bootstrapMarketplace(remote, request),
				list: (request) => listMarketplace(remote, request),
				detail: (repositoryId) => detailMarketplace(remote, repositoryId),
				refresh: (request, currentDigest) => refreshMarketplace(remote, request, currentDigest),
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