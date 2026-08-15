/** Browser half of the external bundle: same-origin API client and Settings tab contribution. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import {
  bootstrapMarketplace,
  detailMarketplace,
  detailMarketplacePack,
  executeMarketplaceOperation,
  installedMarketplace,
  listMarketplace,
  listMarketplacePacks,
  planMarketplaceOperation,
  readOperationSnapshot,
  refreshMarketplace,
  type MarketplaceCatalogRemoteFace,
} from './marketplace-adapter.ts'
import { PluginMarketplaceSettingsTab, type PluginMarketplaceSettingsTabInjected } from './PluginMarketplaceSettingsTab.tsx'
import { en, zh, type PluginMarketplaceLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.pluginMarketplace': PluginMarketplaceLocaleKey
  }
}

export const NS = 'settings.pluginMarketplace'
export const inject = ['slots', 'locale']

interface ApiSuccess<T> { readonly ok: true; readonly value: T }
interface ApiFailure { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

async function apiCall<T>(method: string, params?: unknown): Promise<T> {
  const response = await fetch('/api/plugin-marketplace', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, ...(params === undefined ? {} : { params }) }),
  })
  const result = await response.json() as ApiSuccess<T> | ApiFailure
  if (!response.ok || !result.ok) {
    const message = result.ok ? `Marketplace API returned HTTP ${String(response.status)}` : result.error.message
    throw new Error(message)
  }
  return result.value
}

const remote: MarketplaceCatalogRemoteFace = {
  bootstrap: request => apiCall('bootstrap', request),
  list: request => apiCall('list', request),
  detail: request => apiCall('detail', request),
  refresh: request => apiCall('refresh', request),
  operationSnapshot: () => apiCall('operationSnapshot'),
  installed: () => apiCall('installed'),
  packs: () => apiCall('packs'),
  packDetail: request => apiCall('packDetail', request),
  plan: request => apiCall('plan', request),
  execute: request => apiCall('execute', request),
}

function activateSettingsPluginTab(id: string): void {
  const suffix = `-tab-${id}`
  const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"][id]')]
    .find(element => element.id.endsWith(suffix))
  tab?.click()
  tab?.focus()
}

/** Register the Marketplace tab without changing any DSH workspace package. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'plugin-marketplace: dictionaries')
  const t = ctx.locale.bind(NS)
  const injected = (): PluginMarketplaceSettingsTabInjected => ({
    bootstrap: request => bootstrapMarketplace(remote, request),
    list: request => listMarketplace(remote, request),
    detail: repositoryId => detailMarketplace(remote, repositoryId),
    refresh: (request, currentDigest) => refreshMarketplace(remote, request, currentDigest),
    operationSnapshot: () => readOperationSnapshot(remote),
    installed: () => installedMarketplace(remote),
    packs: () => listMarketplacePacks(remote),
    packDetail: repositoryId => detailMarketplacePack(remote, repositoryId),
    plan: request => planMarketplaceOperation(remote, request),
    execute: (planId, allowScripts) => executeMarketplaceOperation(remote, planId, allowScripts),
    activateTab: activateSettingsPluginTab,
    dateLocale: () => ctx.locale.getLocale().active,
  })
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'marketplace',
    order: 20,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, PluginMarketplaceSettingsTab))
}
