import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  IconChevronLeftOutline14,
  IconCloseOutline16,
  IconRefreshOutline16,
  IconRightUpOutline14,
  IconSearchOutline16,
  IconWarningOutline16,
  Pill,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  MarketplaceCatalogModel,
  MarketplaceOperationPlan,
  MarketplaceOperationResult,
  MarketplaceOperationSnapshot,
  MarketplacePlanRequest,
  MarketplacePluginModel,
  MarketplaceRiskSignal,
} from './marketplace-adapter.ts'
import type { PluginMarketplaceLocaleKey } from './locales.ts'
import css from './PluginMarketplaceSettingsTab.module.css'

/** Registration-side face used by the tab; supplied by the package adapter. */
export interface PluginMarketplaceSettingsTabInjected {
  /** Read the current in-memory / last-known-good catalog model. */
  snapshot: () => Promise<MarketplaceCatalogModel>
  /** Refresh the catalog through the Host and read the resulting model. */
  refresh: () => Promise<MarketplaceCatalogModel>
  /** Read package state in the exact profile that booted this WebUI. */
  operationSnapshot: () => Promise<MarketplaceOperationSnapshot>
  /** Produce a short-lived, exact operation review. */
  plan: (request: MarketplacePlanRequest) => Promise<MarketplaceOperationPlan>
  /** Execute one reviewed plan exactly once. */
  execute: (planId: NonNullable<MarketplaceOperationPlan['planId']>) => Promise<MarketplaceOperationResult>
  /** Select another tab in the surrounding DSH plugin settings section. */
  activateTab: (id: string) => void
}

/** Full component props assembled by the Settings slot renderer. */
export type PluginMarketplaceSettingsTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.pluginMarketplace'>
  & InjectFace<PluginMarketplaceSettingsTabInjected>

type Translate = PluginMarketplaceSettingsTabProps['t']

type CompatibilityFilter = 'all' | MarketplacePluginModel['compatibility']
type InstallabilityFilter = 'all' | MarketplacePluginModel['installability']
type MaintenanceFilter = 'all' | 'active' | 'archived'
type SortKey = 'relevance' | 'stars' | 'pushed' | 'added'

interface Filters {
  compatibility: CompatibilityFilter
  installability: InstallabilityFilter
  maintenance: MaintenanceFilter
}

const DEFAULT_FILTERS: Filters = { compatibility: 'all', installability: 'all', maintenance: 'all' }

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly model: MarketplaceCatalogModel }

/** Localized date without a runtime dependency; falls back to the raw value. */
function formatTime(iso: string): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return iso
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(time)
}

/** Deterministic letter fallback for a plugin identity (no external avatars). */
function letterOf(name: string): string {
  const match = /[a-z0-9]/i.exec(name)
  return (match?.[0] ?? '?').toUpperCase()
}

/** Whether one plugin matches the normalized local query. */
function matchesQuery(plugin: MarketplacePluginModel, query: string): boolean {
  if (query.length === 0) return true
  return [
    plugin.name,
    plugin.description ?? '',
    plugin.author ?? '',
    plugin.packageName ?? '',
    plugin.repositoryFullName,
    ...plugin.topics,
    ...plugin.keywords,
  ].some(value => value.toLocaleLowerCase().includes(query))
}

/** Relevance score used only when a query is active. */
function relevance(plugin: MarketplacePluginModel, query: string): number {
  if (query.length === 0) return 0
  let score = 0
  if (plugin.name.toLocaleLowerCase().includes(query)) score += 4
  if (plugin.packageName?.toLocaleLowerCase().includes(query)) score += 4
  if (plugin.description?.toLocaleLowerCase().includes(query)) score += 2
  if (plugin.author?.toLocaleLowerCase().includes(query)) score += 1
  if (plugin.topics.some(topic => topic.toLocaleLowerCase().includes(query))) score += 1
  if (plugin.keywords.some(keyword => keyword.toLocaleLowerCase().includes(query))) score += 1
  return score
}

/** Apply the maintenance (archived) filter dimension. */
function matchesMaintenance(plugin: MarketplacePluginModel, filter: MaintenanceFilter): boolean {
  if (filter === 'active') return !plugin.archived
  if (filter === 'archived') return plugin.archived
  return true
}

/** Filter + sort the full catalog locally; never triggers any request. */
function selectVisible(
  plugins: readonly MarketplacePluginModel[],
  query: string,
  filters: Filters,
  sort: SortKey,
): MarketplacePluginModel[] {
  const visible = plugins.filter(plugin =>
    matchesQuery(plugin, query)
    && (filters.compatibility === 'all' || plugin.compatibility === filters.compatibility)
    && (filters.installability === 'all' || plugin.installability === filters.installability)
    && matchesMaintenance(plugin, filters.maintenance))
  const byStars = (a: MarketplacePluginModel, b: MarketplacePluginModel) => b.stars - a.stars
  switch (sort) {
    case 'stars':
      return [...visible].sort(byStars)
    case 'pushed':
      return [...visible].sort((a, b) => Date.parse(b.lastCodePushAt) - Date.parse(a.lastCodePushAt))
    case 'added':
      return [...visible].sort((a, b) => Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt))
    case 'relevance':
      if (query.length === 0) return visible
      return [...visible].sort((a, b) => relevance(b, query) - relevance(a, query) || byStars(a, b))
  }
}

const COMPATIBILITY_KEYS = {
  compatible: 'compatibility.compatible',
  incompatible: 'compatibility.incompatible',
  unknown: 'compatibility.unknown',
} satisfies Record<MarketplacePluginModel['compatibility'], PluginMarketplaceLocaleKey>

const INSTALLABILITY_KEYS = {
  'browse-only': 'installability.browse-only',
  manual: 'installability.manual',
  'one-click-eligible': 'installability.one-click-eligible',
} satisfies Record<MarketplacePluginModel['installability'], PluginMarketplaceLocaleKey>

const RISK_KEYS = {
  'repository-archived': 'risk.repository-archived',
  'git-source': 'risk.git-source',
  'unpinned-source': 'risk.unpinned-source',
  'lifecycle-script': 'risk.lifecycle-script',
  'build-script': 'risk.build-script',
} satisfies Record<MarketplaceRiskSignal, PluginMarketplaceLocaleKey>

const WARNING_KEYS = {
  'compatibility-unknown': 'operation.warning.compatibility',
  'git-source': 'operation.warning.git',
  'code-executes-on-restart': 'operation.warning.code',
  'install-scripts-disabled': 'operation.warning.scripts',
  'restart-required': 'operation.warning.restart',
} satisfies Record<MarketplaceOperationPlan['warnings'][number], PluginMarketplaceLocaleKey>

const ACTION_KEYS = {
  install: 'operation.action.install',
  update: 'operation.action.update',
  remove: 'operation.action.remove',
} satisfies Record<NonNullable<MarketplaceOperationPlan['action']>, PluginMarketplaceLocaleKey>

const STATE_KEYS = {
  'not-installed': 'operation.state.not-installed',
  active: 'operation.state.active',
  'pending-install': 'operation.state.pending-install',
  'pending-update': 'operation.state.pending-update',
  'pending-removal': 'operation.state.pending-removal',
  'installed-inactive': 'operation.state.installed-inactive',
} satisfies Record<MarketplaceOperationSnapshot['plugins'][number]['state'], PluginMarketplaceLocaleKey>

const VALIDATION_KEYS = {
  valid: 'detail.validation.valid',
  invalid: 'detail.validation.invalid',
  archived: 'detail.validation.archived',
} satisfies Record<MarketplacePluginModel['validationStatus'], PluginMarketplaceLocaleKey>

/** Compact compatibility + eligibility badge pair shared by card and detail. */
function StatusBadges({ plugin, t }: { plugin: MarketplacePluginModel; t: Translate }): ReactNode {
  return (
    <span className={css.badges}>
      <span className={css.badge} data-tone={plugin.compatibility}>
        {t(COMPATIBILITY_KEYS[plugin.compatibility])}
      </span>
      <span className={css.badge} data-tone={plugin.installability}>
        {t(INSTALLABILITY_KEYS[plugin.installability])}
      </span>
    </span>
  )
}

/** One plugin card in the catalog grid. */
function PluginCard({ plugin, t, onOpen, cardRef }: {
  plugin: MarketplacePluginModel
  t: Translate
  onOpen: (id: string) => void
  cardRef: (id: string, node: HTMLButtonElement | null) => void
}): ReactNode {
  const risks = plugin.riskSignals
  return (
    <li className={css.card}>
      <button
        ref={(node) => { cardRef(plugin.id, node) }}
        className={css.cardContent}
        type="button"
        data-plugin-id={plugin.id}
        onClick={() => { onOpen(plugin.id) }}
      >
        <span className={css.cardHead}>
          <span className={css.letterTile} aria-hidden="true">{letterOf(plugin.name)}</span>
          <span className={css.cardIdentity}>
            <strong className={css.cardTitle} title={plugin.name}>{plugin.name}</strong>
            <span className={css.cardPackage} title={plugin.packageName ?? plugin.repositoryFullName}>
              {plugin.packageName ?? plugin.repositoryFullName}
            </span>
          </span>
          <StatusBadges plugin={plugin} t={t} />
        </span>
        {plugin.description ? <span className={css.cardDescription}>{plugin.description}</span> : null}
        <span className={css.cardMeta}>
          <span className={css.metaItem}>{t('card.stars', { count: plugin.stars })}</span>
          <span className={css.metaItem}>{t('card.pushed', { time: formatTime(plugin.lastCodePushAt) })}</span>
          {plugin.license ? <span className={css.metaItem}>{plugin.license}</span> : null}
        </span>
        {risks.length > 0 ? (
          <span className={css.cardRisks}>
            <IconWarningOutline16 size={12} aria-hidden="true" />
            {risks.map(risk => t(RISK_KEYS[risk])).join(' · ')}
          </span>
        ) : null}
      </button>
    </li>
  )
}

/** Safe profile operation controls with an explicit plan-review-confirm boundary. */
function OperationPanel({ plugin, profile, t, planOperation, executeOperation, onSnapshot, activateTab }: {
  plugin: MarketplacePluginModel
  profile: MarketplaceOperationSnapshot | null
  t: Translate
  planOperation: PluginMarketplaceSettingsTabInjected['plan']
  executeOperation: PluginMarketplaceSettingsTabInjected['execute']
  onSnapshot: (snapshot: MarketplaceOperationSnapshot) => void
  activateTab: (id: string) => void
}): ReactNode {
  const pluginState = profile?.plugins.find(entry => entry.repositoryId === plugin.id)
  const [review, setReview] = useState<MarketplaceOperationPlan | null>(null)
  const [result, setResult] = useState<MarketplaceOperationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const restartPending = pluginState?.state === 'pending-install'
    || pluginState?.state === 'pending-update'
    || pluginState?.state === 'pending-removal'
  const installed = pluginState?.installedSpec !== null && pluginState?.installedSpec !== undefined

  const requestPlan = (action: MarketplacePlanRequest['action']): void => {
    setWorking(true)
    setError(null)
    setResult(null)
    void planOperation({ repositoryId: plugin.id, action }).then((next) => {
      setReview(next)
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    }).finally(() => { setWorking(false) })
  }

  const confirm = (): void => {
    if (review?.planId === null || review?.planId === undefined) return
    setWorking(true)
    setError(null)
    void executeOperation(review.planId).then((next) => {
      setResult(next)
      onSnapshot(next.snapshot)
      if (next.status === 'succeeded') setReview(null)
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    }).finally(() => { setWorking(false) })
  }

  return (
    <section className={css.operationPanel} aria-busy={working}>
      <div className={css.operationHeading}>
        <div>
          <h4>{t('install.title')}</h4>
          <p>{profile ? t('operation.profile', { profile: profile.profileName }) : t('operation.loading')}</p>
        </div>
        {pluginState ? <span className={css.stateBadge}>{t(STATE_KEYS[pluginState.state])}</span> : null}
      </div>
      <p className={css.installEligibility}>
        {t('install.eligibility', {
          source: plugin.sourceRef,
          eligibility: t(INSTALLABILITY_KEYS[plugin.installability]),
        })}
      </p>
      {restartPending ? <p className={css.restartNotice} role="status">{t('operation.restartPending')}</p> : null}
      {result ? (
        <p className={result.status === 'succeeded' ? css.operationSuccess : css.operationFailure} role="status">
          {result.status === 'succeeded'
            ? t('operation.succeeded', { action: t(ACTION_KEYS[result.action ?? 'install']) })
            : t('operation.failed', { code: result.code, rollback: result.rollback })}
        </p>
      ) : null}
      {error ? <p className={css.operationFailure} role="alert">{t('operation.transportError', { error })}</p> : null}
      {review?.status === 'blocked' ? (
        <div className={css.reviewBox} role="status">
          <strong>{t('operation.blocked')}</strong>
          <p>{t('operation.blockedReason', { code: review.blockCode ?? 'unknown' })}</p>
          <button type="button" className={css.secondaryButton} onClick={() => { setReview(null) }}>
            {t('operation.dismiss')}
          </button>
        </div>
      ) : null}
      {review?.status === 'ready' ? (
        <div className={css.reviewBox}>
          <strong>{t('operation.reviewTitle')}</strong>
          <dl className={css.reviewFacts}>
            <div><dt>{t('operation.reviewAction')}</dt><dd>{t(ACTION_KEYS[review.action ?? 'install'])}</dd></div>
            <div><dt>{t('operation.reviewProfile')}</dt><dd>{review.profileName}</dd></div>
            <div><dt>{t('operation.reviewPackage')}</dt><dd>{review.packageName} · {review.packageVersion}</dd></div>
            <div><dt>{t('operation.reviewCommit')}</dt><dd><code>{review.commitSha}</code></dd></div>
          </dl>
          <ul className={css.warningList}>
            {review.warnings.map(warning => <li key={warning}>{t(WARNING_KEYS[warning])}</li>)}
          </ul>
          <div className={css.actionRow}>
            <button type="button" className={css.primaryButton} disabled={working} onClick={confirm}>
              {working ? t('operation.working') : t('operation.confirm')}
            </button>
            <button type="button" className={css.secondaryButton} disabled={working} onClick={() => { setReview(null) }}>
              {t('operation.cancel')}
            </button>
          </div>
        </div>
      ) : null}
      {review === null ? (
        <div className={css.actionRow}>
          {!installed ? (
            <button
              type="button"
              className={css.primaryButton}
              disabled={working || restartPending || plugin.installability !== 'one-click-eligible' || profile === null}
              onClick={() => { requestPlan('install') }}
            >
              {t('install.action')}
            </button>
          ) : null}
          {installed && pluginState.updateAvailable && !restartPending ? (
            <button type="button" className={css.primaryButton} disabled={working} onClick={() => { requestPlan('install') }}>
              {t('operation.update')}
            </button>
          ) : null}
          {pluginState?.state === 'active' ? (
            <button type="button" className={css.secondaryButton} onClick={() => { activateTab('configurable') }}>
              {t('operation.configure')}
            </button>
          ) : null}
          {installed && !restartPending ? (
            <button type="button" className={css.dangerButton} disabled={working} onClick={() => { requestPlan('remove') }}>
              {t('operation.remove')}
            </button>
          ) : null}
        </div>
      ) : null}
      {!installed && plugin.installability !== 'one-click-eligible' ? (
        <p className={css.installReason}>{t('install.unavailable')}</p>
      ) : null}
      {pluginState?.state === 'active' ? <p className={css.installReason}>{t('operation.configureHint')}</p> : null}
    </section>
  )
}

/** Inline detail sub-view for one plugin; replaces the list inside the tab. */
function PluginDetail({ plugin, profile, t, onBack, planOperation, executeOperation, onSnapshot, activateTab }: {
  plugin: MarketplacePluginModel
  profile: MarketplaceOperationSnapshot | null
  t: Translate
  onBack: () => void
  planOperation: PluginMarketplaceSettingsTabInjected['plan']
  executeOperation: PluginMarketplaceSettingsTabInjected['execute']
  onSnapshot: (snapshot: MarketplaceOperationSnapshot) => void
  activateTab: (id: string) => void
}): ReactNode {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { headingRef.current?.focus() }, [plugin.id])
  return (
    <div className={css.detail}>
      <div className={css.detailHeader}>
        <button className={css.backButton} type="button" onClick={onBack}>
          <IconChevronLeftOutline14 aria-hidden="true" />
          {t('detail.back')}
        </button>
      </div>
      <div className={css.detailTitle}>
        <span className={css.letterTile} data-size="large" aria-hidden="true">{letterOf(plugin.name)}</span>
        <div className={css.detailIdentity}>
          <h3 ref={headingRef} tabIndex={-1} className={css.detailName}>{plugin.name}</h3>
          <p className={css.detailPackage}>
            {plugin.packageName ?? plugin.repositoryFullName}
            {plugin.packageVersion ? ` · ${plugin.packageVersion}` : ''}
          </p>
        </div>
        <StatusBadges plugin={plugin} t={t} />
      </div>
      {plugin.description ? (
        <section className={css.detailSection}>
          <h4>{t('detail.about')}</h4>
          <p>{plugin.description}</p>
        </section>
      ) : null}
      <section className={css.detailSection}>
        <h4>{t('detail.compatibility')}</h4>
        <p>{t(COMPATIBILITY_KEYS[plugin.compatibility])}</p>
      </section>
      <section className={css.detailSection}>
        <h4>{t('detail.validation')}</h4>
        <p>{t(VALIDATION_KEYS[plugin.validationStatus])}</p>
        {plugin.validationMessage ? <p className={css.validationMessage}>{plugin.validationMessage}</p> : null}
      </section>
      <section className={css.detailSection}>
        <h4>{t('detail.source')}</h4>
        <p>{t('detail.source.git', { ref: plugin.sourceRef })}</p>
      </section>
      <section className={css.detailSection}>
        <h4>{t('detail.risks')}</h4>
        {plugin.riskSignals.length === 0 ? <p>{t('detail.risks.none')}</p> : (
          <ul className={css.riskList}>
            {plugin.riskSignals.map(risk => <li key={risk}>{t(RISK_KEYS[risk])}</li>)}
          </ul>
        )}
      </section>
      <section className={css.detailSection}>
        <h4>{t('detail.activity')}</h4>
        <dl className={css.factList}>
          <div>
            <dt>{t('detail.stars.label')}</dt>
            <dd>{t('card.stars', { count: plugin.stars })}</dd>
          </div>
          <div>
            <dt>{t('detail.created')}</dt>
            <dd>{formatTime(plugin.repositoryCreatedAt)}</dd>
          </div>
          <div>
            <dt>{t('detail.pushed')}</dt>
            <dd>{formatTime(plugin.lastCodePushAt)}</dd>
          </div>
          <div>
            <dt>{t('detail.firstSeen')}</dt>
            <dd>{formatTime(plugin.firstSeenAt)}</dd>
          </div>
        </dl>
      </section>
      <section className={css.detailSection}>
        <dl className={css.factList}>
          <div>
            <dt>{t('detail.author')}</dt>
            <dd>{plugin.author ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('detail.license')}</dt>
            <dd>{plugin.license ?? t('detail.license.missing')}</dd>
          </div>
        </dl>
      </section>
      {plugin.topics.length > 0 ? (
        <section className={css.detailSection}>
          <h4>{t('detail.topics')}</h4>
          <ul className={css.tokenList}>
            {plugin.topics.map(topic => <li key={topic}>{topic}</li>)}
          </ul>
        </section>
      ) : null}
      {plugin.keywords.length > 0 ? (
        <section className={css.detailSection}>
          <h4>{t('detail.keywords')}</h4>
          <ul className={css.tokenList}>
            {plugin.keywords.map(keyword => <li key={keyword}>{keyword}</li>)}
          </ul>
        </section>
      ) : null}
      <OperationPanel
        plugin={plugin}
        profile={profile}
        t={t}
        planOperation={planOperation}
        executeOperation={executeOperation}
        onSnapshot={onSnapshot}
        activateTab={activateTab}
      />
      <a
        className={css.githubLink}
        href={plugin.repositoryUrl}
        target="_blank"
        rel="noreferrer noopener"
      >
        {t('detail.viewOnGithub')}
        <IconRightUpOutline14 aria-hidden="true" />
      </a>
    </div>
  )
}

/** One labeled filter-chip dimension. */
function FilterGroup<K extends string>({ label, options, value, onChange }: {
  label: string
  options: readonly { readonly value: K; readonly label: string }[]
  value: K
  onChange: (value: K) => void
}): ReactNode {
  return (
    <div className={css.filterGroup} role="group" aria-label={label}>
      <span className={css.filterLabel}>{label}</span>
      {options.map(option => (
        <Pill
          key={option.value}
          active={value === option.value}
          aria-pressed={value === option.value}
          onClick={() => { onChange(option.value) }}
        >
          {option.label}
        </Pill>
      ))}
    </div>
  )
}

/** Render the plugin Marketplace tab. */
export function PluginMarketplaceSettingsTab({
  snapshot,
  refresh,
  operationSnapshot,
  plan,
  execute,
  activateTab,
  t,
}: PluginMarketplaceSettingsTabProps): ReactNode {
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [profile, setProfile] = useState<MarketplaceOperationSnapshot | null>(null)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<SortKey>('relevance')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const cardNodes = useRef(new Map<string, HTMLButtonElement>())

  // Paint the last-known-good snapshot before refreshing in the background.
  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => snapshot()).then((model) => {
      if (!current) return
      setState({ status: 'ready', model })
      void refresh().then((refreshed) => {
        if (!current) return
        setState({ status: 'ready', model: refreshed })
        return operationSnapshot().then((next) => {
          if (current) setProfile(next)
        })
      }).catch((cause: unknown) => {
        if (current) setRefreshError(cause instanceof Error ? cause.message : String(cause))
      })
    }).catch((cause: unknown) => {
      if (!current) return
      setState({
        status: 'ready',
        model: {
          status: 'unavailable', source: 'none', lastSuccessfulFetchAt: null, generatedAt: null,
          stale: false, plugins: [], error: { code: 'transport-error', message: String(cause) },
        },
      })
    })
    return () => { current = false }
  }, [snapshot, refresh, operationSnapshot])

  useEffect(() => {
    let current = true
    void operationSnapshot().then((next) => {
      if (current) setProfile(next)
    }).catch((cause: unknown) => {
      if (current) setRefreshError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => { current = false }
  }, [operationSnapshot])

  const model = state.status === 'ready' ? state.model : null
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visible = useMemo(
    () => model ? selectVisible(model.plugins, normalizedQuery, filters, sort) : [],
    [model, normalizedQuery, filters, sort],
  )

  useEffect(() => {
    if (selectedId !== null && model && !model.plugins.some(plugin => plugin.id === selectedId)) {
      setSelectedId(null)
    }
  }, [selectedId, model])

  const onRefresh = (): void => {
    setRefreshing(true)
    setRefreshError(null)
    void refresh().then((refreshed) => {
      setState({ status: 'ready', model: refreshed })
      return operationSnapshot()
    }).then((next) => {
      setProfile(next)
    }).catch((cause: unknown) => {
      setRefreshError(cause instanceof Error ? cause.message : String(cause))
    }).finally(() => { setRefreshing(false) })
  }

  const cardRef = (id: string, node: HTMLButtonElement | null): void => {
    if (node) cardNodes.current.set(id, node)
    else cardNodes.current.delete(id)
  }

  const backToList = (): void => {
    const id = selectedId
    setSelectedId(null)
    if (id === null) return
    requestAnimationFrame(() => {
      const node = cardNodes.current.get(id)
      if (!node) return
      node.focus()
      if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' })
    })
  }

  if (state.status === 'loading') {
    return (
      <div className={css.section} aria-busy="true">
        <p className={css.status}>{t('state.loading')}</p>
        <div className={css.skeletonGrid} aria-hidden="true">
          <div className={css.skeletonCard} />
          <div className={css.skeletonCard} />
        </div>
      </div>
    )
  }

  if (selectedId !== null && model) {
    const plugin = model.plugins.find(entry => entry.id === selectedId)
    if (plugin) {
      return (
        <div className={css.section}>
          <PluginDetail
            plugin={plugin}
            profile={profile}
            t={t}
            onBack={backToList}
            planOperation={plan}
            executeOperation={execute}
            onSnapshot={setProfile}
            activateTab={activateTab}
          />
        </div>
      )
    }
  }

  if (!model || (model.status === 'unavailable' && model.plugins.length === 0)) {
    return (
      <div className={css.section}>
        <div className={css.failure}>
          <p role="alert">
            {t('state.error.title')}
          </p>
          <p className={css.failureDetail}>{t('state.error.detail')}</p>
          {model ? (
            <button type="button" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? t('refreshing') : t('state.retry')}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  const offline = model.status === 'unavailable' && model.plugins.length > 0
  const freshnessAt = model.lastSuccessfulFetchAt ?? model.generatedAt

  return (
    <div className={css.section} aria-busy={refreshing}>
      <div className={css.statusBar}>
        <span className={css.resultCount} role="status" aria-live="polite">
          {t('results.count', { count: visible.length })}
        </span>
        <span className={css.freshness} role="status">
          {freshnessAt
            ? t(model.source === 'cache' ? 'status.cached' : 'status.updated', { time: formatTime(freshnessAt) })
            : null}
          {model.stale ? ` · ${t('status.stale')}` : ''}
          {offline ? ` · ${t('status.offline')}` : ''}
          {` · ${t('status.readonly')}`}
        </span>
        <button
          className={css.refreshButton}
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={t('refresh')}
        >
          <IconRefreshOutline16 size={14} aria-hidden="true" />
          {refreshing ? t('refreshing') : t('refresh')}
        </button>
      </div>
      {refreshError ? <p className={css.inlineError} role="alert">{t('status.refreshError')}</p> : null}
      <label className={css.search}>
        <IconSearchOutline16 aria-hidden="true" />
        <span className={css.visuallyHidden}>{t('search')}</span>
        <input
          type="search"
          value={query}
          placeholder={t('search')}
          aria-label={t('search')}
          onChange={(event) => { setQuery(event.currentTarget.value) }}
        />
        {query.length > 0 ? (
          <button
            className={css.clearSearch}
            type="button"
            aria-label={t('clearSearch')}
            onClick={() => { setQuery('') }}
          >
            <IconCloseOutline16 size={12} aria-hidden="true" />
          </button>
        ) : null}
      </label>
      <div className={css.controls}>
        <FilterGroup
          label={t('filter.compatibility')}
          value={filters.compatibility}
          onChange={(value) => { setFilters(current => ({ ...current, compatibility: value })) }}

          options={[
            { value: 'all', label: t('filter.all') },
            { value: 'compatible', label: t('compatibility.compatible') },
            { value: 'incompatible', label: t('compatibility.incompatible') },
            { value: 'unknown', label: t('compatibility.unknown') },
          ]}
        />
        <FilterGroup
          label={t('filter.installability')}
          value={filters.installability}
          onChange={(value) => { setFilters(current => ({ ...current, installability: value })) }}

          options={[
            { value: 'all', label: t('filter.all') },
            { value: 'one-click-eligible', label: t('installability.one-click-eligible') },
            { value: 'manual', label: t('installability.manual') },
            { value: 'browse-only', label: t('installability.browse-only') },
          ]}
        />
        <FilterGroup
          label={t('filter.maintenance')}
          value={filters.maintenance}
          onChange={(value) => { setFilters(current => ({ ...current, maintenance: value })) }}

          options={[
            { value: 'all', label: t('filter.all') },
            { value: 'active', label: t('maintenance.active') },
            { value: 'archived', label: t('maintenance.archived') },
          ]}
        />
        <label className={css.sortControl}>
          <span className={css.filterLabel}>{t('sort.label')}</span>
          <select
            value={sort}
            aria-label={t('sort.label')}
            onChange={(event) => { setSort(event.currentTarget.value as SortKey) }}
          >
            <option value="relevance">{t('sort.relevance')}</option>
            <option value="stars">{t('sort.stars')}</option>
            <option value="pushed">{t('sort.pushed')}</option>
            <option value="added">{t('sort.added')}</option>
          </select>
        </label>
      </div>
      {model.status === 'empty' || model.plugins.length === 0 ? (
        <p className={css.status}>{t('state.empty')}</p>
      ) : null}
      {model.plugins.length > 0 && visible.length === 0 ? (
        <p className={css.status}>{t('state.emptySearch')}</p>
      ) : null}
      {visible.length > 0 ? (
        <ul className={css.cards}>
          {visible.map(plugin => (
            <PluginCard key={plugin.id} plugin={plugin} t={t} onOpen={setSelectedId} cardRef={cardRef} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}
