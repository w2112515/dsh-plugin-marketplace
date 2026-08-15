// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronLeftOutline14: () => null,
  IconCloseOutline16: () => null,
  IconRefreshOutline16: () => null,
  IconRightUpOutline14: () => null,
  IconSearchOutline16: () => null,
}))

import { PluginMarketplaceSettingsTab, type PluginMarketplaceSettingsTabProps } from '../src/client/PluginMarketplaceSettingsTab.tsx'
import type { MarketplaceListModel, MarketplaceOperationSnapshot, MarketplacePluginDetailModel } from '../src/client/marketplace-adapter.ts'
import type { MarketplaceInstalledResponse } from '../src/types.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

function translate(key: keyof typeof en, values?: Record<string, string | number>): string {
  let text = en[key]
  for (const [name, value] of Object.entries(values ?? {})) text = text.replace(`{${name}}`, String(value))
  return text
}

const capabilities = { packageManager: 'pnpm' as const, profileWritable: true, profileName: 'web', message: null }

const activeState = {
  repositoryId: 'plugin-1',
  packageName: '@example/weather-bundle',
  state: 'active' as const,
  installedVersion: '1.0.0',
  installedSpec: 'git+https://example.test/weather.git#abc',
  installedRepository: 'example/weather-bundle',
  catalogSpec: 'git+https://example.test/weather.git#abc',
  catalogRelation: 'up-to-date' as const,
  updateAvailable: false,
}

const operationSnapshot: MarketplaceOperationSnapshot = {
  profileName: 'web',
  busy: false,
  capabilities,
  plugins: [],
  external: [],
}

const detail: MarketplacePluginDetailModel = {
  id: 'plugin-1', name: 'Weather Bundle', description: 'Weather tools for DSH users who need reliable forecasts.',
  packageName: '@example/weather-bundle', packageVersion: '1.0.0', repositoryFullName: 'example/weather-bundle',
  repositoryUrl: 'https://github.com/example/weather-bundle', publisher: 'example', author: 'Example Inc.', license: 'MIT', topics: [], keywords: [],
  stars: 42, repositoryCreatedAt: '2026-01-01T00:00:00.000Z', lastCodePushAt: '2026-08-13T00:00:00.000Z', firstSeenAt: '2026-08-14T00:00:00.000Z',
  category: 'tool',
  validationStatus: 'valid', validationMessage: null, compatibility: 'compatible', installability: 'one-click-eligible', riskSignals: [], sourceRef: 'git+https://example.test/weather.git#abc',
}

const rowItem = {
  id: 'plugin-1', name: 'Weather Bundle', publisher: 'example', author: 'Example Inc.', packageName: '@example/weather-bundle', packageVersion: '1.0.0',
  repositoryFullName: 'example/weather-bundle', repositoryUrl: 'https://github.com/example/weather-bundle',
  description: 'Weather tools for DSH users who need reliable forecasts.', license: 'MIT', stars: 42,
  repositoryCreatedAt: '2026-01-01T00:00:00.000Z', lastCodePushAt: '2026-08-13T00:00:00.000Z', firstSeenAt: '2026-08-14T00:00:00.000Z',
  category: 'tool' as const, installability: 'one-click-eligible' as const, compatibility: 'compatible' as const,
}

const summaryPlugin = {
  repositoryId: 'plugin-1', name: rowItem.name, publisher: rowItem.publisher, author: rowItem.author,
  packageName: rowItem.packageName, packageVersion: rowItem.packageVersion,
  repositoryFullName: rowItem.repositoryFullName, repositoryUrl: rowItem.repositoryUrl,
  description: rowItem.description, license: rowItem.license, stars: rowItem.stars,
  repositoryCreatedAt: rowItem.repositoryCreatedAt, lastCodePushAt: rowItem.lastCodePushAt, firstSeenAt: rowItem.firstSeenAt,
  category: rowItem.category, installability: rowItem.installability, compatibility: rowItem.compatibility, riskSignals: [],
}

function listModel(page = 1): MarketplaceListModel {
  return {
    digest: `digest-${page}`, catalogStatus: 'ready', source: 'cache', stale: false, generatedAt: '2026-08-14T00:00:00.000Z', lastSuccessfulFetchAt: '2026-08-14T00:00:00.000Z',
    total: 51, counts: { all: 51, oneClick: 50, manual: 1, categories: { theme: 0, ui: 0, tool: 1, memory: 0 }, uncategorized: 50 }, page, pageCount: 2, error: null,
    items: [{ ...rowItem, id: `plugin-${page}`, name: page === 1 ? 'Weather Bundle' : 'Second page plugin' }],
  }
}

function installedModel(items: MarketplaceInstalledResponse['items'] = [], external: MarketplaceInstalledResponse['external'] = []): MarketplaceInstalledResponse {
  return { profileName: 'web', busy: false, capabilities, items, external }
}

function renderTab(overrides: Partial<PluginMarketplaceSettingsTabProps> = {}) {
  const list = vi.fn(async (request: { page: number }) => listModel(request.page))
  const props = {
    bootstrap: vi.fn(async () => ({ list: listModel(), operations: operationSnapshot })),
    list,
    detail: vi.fn(async () => detail),
    refresh: vi.fn(async () => ({ changed: false, list: null, source: 'cache' as const, stale: false, lastSuccessfulFetchAt: '2026-08-14T00:00:00.000Z', error: null })),
    operationSnapshot: vi.fn(async () => operationSnapshot),
    installed: vi.fn(async () => installedModel()),
    plan: vi.fn(async () => ({ status: 'ready' as const, planId: 'plan-1' as never, blockCode: null, action: 'install' as const, profileName: 'web', repositoryId: 'plugin-1', packageName: '@example/weather-bundle', packageVersion: '1.0.0', sourceRef: detail.sourceRef, commitSha: 'abc', warnings: ['restart-required'] as const, expiresAt: null })),
    execute: vi.fn(async () => ({ status: 'succeeded' as const, code: 'succeeded' as const, action: 'install' as const, profileName: 'web', packageName: '@example/weather-bundle', requiresRestart: true, rollback: 'not-needed' as const, snapshot: operationSnapshot })),
    activateTab: vi.fn(),
    t: translate as PluginMarketplaceSettingsTabProps['t'],
    ...overrides,
  } as unknown as PluginMarketplaceSettingsTabProps
  render(<PluginMarketplaceSettingsTab {...props} />)
  return props
}

describe('PluginMarketplaceSettingsTab', () => {
  it('renders a dense row with avatar, category, dates and requires a Host review before installing', async () => {
    const props = renderTab()
    await screen.findByText('Weather Bundle')
    expect(screen.getByText(/Publisher: example/)).toBeTruthy()
    expect(document.querySelector('img[src*="github.com/example.png"]')).not.toBeNull()
    expect(screen.getAllByText('Tools').length).toBeGreaterThan(0)
    expect(screen.getByText(/Published/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Install automatically' }))
    await screen.findByText('Review profile change')
    expect(props.plan).toHaveBeenCalledWith({ repositoryId: 'plugin-1', action: 'install' })

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and update profile' }))
    await screen.findByText('Install was written to the profile; restart to apply it.')
    expect(props.execute).toHaveBeenCalledWith('plan-1')

    const back = screen.getByRole('button', { name: 'Back to list' })
    fireEvent.click(back)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /Weather Bundle/ })))
  })

  it('falls back to a letter tile when the GitHub avatar cannot load', async () => {
    renderTab()
    await screen.findByText('Weather Bundle')
    const avatar = document.querySelector('img')
    expect(avatar?.getAttribute('src')).toContain('github.com/example.png')
    fireEvent.error(avatar as Element)
    await screen.findByText('W')
    expect(document.querySelector('img')).toBeNull()
  })

  it('delegates paging, category, and installability segments to the Host list API', async () => {
    const props = renderTab()
    await screen.findByText('Weather Bundle')
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Catalog pagination' })).getByRole('button', { name: 'Next' }))
    await screen.findByText('Second page plugin')
    expect(props.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, category: 'all', installability: 'all', sort: 'recommended' }))

    fireEvent.click(screen.getByRole('button', { name: /^Tools/ }))
    await waitFor(() => expect(props.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, category: 'tool' })))

    fireEvent.change(screen.getByLabelText(/Eligibility/), { target: { value: 'manual' } })
    await waitFor(() => expect(props.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, installability: 'manual' })))
  })

  it('lists installed plugins with state, manages removal through the Host review, and shows external packages read-only', async () => {
    const snapshotWithPlugin: MarketplaceOperationSnapshot = { ...operationSnapshot, plugins: [activeState] }
    const props = renderTab({
      bootstrap: vi.fn(async () => ({ list: listModel(), operations: snapshotWithPlugin })),
      installed: vi.fn(async () => installedModel(
        [{ state: activeState, plugin: summaryPlugin }],
        [{ packageName: '@elsewhere/tool', installedSpec: '1.2.3', activeAtLaunch: true, activeAfterRestart: true }],
      )),
      plan: vi.fn(async () => ({ status: 'ready' as const, planId: 'plan-9' as never, blockCode: null, action: 'remove' as const, profileName: 'web', repositoryId: 'plugin-1', packageName: '@example/weather-bundle', packageVersion: '1.0.0', sourceRef: detail.sourceRef, commitSha: 'abc', warnings: ['restart-required'] as const, expiresAt: null })),
    })

    await screen.findByText('Weather Bundle')
    fireEvent.click(screen.getByRole('button', { name: /^Installed/ }))
    await screen.findAllByText('Active')
    expect(screen.getByText('@elsewhere/tool')).toBeTruthy()
    expect(screen.getByText('Packages outside the catalog')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Remove plugin' }))
    await screen.findByText('Review profile change')
    expect(props.plan).toHaveBeenCalledWith({ repositoryId: 'plugin-1', action: 'remove' })
  })

  it('shows spec-derived identity without management actions for off-catalog and diverged installs', async () => {
    const offCatalog = {
      repositoryId: null, packageName: 'dsh-plugin-marketplace', state: 'active' as const,
      installedVersion: '0.2.0', installedSpec: 'github:w2112515/dsh-plugin-marketplace#d739a886ae0608ce5cd6b4398ef16313fe21776d',
      installedRepository: 'w2112515/dsh-plugin-marketplace',
      catalogSpec: null, catalogRelation: 'not-in-catalog' as const, updateAvailable: false,
    }
    const diverged = {
      ...activeState, catalogSpec: 'git+https://example.test/weather.git#def',
      catalogRelation: 'diverged' as const,
    }
    renderTab({
      installed: vi.fn(async () => installedModel([
        { state: offCatalog, plugin: null },
        { state: diverged, plugin: summaryPlugin },
      ])),
    })

    await screen.findByText('Weather Bundle')
    fireEvent.click(screen.getByRole('button', { name: /^Installed/ }))
    // Off-catalog row: identity comes from the installed spec, never from a
    // same-name catalog entry, and no update/remove funnel is offered.
    await screen.findByText('Not in catalog')
    expect(screen.getByText('w2112515/dsh-plugin-marketplace')).toBeTruthy()
    expect(screen.getByText(/Publisher: w2112515/)).toBeTruthy()
    // Diverged row: neutral chip, no update funnel, but removal stays available.
    expect(screen.getByText('Differs from catalog')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Update plugin' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Remove plugin' })).toHaveLength(1)
  })

  it('keeps a cached catalog visible when its background refresh fails', async () => {
    renderTab({ refresh: vi.fn(async () => { throw new Error('offline') }) })

    await screen.findByText('Weather Bundle')
    expect((await screen.findByRole('alert')).textContent).toBe('Refresh failed; the current catalog was preserved.')
    expect(screen.getByText('Weather Bundle')).toBeTruthy()
  })

  it('replaces the install action with a manual-instructions link for manual-only entries', async () => {
    const manualList = { ...listModel(), items: [{ ...rowItem, installability: 'manual' as const }] }
    renderTab({
      bootstrap: vi.fn(async () => ({ list: manualList, operations: operationSnapshot })),
      list: vi.fn(async () => manualList),
      detail: vi.fn(async () => ({ ...detail, installability: 'manual' as const })),
    })
    await screen.findByText('Weather Bundle')
    fireEvent.click(screen.getByRole('button', { name: 'View manual instructions' }))
    await screen.findByText('About')
    expect(screen.queryByRole('button', { name: 'Install automatically' })).toBeNull()
    const link = screen.getByRole('link', { name: /View manual instructions/ })
    expect(link.getAttribute('href')).toBe('https://github.com/example/weather-bundle')
  })

  it('offers a real bootstrap retry after the first catalog request is unavailable', async () => {
    const unavailable = {
      ...listModel(),
      catalogStatus: 'unavailable' as const,
      source: 'none' as const,
      total: 0,
      counts: { all: 0, oneClick: 0, manual: 0, categories: { theme: 0, ui: 0, tool: 0, memory: 0 }, uncategorized: 0 },
      pageCount: 0,
      items: [],
      error: { code: 'network-error' as const, message: 'offline', retryable: true },
    }
    const bootstrap = vi.fn(async () => ({ list: unavailable, operations: operationSnapshot }))
    renderTab({ bootstrap })

    await screen.findByRole('button', { name: 'Retry' })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(2))
  })
})
