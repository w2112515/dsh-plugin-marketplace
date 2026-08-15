import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IconChevronLeftOutline14, IconCloseOutline16, IconRefreshOutline16, IconRightUpOutline14, IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  MarketplaceListModel,
  MarketplaceListRequest,
  MarketplaceOperationPlan,
  MarketplaceOperationResult,
  MarketplaceOperationSnapshot,
  MarketplacePlanRequest,
  MarketplacePluginDetailModel,
  MarketplacePluginRowModel,
} from './marketplace-adapter.ts'
import type { PluginMarketplaceLocaleKey } from './locales.ts'
import css from './PluginMarketplaceSettingsTab.module.css'

export interface PluginMarketplaceSettingsTabInjected {
  bootstrap: (request: MarketplaceListRequest) => Promise<{ readonly list: MarketplaceListModel; readonly operations: MarketplaceOperationSnapshot }>
  list: (request: MarketplaceListRequest) => Promise<MarketplaceListModel>
  detail: (repositoryId: string) => Promise<MarketplacePluginDetailModel | null>
  refresh: (request: MarketplaceListRequest, currentDigest: string) => Promise<{ readonly changed: boolean; readonly list: MarketplaceListModel | null; readonly source: MarketplaceListModel['source']; readonly stale: boolean; readonly lastSuccessfulFetchAt: string | null; readonly error: MarketplaceListModel['error'] }>
  operationSnapshot: () => Promise<MarketplaceOperationSnapshot>
  plan: (request: MarketplacePlanRequest) => Promise<MarketplaceOperationPlan>
  execute: (planId: NonNullable<MarketplaceOperationPlan['planId']>) => Promise<MarketplaceOperationResult>
  activateTab: (id: string) => void
}

export type PluginMarketplaceSettingsTabProps = PropsRuntime<'settings.plugins.tab'> & PropsLocale<'settings.pluginMarketplace'> & InjectFace<PluginMarketplaceSettingsTabInjected>
type Translate = PluginMarketplaceSettingsTabProps['t']
type InstallFilter = 'all' | 'one-click' | 'manual'
type SortKey = 'recommended' | 'stars' | 'updated' | 'added'
type DetailState = { readonly status: 'idle' | 'loading' } | { readonly status: 'ready'; readonly plugin: MarketplacePluginDetailModel } | { readonly status: 'missing' | 'error'; readonly message?: string }

function formatTime(iso: string): string {
  const time = Date.parse(iso)
  return Number.isNaN(time) ? iso : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(time)
}

function requestFor(query: string, filter: InstallFilter, sort: SortKey, page: number): MarketplaceListRequest {
  return {
    query: query.trim(),
    installability: filter === 'one-click' ? 'one-click-eligible' : filter,
    sort: sort === 'updated' ? 'recently-updated' : sort === 'added' ? 'recently-added' : sort,
    page,
  }
}

const ACTION_KEYS = {
  install: 'operation.action.install', update: 'operation.action.update', remove: 'operation.action.remove',
} satisfies Record<NonNullable<MarketplaceOperationPlan['action']>, PluginMarketplaceLocaleKey>

const STATE_KEYS = {
  'not-installed': 'operation.state.not-installed', active: 'operation.state.active', 'pending-install': 'operation.state.pending-install',
  'pending-update': 'operation.state.pending-update', 'pending-removal': 'operation.state.pending-removal', 'installed-inactive': 'operation.state.installed-inactive',
} satisfies Record<MarketplaceOperationSnapshot['plugins'][number]['state'], PluginMarketplaceLocaleKey>

const WARNING_KEYS = {
  'compatibility-unknown': 'operation.warning.compatibility', 'git-source': 'operation.warning.git', 'code-executes-on-restart': 'operation.warning.code',
  'install-scripts-disabled': 'operation.warning.scripts', 'restart-required': 'operation.warning.restart',
} satisfies Record<MarketplaceOperationPlan['warnings'][number], PluginMarketplaceLocaleKey>

const RISK_KEYS = {
  'repository-archived': 'risk.repository-archived',
  'git-source': 'risk.git-source',
  'unpinned-source': 'risk.unpinned-source',
  'lifecycle-script': 'risk.lifecycle-script',
  'build-script': 'risk.build-script',
} satisfies Record<MarketplacePluginDetailModel['riskSignals'][number], PluginMarketplaceLocaleKey>

function canChangeProfile(profile: MarketplaceOperationSnapshot | null): boolean {
  return profile !== null && profile.capabilities.profileWritable && profile.capabilities.packageManager !== 'unavailable'
}

function CapabilityNotice({ profile, t }: { profile: MarketplaceOperationSnapshot | null; t: Translate }): ReactNode {
  if (profile === null) return <p className={css.capabilityNotice}>{t('operation.capability.checking')}</p>
  const { capabilities } = profile
  if (!capabilities.profileWritable) return <p className={css.capabilityNotice}>{capabilities.message ?? t('operation.capability.profileReadOnly')}</p>
  if (capabilities.packageManager === 'unavailable') return <p className={css.capabilityNotice}>{capabilities.message ?? t('operation.capability.pnpmMissing')}</p>
  return <p className={css.capabilityReady}>{t(capabilities.packageManager === 'corepack-pnpm' ? 'operation.capability.corepackReady' : 'operation.capability.ready')}</p>
}

function PluginRow({ plugin, t, onOpen, onInstall, rowRef, canInstall }: {
  plugin: MarketplacePluginRowModel
  t: Translate
  onOpen: (id: string) => void
  onInstall: (id: string) => void
  rowRef: (id: string, node: HTMLButtonElement | null) => void
  canInstall: boolean
}): ReactNode {
  const manual = plugin.installability === 'manual'
  return <li className={css.row}>
    <button ref={(node) => { rowRef(plugin.id, node) }} className={css.rowOpen} type="button" data-plugin-id={plugin.id} onClick={() => { onOpen(plugin.id) }}>
      <span className={css.rowPrimary}>
        <strong className={css.rowTitle} title={plugin.name}>{plugin.name}</strong>
        <span className={css.rowPeople}>{t('row.publisher', { publisher: plugin.publisher })}{plugin.author && plugin.author !== plugin.publisher ? ` · ${t('row.author', { author: plugin.author })}` : ''}</span>
        <code className={css.rowPackage}>{plugin.packageName ?? plugin.repositoryFullName}</code>
        {plugin.description ? <span className={css.rowDescription}>{plugin.description}</span> : null}
        <span className={css.rowMeta}><span>{t('card.stars', { count: plugin.stars })}</span><span>{t('card.pushed', { time: formatTime(plugin.lastCodePushAt) })}</span><span>{plugin.license ?? t('detail.license.missing')}</span></span>
      </span>
    </button>
    <div className={css.rowAction}>
      {manual
        ? <button type="button" className={css.secondaryButton} onClick={() => { onOpen(plugin.id) }}>{t('row.manualAction')}</button>
        : <button type="button" className={css.primaryButton} disabled={!canInstall} title={canInstall ? undefined : t('operation.capability.unavailableTitle')} onClick={() => { onInstall(plugin.id) }}>{t('row.installAction')}</button>}
    </div>
  </li>
}

function OperationPanel({ plugin, profile, t, planOperation, executeOperation, onSnapshot, activateTab, initialAction, onInitialActionConsumed }: {
  plugin: MarketplacePluginDetailModel
  profile: MarketplaceOperationSnapshot | null
  t: Translate
  planOperation: PluginMarketplaceSettingsTabInjected['plan']
  executeOperation: PluginMarketplaceSettingsTabInjected['execute']
  onSnapshot: (snapshot: MarketplaceOperationSnapshot) => void
  activateTab: (id: string) => void
  initialAction: MarketplacePlanRequest['action'] | null
  onInitialActionConsumed: () => void
}): ReactNode {
  const pluginState = profile?.plugins.find(entry => entry.repositoryId === plugin.id)
  const [review, setReview] = useState<MarketplaceOperationPlan | null>(null)
  const [result, setResult] = useState<MarketplaceOperationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const restartPending = pluginState?.state === 'pending-install' || pluginState?.state === 'pending-update' || pluginState?.state === 'pending-removal'
  const installed = pluginState?.installedSpec !== null && pluginState?.installedSpec !== undefined
  const canInstall = canChangeProfile(profile)
  const requestPlan = (action: MarketplacePlanRequest['action']): void => {
    setWorking(true); setError(null); setResult(null)
    void planOperation({ repositoryId: plugin.id, action }).then(setReview).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    }).finally(() => { setWorking(false) })
  }
  useEffect(() => {
    if (initialAction === null) return
    onInitialActionConsumed()
    if (initialAction === 'install' && canInstall && !installed && !restartPending) requestPlan('install')
  // Navigation intent triggers once; Host capability and profile state above remain the gate.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction])
  const confirm = (): void => {
    if (review?.planId === null || review?.planId === undefined) return
    setWorking(true); setError(null)
    void executeOperation(review.planId).then((next) => {
      setResult(next); onSnapshot(next.snapshot)
      if (next.status === 'succeeded') setReview(null)
    }).catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)) }).finally(() => { setWorking(false) })
  }
  return <aside className={css.operationPanel} aria-label={t('install.title')} aria-busy={working}>
    <div className={css.operationHeading}><div><h4>{t('install.title')}</h4><p>{profile ? t('operation.profile', { profile: profile.profileName }) : t('operation.loading')}</p></div>{pluginState ? <span className={css.stateBadge}>{t(STATE_KEYS[pluginState.state])}</span> : null}</div>
    <CapabilityNotice profile={profile} t={t} />
    {restartPending ? <p className={css.restartNotice} role="status">{t('operation.restartPending')}</p> : null}
    {result ? <p className={result.status === 'succeeded' ? css.operationSuccess : css.operationFailure} role="status">{result.status === 'succeeded' ? t('operation.succeeded', { action: t(ACTION_KEYS[result.action ?? 'install']) }) : t('operation.failed', { code: result.code, rollback: result.rollback })}</p> : null}
    {error ? <p className={css.operationFailure} role="alert">{t('operation.transportError', { error })}</p> : null}
    {review?.status === 'blocked' ? <div className={css.reviewBox} role="status"><strong>{t('operation.blocked')}</strong><p>{t('operation.blockedReason', { code: review.blockCode ?? 'unknown' })}</p><button type="button" className={css.secondaryButton} onClick={() => { setReview(null) }}>{t('operation.dismiss')}</button></div> : null}
    {review?.status === 'ready' ? <div className={css.reviewBox}><strong>{t('operation.reviewTitle')}</strong><dl className={css.reviewFacts}><div><dt>{t('operation.reviewAction')}</dt><dd>{t(ACTION_KEYS[review.action ?? 'install'])}</dd></div><div><dt>{t('operation.reviewProfile')}</dt><dd>{review.profileName}</dd></div><div><dt>{t('operation.reviewPackage')}</dt><dd>{review.packageName} · {review.packageVersion}</dd></div><div><dt>{t('operation.reviewCommit')}</dt><dd><code>{review.commitSha}</code></dd></div></dl>{review.warnings.length > 0 ? <ul className={css.warningList}>{review.warnings.map(warning => <li key={warning}>{t(WARNING_KEYS[warning])}</li>)}</ul> : null}<div className={css.actionRow}><button type="button" className={css.primaryButton} disabled={working} onClick={confirm}>{working ? t('operation.working') : t('operation.confirm')}</button><button type="button" className={css.secondaryButton} disabled={working} onClick={() => { setReview(null) }}>{t('operation.cancel')}</button></div></div> : null}
    {review === null ? <div className={css.actionRow}>
      {!installed ? <button type="button" className={css.primaryButton} disabled={working || restartPending || !canInstall || plugin.installability !== 'one-click-eligible'} onClick={() => { requestPlan('install') }}>{t('install.action')}</button> : null}
      {installed && pluginState?.updateAvailable && !restartPending ? <button type="button" className={css.primaryButton} disabled={working || !canInstall} onClick={() => { requestPlan('install') }}>{t('operation.update')}</button> : null}
      {pluginState?.state === 'active' ? <button type="button" className={css.secondaryButton} onClick={() => { activateTab('configurable') }}>{t('operation.configure')}</button> : null}
      {installed && !restartPending ? <button type="button" className={css.dangerButton} disabled={working || !canInstall} onClick={() => { requestPlan('remove') }}>{t('operation.remove')}</button> : null}
    </div> : null}
    {pluginState?.state === 'active' ? <p className={css.installReason}>{t('operation.configureHint')}</p> : null}
    {!installed && plugin.installability !== 'one-click-eligible' ? <p className={css.installReason}>{t('install.unavailable')}</p> : null}
  </aside>
}

function PluginDetail({ plugin, profile, t, onBack, planOperation, executeOperation, onSnapshot, activateTab, initialAction, onInitialActionConsumed }: {
  plugin: MarketplacePluginDetailModel
  profile: MarketplaceOperationSnapshot | null
  t: Translate
  onBack: () => void
  planOperation: PluginMarketplaceSettingsTabInjected['plan']
  executeOperation: PluginMarketplaceSettingsTabInjected['execute']
  onSnapshot: (snapshot: MarketplaceOperationSnapshot) => void
  activateTab: (id: string) => void
  initialAction: MarketplacePlanRequest['action'] | null
  onInitialActionConsumed: () => void
}): ReactNode {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const visibleRisks = plugin.riskSignals.filter(risk => risk !== 'git-source')
  useEffect(() => { headingRef.current?.focus() }, [plugin.id])
  return <div className={css.detail}>
    <button className={css.backButton} type="button" onClick={onBack}><IconChevronLeftOutline14 aria-hidden="true" />{t('detail.back')}</button>
    <div className={css.detailContent}>
      <header className={css.detailTitle}><h3 ref={headingRef} tabIndex={-1} className={css.detailName}>{plugin.name}</h3><p className={css.detailByline}>{t('row.publisher', { publisher: plugin.publisher })}{plugin.author && plugin.author !== plugin.publisher ? ` · ${t('row.author', { author: plugin.author })}` : ''}</p><p className={css.detailPackage}>{plugin.packageName ?? plugin.repositoryFullName}{plugin.packageVersion ? ` · ${plugin.packageVersion}` : ''}</p></header>
      {plugin.description ? <section className={css.detailSection}><h4>{t('detail.about')}</h4><p>{plugin.description}</p></section> : null}
      <section className={css.detailSection}><h4>{t('detail.activity')}</h4><dl className={css.factList}><div><dt>{t('detail.stars.label')}</dt><dd>{t('card.stars', { count: plugin.stars })}</dd></div><div><dt>{t('detail.created')}</dt><dd>{formatTime(plugin.repositoryCreatedAt)}</dd></div><div><dt>{t('detail.pushed')}</dt><dd>{formatTime(plugin.lastCodePushAt)}</dd></div><div><dt>{t('detail.firstSeen')}</dt><dd>{formatTime(plugin.firstSeenAt)}</dd></div><div><dt>{t('detail.license')}</dt><dd>{plugin.license ?? t('detail.license.missing')}</dd></div></dl></section>
      <section className={css.detailSection}><h4>{t('detail.validation')}</h4><p>{t(`detail.validation.${plugin.validationStatus}` as PluginMarketplaceLocaleKey)}{plugin.validationMessage ? ` · ${plugin.validationMessage}` : ''}</p></section>
      <section className={css.detailSection}><h4>{t('detail.compatibility')}</h4><p>{t(`compatibility.${plugin.compatibility}` as PluginMarketplaceLocaleKey)}</p></section>
      <section className={css.detailSection}><h4>{t('detail.source')}</h4><p>{t('detail.source.git', { ref: plugin.sourceRef })}</p></section>
      {visibleRisks.length > 0 ? <section className={css.detailSection}><h4>{t('detail.risks')}</h4><ul className={css.riskList}>{visibleRisks.map(risk => <li key={risk}>{t(RISK_KEYS[risk])}</li>)}</ul></section> : null}
      <a className={css.githubLink} href={plugin.repositoryUrl} target="_blank" rel="noreferrer noopener">{t('detail.viewOnGithub')}<IconRightUpOutline14 aria-hidden="true" /></a>
    </div>
    <OperationPanel plugin={plugin} profile={profile} t={t} planOperation={planOperation} executeOperation={executeOperation} onSnapshot={onSnapshot} activateTab={activateTab} initialAction={initialAction} onInitialActionConsumed={onInitialActionConsumed} />
  </div>
}

export function PluginMarketplaceSettingsTab({ bootstrap, list, detail, refresh, operationSnapshot, plan, execute, activateTab, t }: PluginMarketplaceSettingsTabProps): ReactNode {
  const [model, setModel] = useState<MarketplaceListModel | null>(null)
  const [profile, setProfile] = useState<MarketplaceOperationSnapshot | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<InstallFilter>('all')
  const [sort, setSort] = useState<SortKey>('recommended')
  const [page, setPage] = useState(1)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle' })
  const [initialAction, setInitialAction] = useState<MarketplacePlanRequest['action'] | null>(null)
  const bootstrapped = useRef(false)
  const rowNodes = useRef(new Map<string, HTMLButtonElement>())
  const request = useMemo(() => requestFor(query, filter, sort, page), [query, filter, sort, page])

  useEffect(() => {
    let current = true
    if (!bootstrapped.current) {
      void bootstrap(request).then(({ list: next, operations }) => {
        if (!current) return
        bootstrapped.current = true; setModel(next); setProfile(operations); setError(next.error?.message ?? null)
        void refresh(request, next.digest).then((update) => {
          if (!current) return
          if (update.list !== null) setModel(update.list)
          else setModel(previous => previous === null ? previous : { ...previous, source: update.source, stale: update.stale, lastSuccessfulFetchAt: update.lastSuccessfulFetchAt, error: update.error })
          setError(update.error?.message ?? null)
        }).catch((cause: unknown) => { if (current) setError(cause instanceof Error ? cause.message : String(cause)) })
      }).catch((cause: unknown) => { if (current) setError(cause instanceof Error ? cause.message : String(cause)) })
    } else {
      void list(request).then((next) => { if (current) { setModel(next); setError(next.error?.message ?? null) } }).catch((cause: unknown) => { if (current) setError(cause instanceof Error ? cause.message : String(cause)) })
    }
    return () => { current = false }
  }, [bootstrap, list, refresh, request, loadAttempt])

  useEffect(() => {
    if (selectedId === null) { setDetailState({ status: 'idle' }); return }
    let current = true
    setDetailState({ status: 'loading' })
    void detail(selectedId).then((plugin) => {
      if (!current) return
      setDetailState(plugin === null ? { status: 'missing' } : { status: 'ready', plugin })
    }).catch((cause: unknown) => { if (current) setDetailState({ status: 'error', message: cause instanceof Error ? cause.message : String(cause) }) })
    return () => { current = false }
  }, [detail, selectedId])

  const onRefresh = (): void => {
    if (model === null) return
    setRefreshing(true); setError(null)
    void refresh(request, model.digest).then((update) => {
      if (update.list !== null) setModel(update.list)
      else setModel(previous => previous === null ? previous : { ...previous, source: update.source, stale: update.stale, lastSuccessfulFetchAt: update.lastSuccessfulFetchAt, error: update.error })
      setError(update.error?.message ?? null)
      return operationSnapshot()
    }).then(setProfile).catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)) }).finally(() => { setRefreshing(false) })
  }
  const rowRef = (id: string, node: HTMLButtonElement | null): void => { if (node) rowNodes.current.set(id, node); else rowNodes.current.delete(id) }
  const openPlugin = (id: string): void => { setInitialAction(null); setSelectedId(id) }
  const installPlugin = (id: string): void => { setInitialAction('install'); setSelectedId(id) }
  const backToList = (): void => {
    const id = selectedId; setSelectedId(null); setInitialAction(null)
    if (id !== null) requestAnimationFrame(() => { const node = rowNodes.current.get(id); node?.focus(); node?.scrollIntoView?.({ block: 'nearest' }) })
  }
  const retryBootstrap = (): void => {
    bootstrapped.current = false
    setModel(null)
    setError(null)
    setLoadAttempt(attempt => attempt + 1)
  }

  if (selectedId !== null) {
    if (detailState.status === 'ready') return <div className={css.section}><PluginDetail plugin={detailState.plugin} profile={profile} t={t} onBack={backToList} planOperation={plan} executeOperation={execute} onSnapshot={setProfile} activateTab={activateTab} initialAction={initialAction} onInitialActionConsumed={() => { setInitialAction(null) }} /></div>
    return <div className={css.section}><button className={css.backButton} type="button" onClick={backToList}><IconChevronLeftOutline14 aria-hidden="true" />{t('detail.back')}</button><p className={css.status} aria-live="polite">{detailState.status === 'loading' ? t('detail.loading') : t('detail.error')}</p></div>
  }
  if (model === null) {
    if (error) return <div className={css.section}><div className={css.failure}><p role="alert">{t('state.error.title')}</p><p className={css.failureDetail}>{t('state.error.detail')}</p><button type="button" onClick={retryBootstrap}>{t('state.retry')}</button></div></div>
    return <div className={css.section} aria-busy="true"><p className={css.status}>{t('state.loading')}</p><div className={css.skeletonList} aria-hidden="true"><div /><div /><div /></div></div>
  }
  if (model.catalogStatus === 'unavailable' && model.items.length === 0) {
    return <div className={css.section}><div className={css.failure}><p role="alert">{t('state.error.title')}</p><p className={css.failureDetail}>{t('state.error.detail')}</p><button type="button" onClick={retryBootstrap}>{t('state.retry')}</button></div></div>
  }
  const freshnessAt = model.lastSuccessfulFetchAt ?? model.generatedAt
  const canInstall = canChangeProfile(profile)
  const filterCounts: Record<InstallFilter, number> = {
    all: model.counts.all,
    'one-click': model.counts.oneClick,
    manual: model.counts.manual,
  }
  return <div className={css.section} aria-busy={refreshing}>
    <div className={css.statusBar}><span className={css.resultCount} role="status" aria-live="polite">{t('results.count', { count: model.total })}</span><span className={css.freshness}>{freshnessAt ? t(model.source === 'cache' ? 'status.cached' : 'status.updated', { time: formatTime(freshnessAt) }) : null}{model.stale ? ` · ${t('status.stale')}` : ''}{model.catalogStatus === 'unavailable' ? ` · ${t('status.offline')}` : ''}</span><button className={css.refreshButton} type="button" onClick={onRefresh} disabled={refreshing} aria-label={t('refresh')}><IconRefreshOutline16 size={14} aria-hidden="true" />{refreshing ? t('refreshing') : t('refresh')}</button></div>
    {error ? <p className={css.inlineError} role="alert">{t('status.refreshError')}</p> : null}
    {!canInstall ? <CapabilityNotice profile={profile} t={t} /> : null}
    <label className={css.search}><IconSearchOutline16 aria-hidden="true" /><span className={css.visuallyHidden}>{t('search')}</span><input type="search" value={query} placeholder={t('search')} onChange={(event) => { setQuery(event.currentTarget.value); setPage(1) }} />{query.length > 0 ? <button className={css.clearSearch} type="button" aria-label={t('clearSearch')} onClick={() => { setQuery(''); setPage(1) }}><IconCloseOutline16 size={12} aria-hidden="true" /></button> : null}</label>
    <div className={css.controls}><div className={css.filterGroup} role="group" aria-label={t('filter.installability')}><span className={css.filterLabel}>{t('filter.installability')}</span>{(['all', 'one-click', 'manual'] as const).map(value => <button key={value} type="button" className={css.filterButton} aria-pressed={filter === value} data-active={filter === value} onClick={() => { setFilter(value); setPage(1) }}>{t(`filter.${value}` as PluginMarketplaceLocaleKey)} <span className={css.filterCount}>{filterCounts[value]}</span></button>)}</div><label className={css.sortControl}><span className={css.filterLabel}>{t('sort.label')}</span><select value={sort} onChange={(event) => { setSort(event.currentTarget.value as SortKey); setPage(1) }}><option value="recommended">{t('sort.recommended')}</option><option value="stars">{t('sort.stars')}</option><option value="updated">{t('sort.updated')}</option><option value="added">{t('sort.added')}</option></select></label></div>
    {model.total === 0 ? <p className={css.status}>{query ? t('state.emptySearch') : t('state.empty')}</p> : <ul className={css.rows}>{model.items.map(plugin => <PluginRow key={plugin.id} plugin={plugin} t={t} onOpen={openPlugin} onInstall={installPlugin} rowRef={rowRef} canInstall={canInstall} />)}</ul>}
    {model.pageCount > 1 ? <nav className={css.pagination} aria-label={t('pagination.label')}><button type="button" className={css.secondaryButton} disabled={model.page === 1} onClick={() => { setPage(model.page - 1) }}>{t('pagination.previous')}</button><span aria-live="polite">{t('pagination.page', { page: model.page, total: model.pageCount })}</span><button type="button" className={css.secondaryButton} disabled={model.page === model.pageCount} onClick={() => { setPage(model.page + 1) }}>{t('pagination.next')}</button></nav> : null}
  </div>
}
