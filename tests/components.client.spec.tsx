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
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

function translate(key: keyof typeof en, values?: Record<string, string | number>): string {
  let text = en[key]
  for (const [name, value] of Object.entries(values ?? {})) text = text.replace(`{${name}}`, String(value))
  return text
}

const operationSnapshot: MarketplaceOperationSnapshot = {
  profileName: 'web',
  busy: false,
  capabilities: { packageManager: 'pnpm', profileWritable: true, profileName: 'web', message: null },
  plugins: [],
}

const detail: MarketplacePluginDetailModel = {
  id: 'plugin-1', name: 'Weather Bundle', description: 'Weather tools for DSH users who need reliable forecasts.',
  packageName: '@example/weather-bundle', packageVersion: '1.0.0', repositoryFullName: 'example/weather-bundle',
  repositoryUrl: 'https://github.com/example/weather-bundle', publisher: 'example', author: 'Example Inc.', license: 'MIT', topics: [], keywords: [],
  stars: 42, repositoryCreatedAt: '2026-01-01T00:00:00.000Z', lastCodePushAt: '2026-08-13T00:00:00.000Z', firstSeenAt: '2026-08-14T00:00:00.000Z',
  validationStatus: 'valid', validationMessage: null, compatibility: 'compatible', installability: 'one-click-eligible', riskSignals: [], sourceRef: 'git+https://example.test/weather.git#abc',
}

function listModel(page = 1): MarketplaceListModel {
  return {
    digest: `digest-${page}`, catalogStatus: 'ready', source: 'cache', stale: false, generatedAt: '2026-08-14T00:00:00.000Z', lastSuccessfulFetchAt: '2026-08-14T00:00:00.000Z',
    total: 51, counts: { all: 51, oneClick: 50, manual: 1 }, page, pageCount: 2, error: null,
    items: [{ id: `plugin-${page}`, name: page === 1 ? 'Weather Bundle' : 'Second page plugin', publisher: 'example', author: 'Example Inc.', packageName: '@example/weather-bundle', packageVersion: '1.0.0', repositoryFullName: 'example/weather-bundle', repositoryUrl: 'https://github.com/example/weather-bundle', description: 'Weather tools for DSH users who need reliable forecasts.', license: 'MIT', stars: 42, lastCodePushAt: '2026-08-13T00:00:00.000Z', firstSeenAt: '2026-08-14T00:00:00.000Z', installability: 'one-click-eligible', compatibility: 'compatible' }],
  }
}

function renderTab(overrides: Partial<PluginMarketplaceSettingsTabProps> = {}) {
  const list = vi.fn(async (request: { page: number }) => listModel(request.page))
  const props = {
    bootstrap: vi.fn(async () => ({ list: listModel(), operations: operationSnapshot })),
    list,
    detail: vi.fn(async () => detail),
    refresh: vi.fn(async () => ({ changed: false, list: null, source: 'cache' as const, stale: false, lastSuccessfulFetchAt: '2026-08-14T00:00:00.000Z', error: null })),
    operationSnapshot: vi.fn(async () => operationSnapshot),
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
  it('renders a dense row and requires a Host review before executing an install', async () => {
    const props = renderTab()
    await screen.findByText('Weather Bundle')
    expect(screen.getByText(/Publisher: example/)).toBeTruthy()
    expect(screen.getByText(/Author: Example Inc./)).toBeTruthy()
    expect(screen.queryByText('W')).toBeNull()

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

  it('delegates the 50-item page boundary and filtering/sorting to the Host list API', async () => {
    const props = renderTab()
    await screen.findByText('Weather Bundle')
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Catalog pagination' })).getByRole('button', { name: 'Next' }))
    await screen.findByText('Second page plugin')
    expect(props.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, installability: 'all', sort: 'recommended' }))

    fireEvent.click(screen.getByRole('button', { name: /^Manual/ }))
    await waitFor(() => expect(props.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, installability: 'manual' })))
  })

  it('keeps a cached catalog visible when its background refresh fails', async () => {
    renderTab({ refresh: vi.fn(async () => { throw new Error('offline') }) })

    await screen.findByText('Weather Bundle')
    expect((await screen.findByRole('alert')).textContent).toBe('Refresh failed; the current catalog was preserved.')
    expect(screen.getByText('Weather Bundle')).toBeTruthy()
  })

  it('offers a real bootstrap retry after the first catalog request is unavailable', async () => {
    const unavailable = {
      ...listModel(),
      catalogStatus: 'unavailable' as const,
      source: 'none' as const,
      total: 0,
      counts: { all: 0, oneClick: 0, manual: 0 },
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
