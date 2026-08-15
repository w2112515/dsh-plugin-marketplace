import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IconChevronLeftOutline14, IconCloseOutline16, IconRefreshOutline16, IconRightUpOutline14, IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  MarketplaceCategory,
  MarketplaceInstalledListItem,
  MarketplaceListModel,
  MarketplaceListRequest,
  MarketplaceOperationPlan,
  MarketplaceOperationResult,
  MarketplaceOperationSnapshot,
  MarketplacePackItemView,
  MarketplacePackSummary,
  MarketplacePlanRequest,
  MarketplacePluginDetailModel,
  MarketplacePluginRowModel,
} from './marketplace-adapter.ts'
import type { MarketplaceExternalPlugin, MarketplaceInstalledResponse, MarketplacePackDetailResponse, MarketplacePackListResponse } from '../types.ts'
import { MARKETPLACE_CATEGORY_PRIORITY } from '../catalog-query.ts'
import type { PluginMarketplaceLocaleKey } from './locales.ts'
import css from './PluginMarketplaceSettingsTab.module.css'

export interface PluginMarketplaceSettingsTabInjected {
  bootstrap: (request: MarketplaceListRequest) => Promise<{ readonly list: MarketplaceListModel; readonly operations: MarketplaceOperationSnapshot }>
  list: (request: MarketplaceListRequest) => Promise<MarketplaceListModel>
  detail: (repositoryId: string) => Promise<MarketplacePluginDetailModel | null>
  refresh: (request: MarketplaceListRequest, currentDigest: string) => Promise<{ readonly changed: boolean; readonly list: MarketplaceListModel | null; readonly source: MarketplaceListModel['source']; readonly stale: MarketplaceListModel['stale']; readonly lastSuccessfulFetchAt: string | null; readonly error: MarketplaceListModel['error'] }>
  operationSnapshot: () => Promise<MarketplaceOperationSnapshot>
  installed: () => Promise<MarketplaceInstalledResponse>
  packs: () => Promise<MarketplacePackListResponse>
  packDetail: (repositoryId: string) => Promise<MarketplacePackDetailResponse>
  plan: (request: MarketplacePlanRequest) => Promise<MarketplaceOperationPlan>
  execute: (planId: NonNullable<MarketplaceOperationPlan['planId']>, allowScripts?: boolean) => Promise<MarketplaceOperationResult>
  activateTab: (id: string) => void
}

export type PluginMarketplaceSettingsTabProps = PropsRuntime<'settings.plugins.tab'> & PropsLocale<'settings.pluginMarketplace'> & InjectFace<PluginMarketplaceSettingsTabInjected>
type Translate = PluginMarketplaceSettingsTabProps['t']
type ViewKey = 'discover' | 'installed'
type CategoryFilter = MarketplaceCategory | 'uncategorized' | 'all' | 'packs'
type InstallFilter = 'all' | 'one-click' | 'manual'
type SortKey = 'recommended' | 'stars' | 'updated' | 'added'
type InstalledSort = 'updates' | 'name' | 'updated'
type DetailState = { readonly status: 'idle' | 'loading' } | { readonly status: 'ready'; readonly plugin: MarketplacePluginDetailModel } | { readonly status: 'missing' | 'error'; readonly message?: string }
type PackDetailState = { readonly status: 'idle' | 'loading' } | { readonly status: 'ready'; readonly detail: MarketplacePackDetailResponse } | { readonly status: 'missing' | 'error' }
type ProfilePluginState = MarketplaceOperationSnapshot['plugins'][number]

function formatTime(iso: string): string {
  const time = Date.parse(iso)
  return Number.isNaN(time) ? iso : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(time)
}

function requestFor(query: string, category: CategoryFilter, filter: InstallFilter, sort: SortKey, page: number): MarketplaceListRequest {
  return {
    query: query.trim(),
    // 'packs' is a client-local browse mode, never a host list category.
    category: category === 'packs' ? 'all' : category,
    installability: filter === 'one-click' ? 'one-click-eligible' : filter,
    sort: sort === 'updated' ? 'recently-updated' : sort === 'added' ? 'recently-added' : sort,
    page,
  }
}

const CATEGORY_KEYS = {
  theme: 'category.theme', ui: 'category.ui', tool: 'category.tool', memory: 'category.memory',
  provider: 'category.provider', usage: 'category.usage', skill: 'category.skill',
  security: 'category.security', channel: 'category.channel',
} satisfies Record<MarketplaceCategory, PluginMarketplaceLocaleKey>

const ACTION_KEYS = {
  install: 'operation.action.install', update: 'operation.action.update', remove: 'operation.action.remove',
} satisfies Record<NonNullable<MarketplaceOperationPlan['action']>, PluginMarketplaceLocaleKey>

const STATE_KEYS = {
  'not-installed': 'operation.state.not-installed', active: 'operation.state.active', 'pending-install': 'operation.state.pending-install',
  'pending-update': 'operation.state.pending-update', 'pending-removal': 'operation.state.pending-removal', 'installed-inactive': 'operation.state.installed-inactive',
} satisfies Record<ProfilePluginState['state'], PluginMarketplaceLocaleKey>

const WARNING_KEYS = {
  'compatibility-unknown': 'operation.warning.compatibility', 'git-source': 'operation.warning.git', 'code-executes-on-restart': 'operation.warning.code',
  'install-scripts-disabled': 'operation.warning.scripts', 'install-scripts-run': 'operation.warning.scriptsRun', 'restart-required': 'operation.warning.restart', 'origin-differs': 'operation.warning.origin',
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

function isRestartPending(state: ProfilePluginState['state'] | undefined): boolean {
  return state === 'pending-install' || state === 'pending-update' || state === 'pending-removal'
}

function CategoryChip({ category, t }: { category: MarketplaceCategory | null; t: Translate }): ReactNode {
  if (category === null) return null
  return <span className={css.categoryChip}>{t(CATEGORY_KEYS[category])}</span>
}

/** GitHub owner avatar with an honest letter-tile fallback when the image cannot load. */
function PluginAvatar({ publisher, name }: { publisher: string; name: string }): ReactNode {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <span className={css.avatarFallback} aria-hidden="true">{name.trim().charAt(0).toUpperCase() || '?'}</span>
  }
  return <img
    className={css.avatar}
    src={`https://github.com/${encodeURIComponent(publisher)}.png?size=64`}
    alt=""
    loading="lazy"
    onError={() => { setFailed(true) }}
  />
}

function CapabilityNotice({ profile, t }: { profile: MarketplaceOperationSnapshot | null; t: Translate }): ReactNode {
  if (profile === null) return <p className={css.capabilityNotice}>{t('operation.capability.checking')}</p>
  const { capabilities } = profile
  if (!capabilities.profileWritable) return <p className={css.capabilityNotice}>{capabilities.message ?? t('operation.capability.profileReadOnly')}</p>
  if (capabilities.packageManager === 'unavailable') return <p className={css.capabilityNotice}>{capabilities.message ?? t('operation.capability.pnpmMissing')}</p>
  return <p className={css.capabilityReady}>{t(capabilities.packageManager === 'corepack-pnpm' ? 'operation.capability.corepackReady' : 'operation.capability.ready')}</p>
}

function PluginRow({ plugin, state, t, onOpen, onInstall, rowRef, canInstall }: {
  plugin: MarketplacePluginRowModel
  state: ProfilePluginState | undefined
  t: Translate
  onOpen: (id: string) => void
  onInstall: (id: string) => void
  rowRef: (id: string, node: HTMLButtonElement | null) => void
  canInstall: boolean
}): ReactNode {
  const manual = plugin.installability === 'manual'
  return <li className={css.row}>
    <button ref={(node) => { rowRef(plugin.id, node) }} className={css.rowOpen} type="button" data-plugin-id={plugin.id} onClick={() => { onOpen(plugin.id) }}>
      <span className={css.rowMain}>
        <PluginAvatar publisher={plugin.publisher} name={plugin.name} />
        <span className={css.rowPrimary}>
          <span className={css.rowHeading}>
            <strong className={css.rowTitle} title={plugin.name}>{plugin.name}</strong>
            <CategoryChip category={plugin.category} t={t} />
          </span>
          <span className={css.rowPeople}>{t('row.publisher', { publisher: plugin.publisher })}{plugin.author && plugin.author !== plugin.publisher ? ` · ${t('row.author', { author: plugin.author })}` : ''} · {t('card.stars', { count: plugin.stars })}</span>
          {plugin.description ? <span className={css.rowDescription}>{plugin.description}</span> : null}
          <span className={css.rowMeta}><span>{t('card.pushed', { time: formatTime(plugin.lastCodePushAt) })}</span><span>{t('card.published', { time: formatTime(plugin.repositoryCreatedAt) })}</span><span>{plugin.license ?? t('detail.license.missing')}</span></span>
        </span>
      </span>
    </button>
    <div className={css.rowAction}>
      {state !== undefined
        ? <><span className={css.stateBadge}>{t(STATE_KEYS[state.state])}</span><button type="button" className={css.secondaryButton} onClick={() => { onOpen(plugin.id) }}>{t('row.manage')}</button></>
        : manual
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
  const [consent, setConsent] = useState(false)
  const restartPending = isRestartPending(pluginState?.state)
  const installed = pluginState?.installedSpec !== null && pluginState?.installedSpec !== undefined
  const canInstall = canChangeProfile(profile)
  const scriptGated = plugin.installability === 'manual' && plugin.installScripts !== null
  const requestPlan = (action: MarketplacePlanRequest['action']): void => {
    setWorking(true); setError(null); setResult(null); setConsent(false)
    void planOperation({ repositoryId: plugin.id, action }).then(setReview).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    }).finally(() => { setWorking(false) })
  }
  useEffect(() => {
    if (initialAction === null) return
    onInitialActionConsumed()
    if (initialAction === 'install' && canInstall && !installed && !restartPending) requestPlan('install')
    if (initialAction === 'remove' && canInstall && installed && !restartPending) requestPlan('remove')
  // Navigation intent triggers once; Host capability and profile state above remain the gate.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction])
  const confirm = (): void => {
    if (review?.planId === null || review?.planId === undefined) return
    if (review.requiresScripts && !consent) return
    setWorking(true); setError(null)
    void executeOperation(review.planId, review.requiresScripts).then((next) => {
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
    {review?.status === 'ready' ? <div className={css.reviewBox}><strong>{t('operation.reviewTitle')}</strong><dl className={css.reviewFacts}><div><dt>{t('operation.reviewAction')}</dt><dd>{t(ACTION_KEYS[review.action ?? 'install'])}</dd></div><div><dt>{t('operation.reviewProfile')}</dt><dd>{review.profileName}</dd></div><div><dt>{t('operation.reviewPackage')}</dt><dd>{review.packageName} · {review.packageVersion}</dd></div><div><dt>{t('operation.reviewCommit')}</dt><dd><code>{review.commitSha}</code></dd></div></dl>{review.requiresScripts && review.installScripts !== null ? <div className={css.scriptReview}><strong>{t('scripts.title')}</strong><ul className={css.scriptList}>{Object.entries(review.installScripts).map(([name, body]) => <li key={name}><code>{name}</code><pre>{body}</pre></li>)}</ul><label className={css.consentRow}><input type="checkbox" checked={consent} onChange={(event) => { setConsent(event.currentTarget.checked) }} /><span>{t('scripts.consent')}</span></label></div> : null}{review.warnings.length > 0 ? <ul className={css.warningList}>{review.warnings.map(warning => <li key={warning}>{t(WARNING_KEYS[warning])}</li>)}</ul> : null}<div className={css.actionRow}><button type="button" className={css.primaryButton} disabled={working || (review.requiresScripts && !consent)} onClick={confirm}>{working ? t('operation.working') : t('operation.confirm')}</button><button type="button" className={css.secondaryButton} disabled={working} onClick={() => { setReview(null) }}>{t('operation.cancel')}</button></div></div> : null}
    {review === null ? <div className={css.actionRow}>
      {!installed && plugin.installability === 'one-click-eligible' ? <button type="button" className={css.primaryButton} disabled={working || restartPending || !canInstall} onClick={() => { requestPlan('install') }}>{t('install.action')}</button> : null}
      {!installed && scriptGated ? <button type="button" className={css.primaryButton} disabled={working || restartPending || !canInstall} onClick={() => { requestPlan('install') }}>{t('install.actionScripted')}</button> : null}
      {!installed && plugin.installability !== 'one-click-eligible' && !scriptGated ? <a className={css.secondaryButton} href={plugin.repositoryUrl} target="_blank" rel="noreferrer noopener">{t('row.manualAction')}<IconRightUpOutline14 aria-hidden="true" /></a> : null}
      {installed && pluginState?.updateAvailable && !restartPending ? <button type="button" className={css.primaryButton} disabled={working || !canInstall} onClick={() => { requestPlan('install') }}>{t('operation.update')}</button> : null}
      {pluginState?.state === 'active' ? <button type="button" className={css.secondaryButton} onClick={() => { activateTab('configurable') }}>{t('operation.configure')}</button> : null}
      {installed && !restartPending ? <button type="button" className={css.dangerButton} disabled={working || !canInstall} onClick={() => { requestPlan('remove') }}>{t('operation.remove')}</button> : null}
    </div> : null}
    {pluginState?.state === 'active' ? <p className={css.installReason}>{t('operation.configureHint')}</p> : null}
    {!installed && scriptGated ? <p className={css.installReason}>{t('install.scriptedHint')}</p> : null}
    {!installed && plugin.installability !== 'one-click-eligible' && !scriptGated ? <p className={css.installReason}>{t('install.unavailable')}</p> : null}
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
      <header className={css.detailTitle}>
        <div className={css.detailHeading}>
          <PluginAvatar publisher={plugin.publisher} name={plugin.name} />
          <div className={css.detailHeadingText}>
            <h3 ref={headingRef} tabIndex={-1} className={css.detailName}>{plugin.name}</h3>
            <p className={css.detailByline}>{t('row.publisher', { publisher: plugin.publisher })}{plugin.author && plugin.author !== plugin.publisher ? ` · ${t('row.author', { author: plugin.author })}` : ''} · {t('card.stars', { count: plugin.stars })}</p>
          </div>
          <CategoryChip category={plugin.category} t={t} />
        </div>
        <p className={css.detailPackage}>{plugin.packageName ?? plugin.repositoryFullName}{plugin.packageVersion ? ` · ${plugin.packageVersion}` : ''}</p>
      </header>
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

function installedCategory(item: MarketplaceInstalledListItem): MarketplaceCategory | null {
  return item.plugin?.category ?? null
}

function sortInstalledItems(items: readonly MarketplaceInstalledListItem[], sort: InstalledSort): MarketplaceInstalledListItem[] {
  const copy = [...items]
  const byName = (left: MarketplaceInstalledListItem, right: MarketplaceInstalledListItem): number =>
    (left.plugin?.name ?? left.state.packageName ?? '').localeCompare(right.plugin?.name ?? right.state.packageName ?? '', 'en')
  if (sort === 'name') return copy.sort(byName)
  if (sort === 'updated') {
    return copy.sort((left, right) =>
      Date.parse(right.plugin?.lastCodePushAt ?? '') - Date.parse(left.plugin?.lastCodePushAt ?? '') || byName(left, right))
  }
  return copy.sort((left, right) => Number(right.state.updateAvailable) - Number(left.state.updateAvailable) || byName(left, right))
}

function RelationChip({ state, t }: { state: ProfilePluginState; t: Translate }): ReactNode {
  if (state.updateAvailable) return <span className={css.updateBadge}>{t('installed.updateAvailable')}</span>
  if (state.catalogRelation === 'diverged') {
    return <span className={css.relationChip} title={t('installed.divergedHint')}>{t('installed.diverged')}</span>
  }
  if (state.catalogRelation === 'not-in-catalog') {
    return <span className={css.relationChip} title={t('installed.notInCatalogHint')}>{t('installed.notInCatalog')}</span>
  }
  return null
}

function InstalledRow({ item, t, canInstall, onOpen, onUpdate, onRemove, onConfigure }: {
  item: MarketplaceInstalledListItem
  t: Translate
  canInstall: boolean
  onOpen: (id: string) => void
  onUpdate: (id: string) => void
  onRemove: (id: string) => void
  onConfigure: () => void
}): ReactNode {
  const { state, plugin } = item
  const name = plugin?.name ?? state.packageName ?? plugin?.repositoryFullName ?? state.installedRepository ?? ''
  const specOwner = state.installedRepository?.split('/')[0] ?? null
  const pending = isRestartPending(state.state)
  const manageable = plugin !== null && state.repositoryId !== null
  return <li className={css.row}>
    {plugin === null
      ? <div className={css.rowStatic}><span className={css.rowMain}>
        {specOwner === null
          ? <span className={css.avatarFallback} aria-hidden="true">{name.trim().charAt(0).toUpperCase() || '?'}</span>
          : <PluginAvatar publisher={specOwner} name={name} />}
        <span className={css.rowPrimary}>
          <span className={css.rowHeading}><strong className={css.rowTitle}>{name}</strong><RelationChip state={state} t={t} /></span>
          {state.installedRepository !== null ? <span className={css.rowPeople}>{t('row.publisher', { publisher: specOwner ?? '' })}</span> : null}
          <span className={css.rowMeta}>
            {state.installedVersion !== null ? <span>{t('installed.version', { version: state.installedVersion })}</span> : null}
            {state.installedRepository !== null ? <code className={css.rowPackage}>{state.installedRepository}</code> : null}
          </span>
        </span>
      </span></div>
      : <button className={css.rowOpen} type="button" onClick={() => { onOpen(state.repositoryId as string) }}><span className={css.rowMain}>
        <PluginAvatar publisher={plugin.publisher} name={name} />
        <span className={css.rowPrimary}>
          <span className={css.rowHeading}>
            <strong className={css.rowTitle} title={name}>{name}</strong>
            <CategoryChip category={plugin.category} t={t} />
            <RelationChip state={state} t={t} />
          </span>
          <span className={css.rowPeople}>{t('row.publisher', { publisher: plugin.publisher })} · {t('card.stars', { count: plugin.stars })}</span>
          <span className={css.rowMeta}>
            {state.installedVersion !== null ? <span>{t('installed.version', { version: state.installedVersion })}</span> : null}
            <span>{t('card.pushed', { time: formatTime(plugin.lastCodePushAt) })}</span>
          </span>
        </span>
      </span></button>}
    <div className={css.rowAction}>
      <span className={css.stateBadge}>{t(STATE_KEYS[state.state])}</span>
      {manageable && state.updateAvailable && !pending ? <button type="button" className={css.primaryButton} disabled={!canInstall} title={canInstall ? undefined : t('operation.capability.unavailableTitle')} onClick={() => { onUpdate(state.repositoryId as string) }}>{t('operation.update')}</button> : null}
      {state.state === 'active' ? <button type="button" className={css.secondaryButton} onClick={onConfigure}>{t('operation.configure')}</button> : null}
      {manageable && !pending ? <button type="button" className={css.dangerButton} disabled={!canInstall} title={canInstall ? undefined : t('operation.capability.unavailableTitle')} onClick={() => { onRemove(state.repositoryId as string) }}>{t('operation.remove')}</button> : null}
    </div>
  </li>
}

function ExternalRow({ item, t }: { item: MarketplaceExternalPlugin; t: Translate }): ReactNode {
  return <li className={css.row}>
    <div className={css.rowStatic}><span className={css.rowMain}>
      <span className={css.avatarFallback} aria-hidden="true">{item.packageName.trim().charAt(0).toUpperCase() || '?'}</span>
      <span className={css.rowPrimary}>
        <span className={css.rowHeading}><strong className={css.rowTitle} title={item.packageName}>{item.packageName}</strong></span>
        <span className={css.rowMeta}><code className={css.rowPackage}>{item.installedSpec ?? ''}</code></span>
      </span>
    </span></div>
    <div className={css.rowAction}>
      <span className={css.stateBadge}>{t(item.activeAfterRestart ? 'operation.state.active' : 'operation.state.installed-inactive')}</span>
    </div>
  </li>
}

const PACK_STATUS_KEYS = {
  installable: 'pack.item.installable', 'script-gated': 'pack.item.scriptGated', manual: 'pack.item.manual',
  unavailable: 'pack.item.unavailable', installed: 'pack.item.installed',
} satisfies Record<MarketplacePackItemView['status'], PluginMarketplaceLocaleKey>

/** One-line install composition for a pack card: "7 一键 · 2 需审脚本 · 1 手动". */
function packCompositionLine(pack: MarketplacePackSummary, t: Translate): string {
  const segments: string[] = []
  if (pack.composition.oneClick > 0) segments.push(t('pack.composition.oneClick', { count: pack.composition.oneClick }))
  if (pack.composition.scriptGated > 0) segments.push(t('pack.composition.scriptGated', { count: pack.composition.scriptGated }))
  if (pack.composition.manual > 0) segments.push(t('pack.composition.manual', { count: pack.composition.manual }))
  if (pack.composition.unavailable > 0) segments.push(t('pack.composition.unavailable', { count: pack.composition.unavailable }))
  return segments.join(' · ')
}

function PackListView({ packs, query, t, onOpen }: { packs: readonly MarketplacePackSummary[]; query: string; t: Translate; onOpen: (id: string) => void }): ReactNode {
  const words = query.trim().toLowerCase()
  const visible = words.length === 0 ? packs : packs.filter(pack => [pack.name, pack.publisher, pack.repositoryFullName, pack.description ?? '']
    .some(text => text.toLowerCase().includes(words)))
  if (visible.length === 0) return <p className={css.status}>{t('state.emptySearch')}</p>
  return <div className={css.packGrid}>{visible.map(pack => <button key={pack.repositoryId} type="button" className={css.packCard} onClick={() => { onOpen(pack.repositoryId) }}>
    <span className={css.rowHeading}>
      <strong className={css.rowTitle} title={pack.name}>{pack.name}</strong>
      {pack.featured ? <span className={css.updateBadge}>{t('pack.featured')}</span> : null}
      <span className={css.relationChip}>{t('pack.itemCount', { count: pack.itemCount })}</span>
    </span>
    <span className={css.rowPeople}>{t('row.publisher', { publisher: pack.publisher })} · {t('card.stars', { count: pack.stars })}</span>
    <span className={css.rowMeta}>{packCompositionLine(pack, t)}</span>
    {pack.description ? <span className={css.rowDescription}>{pack.description}</span> : null}
  </button>)}</div>
}

function PackItemRow({ item, t, onOpenPlugin }: { item: MarketplacePackItemView; t: Translate; onOpenPlugin: (id: string) => void }): ReactNode {
  const owner = item.fullName.split('/')[0] ?? item.fullName
  const name = item.name ?? item.fullName
  return <li className={css.row}>
    <div className={css.rowStatic}><span className={css.rowMain}>
      <PluginAvatar publisher={owner} name={name} />
      <span className={css.rowPrimary}>
        <span className={css.rowHeading}>
          <strong className={css.rowTitle} title={name}>{name}</strong>
          <span className={item.status === 'installable' ? css.updateBadge : css.relationChip}>{t(PACK_STATUS_KEYS[item.status])}</span>
          {item.status === 'installed' && item.state !== null ? <span className={css.stateBadge}>{t(STATE_KEYS[item.state])}</span> : null}
        </span>
        <span className={css.rowMeta}><code className={css.rowPackage}>{item.fullName}</code></span>
      </span>
    </span></div>
    <div className={css.rowAction}>
      {item.status === 'script-gated' && item.repositoryId !== null
        ? <button type="button" className={css.secondaryButton} onClick={() => { onOpenPlugin(item.repositoryId as string) }}>{t('pack.reviewScripts')}</button>
        : null}
      {item.repositoryUrl !== null && (item.status === 'manual' || item.status === 'unavailable')
        ? <a className={css.secondaryButton} href={item.repositoryUrl} target="_blank" rel="noreferrer noopener">{t('row.manualAction')}<IconRightUpOutline14 aria-hidden="true" /></a>
        : null}
    </div>
  </li>
}

interface PackInstallOutcome {
  readonly name: string
  readonly ok: boolean
  readonly code: string
}

function PackDetailView({ detail, profile, t, onBack, planOperation, executeOperation, onSnapshot, onOpenPlugin, onChanged }: {
  detail: MarketplacePackDetailResponse
  profile: MarketplaceOperationSnapshot | null
  t: Translate
  onBack: () => void
  planOperation: PluginMarketplaceSettingsTabInjected['plan']
  executeOperation: PluginMarketplaceSettingsTabInjected['execute']
  onSnapshot: (snapshot: MarketplaceOperationSnapshot) => void
  onOpenPlugin: (id: string) => void
  onChanged: () => void
}): ReactNode {
  const [working, setWorking] = useState(false)
  const [progress, setProgress] = useState<{ readonly index: number; readonly total: number; readonly name: string } | null>(null)
  const [outcomes, setOutcomes] = useState<readonly PackInstallOutcome[] | null>(null)
  const pack = detail.pack
  const items = detail.items
  const installable = items.filter(item => item.status === 'installable' && item.repositoryId !== null)
  const canInstall = canChangeProfile(profile) && !profile?.busy
  const anyRestartPending = (profile?.plugins ?? []).some(state => isRestartPending(state.state))
  if (pack === null) return null
  // Serial reuse of the reviewed single-plugin path: each item gets its own
  // plan + execute, the first failure stops the run, and nothing is rolled
  // back — every outcome is reported per item, never summarized away.
  const runInstall = (): void => {
    setWorking(true); setOutcomes(null)
    void (async () => {
      const collected: PackInstallOutcome[] = []
      for (const [index, item] of installable.entries()) {
        const name = item.name ?? item.fullName
        setProgress({ index: index + 1, total: installable.length, name })
        try {
          const plan = await planOperation({ repositoryId: item.repositoryId as string, action: 'install' })
          if (plan.status !== 'ready' || plan.planId === null) {
            collected.push({ name, ok: false, code: plan.blockCode ?? 'blocked' })
            break
          }
          const result = await executeOperation(plan.planId)
          onSnapshot(result.snapshot)
          collected.push({ name, ok: result.status === 'succeeded', code: result.code })
          if (result.status !== 'succeeded') break
        } catch (cause) {
          collected.push({ name, ok: false, code: cause instanceof Error ? cause.message : String(cause) })
          break
        }
      }
      return collected
    })().then((collected) => {
      setOutcomes(collected)
      if (collected.length > 0) onChanged()
    }).finally(() => { setProgress(null); setWorking(false) })
  }
  const skipped = outcomes === null ? 0 : installable.length - outcomes.length
  return <div className={css.detail}>
    <button className={css.backButton} type="button" onClick={onBack}><IconChevronLeftOutline14 aria-hidden="true" />{t('detail.back')}</button>
    <div className={css.detailContent}>
      <header className={css.detailTitle}>
        <div className={css.detailHeading}>
          <PluginAvatar publisher={pack.publisher} name={pack.name} />
          <div className={css.detailHeadingText}>
            <h3 className={css.detailName}>{pack.name}</h3>
            <p className={css.detailByline}>{t('row.publisher', { publisher: pack.publisher })} · {t('card.stars', { count: pack.stars })} · {t('pack.itemCount', { count: items.length })}</p>
          </div>
        </div>
      </header>
      {pack.description ? <section className={css.detailSection}><h4>{t('detail.about')}</h4><p>{pack.description}</p></section> : null}
      <a className={css.githubLink} href={pack.repositoryUrl} target="_blank" rel="noreferrer noopener">{t('detail.viewOnGithub')}<IconRightUpOutline14 aria-hidden="true" /></a>
    </div>
    <aside className={css.operationPanel} aria-label={t('pack.installTitle')} aria-busy={working}>
      <div className={css.operationHeading}><div><h4>{t('pack.installTitle')}</h4><p>{t('pack.installSummary', { installable: installable.length, total: items.length })}</p></div></div>
      <CapabilityNotice profile={profile} t={t} />
      {anyRestartPending ? <p className={css.restartNotice} role="status">{t('operation.restartPending')}</p> : null}
      {progress !== null ? <p className={css.restartNotice} role="status">{t('pack.installing', { index: progress.index, total: progress.total, name: progress.name })}</p> : null}
      {outcomes !== null ? <div className={css.reviewBox} role="status">
        <strong>{t('pack.resultTitle')}</strong>
        <ul className={css.warningList}>{outcomes.map(outcome => <li key={outcome.name}>{outcome.ok ? t('pack.resultOk', { name: outcome.name }) : t('pack.resultFailed', { name: outcome.name, code: outcome.code })}</li>)}{skipped > 0 ? <li>{t('pack.resultSkipped', { count: skipped })}</li> : null}</ul>
      </div> : null}
      {items.some(item => item.status === 'script-gated') ? <p className={css.installReason}>{t('pack.scriptGatedHint')}</p> : null}
      {items.some(item => item.status === 'unavailable') ? <p className={css.installReason}>{t('pack.unavailableHint')}</p> : null}
      <div className={css.actionRow}>
        <button type="button" className={css.primaryButton} disabled={working || !canInstall || anyRestartPending || installable.length === 0} onClick={runInstall}>
          {working ? t('operation.working') : t('pack.install', { count: installable.length })}
        </button>
      </div>
    </aside>
    <ul className={css.rows}>{items.map(item => <PackItemRow key={item.fullName} item={item} t={t} onOpenPlugin={onOpenPlugin} />)}</ul>
  </div>
}

export function PluginMarketplaceSettingsTab({ bootstrap, list, detail, refresh, operationSnapshot, installed, packs, packDetail, plan, execute, activateTab, t }: PluginMarketplaceSettingsTabProps): ReactNode {
  const [model, setModel] = useState<MarketplaceListModel | null>(null)
  const [profile, setProfile] = useState<MarketplaceOperationSnapshot | null>(null)
  const [view, setView] = useState<ViewKey>('discover')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [filter, setFilter] = useState<InstallFilter>('all')
  const [sort, setSort] = useState<SortKey>('recommended')
  const [page, setPage] = useState(1)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle' })
  const [initialAction, setInitialAction] = useState<MarketplacePlanRequest['action'] | null>(null)
  const [installedModel, setInstalledModel] = useState<MarketplaceInstalledResponse | null>(null)
  const [installedError, setInstalledError] = useState(false)
  const [installedDirty, setInstalledDirty] = useState(true)
  const [installedCategoryFilter, setInstalledCategoryFilter] = useState<CategoryFilter>('all')
  const [installedSort, setInstalledSort] = useState<InstalledSort>('updates')
  const [packsModel, setPacksModel] = useState<readonly MarketplacePackSummary[] | null>(null)
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null)
  const [packDetailState, setPackDetailState] = useState<PackDetailState>({ status: 'idle' })
  const [packReload, setPackReload] = useState(0)
  const bootstrapped = useRef(false)
  const rowNodes = useRef(new Map<string, HTMLButtonElement>())
  const request = useMemo(() => requestFor(query, category, filter, sort, page), [query, category, filter, sort, page])

  useEffect(() => {
    let current = true
    if (category === 'packs') {
      // Pack browsing needs no plugin page; the packs effect owns that data.
      return () => { current = false }
    }
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
    if (view !== 'installed' || !installedDirty) return
    let current = true
    setInstalledError(false)
    void installed().then((next) => { if (current) { setInstalledModel(next); setInstalledDirty(false) } })
      .catch(() => { if (current) { setInstalledError(true); setInstalledDirty(false) } })
    return () => { current = false }
  }, [view, installed, installedDirty])

  useEffect(() => {
    let current = true
    void packs().then((next) => { if (current) setPacksModel(next.packs) }).catch(() => { if (current) setPacksModel(previous => previous ?? []) })
    return () => { current = false }
  }, [packs, packReload])

  useEffect(() => {
    if (selectedPackId === null) { setPackDetailState({ status: 'idle' }); return }
    let current = true
    setPackDetailState({ status: 'loading' })
    void packDetail(selectedPackId).then((next) => {
      if (!current) return
      setPackDetailState(next.pack === null ? { status: 'missing' } : { status: 'ready', detail: next })
    }).catch(() => { if (current) setPackDetailState({ status: 'error' }) })
    return () => { current = false }
  }, [packDetail, selectedPackId, packReload])

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

  const onSnapshot = (snapshot: MarketplaceOperationSnapshot): void => { setProfile(snapshot); setInstalledDirty(true) }
  const onPackChanged = (): void => { setPackReload(count => count + 1); setInstalledDirty(true) }
  const onRefresh = (): void => {
    if (model === null) return
    setRefreshing(true); setError(null)
    void refresh(request, model.digest).then((update) => {
      if (update.list !== null) setModel(update.list)
      else setModel(previous => previous === null ? previous : { ...previous, source: update.source, stale: update.stale, lastSuccessfulFetchAt: update.lastSuccessfulFetchAt, error: update.error })
      setError(update.error?.message ?? null)
      return operationSnapshot()
    }).then((snapshot) => { onSnapshot(snapshot); setPackReload(count => count + 1) }).catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)) }).finally(() => { setRefreshing(false) })
  }
  const rowRef = (id: string, node: HTMLButtonElement | null): void => { if (node) rowNodes.current.set(id, node); else rowNodes.current.delete(id) }
  const openPlugin = (id: string): void => { setInitialAction(null); setSelectedPackId(null); setSelectedId(id) }
  const installPlugin = (id: string): void => { setInitialAction('install'); setSelectedPackId(null); setSelectedId(id) }
  const removePlugin = (id: string): void => { setInitialAction('remove'); setSelectedPackId(null); setSelectedId(id) }
  const openPack = (id: string): void => { setSelectedId(null); setInitialAction(null); setSelectedPackId(id) }
  const backToList = (): void => {
    const id = selectedId; setSelectedId(null); setSelectedPackId(null); setInitialAction(null)
    if (id !== null) requestAnimationFrame(() => { const node = rowNodes.current.get(id); node?.focus(); node?.scrollIntoView?.({ block: 'nearest' }) })
  }
  const retryBootstrap = (): void => {
    bootstrapped.current = false
    setModel(null)
    setError(null)
    setLoadAttempt(attempt => attempt + 1)
  }

  if (selectedPackId !== null) {
    if (packDetailState.status === 'ready' && packDetailState.detail.pack !== null) {
      return <div className={css.section}><PackDetailView detail={packDetailState.detail} profile={profile} t={t} onBack={backToList} planOperation={plan} executeOperation={execute} onSnapshot={onSnapshot} onOpenPlugin={openPlugin} onChanged={onPackChanged} /></div>
    }
    return <div className={css.section}><button className={css.backButton} type="button" onClick={backToList}><IconChevronLeftOutline14 aria-hidden="true" />{t('detail.back')}</button><p className={css.status} aria-live="polite">{packDetailState.status === 'loading' ? t('detail.loading') : t('detail.error')}</p></div>
  }
  if (selectedId !== null) {
    if (detailState.status === 'ready') return <div className={css.section}><PluginDetail plugin={detailState.plugin} profile={profile} t={t} onBack={backToList} planOperation={plan} executeOperation={execute} onSnapshot={onSnapshot} activateTab={activateTab} initialAction={initialAction} onInitialActionConsumed={() => { setInitialAction(null) }} /></div>
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
  const profileStates = new Map((profile?.plugins ?? []).map(state => [state.repositoryId, state]))
  const installedCount = (profile?.plugins.length ?? 0) + (profile?.external.length ?? 0)
  const categoryChips: readonly { value: CategoryFilter; label: string; count: number }[] = [
    { value: 'all', label: t('filter.all'), count: model.counts.all },
    // Packs sit with the filters but switch the entity being browsed; they are
    // collections, not a plugin category, and never occupy permanent space.
    ...(model.counts.packs > 0 ? [{ value: 'packs' as CategoryFilter, label: t('filter.packs'), count: model.counts.packs }] : []),
    ...(MARKETPLACE_CATEGORY_PRIORITY
      .map(value => ({ value: value as CategoryFilter, label: t(CATEGORY_KEYS[value]), count: model.counts.categories[value] }))
      .filter(chip => chip.count > 0)),
    ...(model.counts.uncategorized > 0 ? [{ value: 'uncategorized' as CategoryFilter, label: t('category.uncategorized'), count: model.counts.uncategorized }] : []),
  ]

  const installedItems = installedModel?.items ?? []
  const installedChips: readonly { value: CategoryFilter; label: string; count: number }[] = [
    { value: 'all', label: t('filter.all'), count: installedItems.length + (installedModel?.external.length ?? 0) },
    ...(MARKETPLACE_CATEGORY_PRIORITY
      .map(value => ({ value: value as CategoryFilter, label: t(CATEGORY_KEYS[value]), count: installedItems.filter(item => installedCategory(item) === value).length }))
      .filter(chip => chip.count > 0)),
  ]
  const visibleInstalled = sortInstalledItems(
    installedCategoryFilter === 'all' ? installedItems : installedItems.filter(item => installedCategory(item) === installedCategoryFilter),
    installedSort,
  )
  const visibleExternal = installedModel !== null && (installedCategoryFilter === 'all' || installedCategoryFilter === 'uncategorized')
    ? installedModel.external
    : []
  const anyRestartPending = (profile?.plugins ?? []).some(state => isRestartPending(state.state))

  return <div className={css.section} aria-busy={refreshing}>
    <div className={css.viewTabs} role="group" aria-label={t('tab')}>
      <button type="button" className={css.viewTab} aria-pressed={view === 'discover'} data-active={view === 'discover'} onClick={() => { setView('discover') }}>{t('view.discover')}</button>
      <button type="button" className={css.viewTab} aria-pressed={view === 'installed'} data-active={view === 'installed'} onClick={() => { setView('installed') }}>{t('view.installed')} <span className={css.filterCount}>{installedCount}</span></button>
    </div>
    {view === 'discover' ? <>
      {category !== 'packs' ? <div className={css.statusBar}><span className={css.resultCount} role="status" aria-live="polite">{t('results.count', { count: model.total })}</span><span className={css.freshness}>{freshnessAt ? t(model.source === 'cache' ? 'status.cached' : 'status.updated', { time: formatTime(freshnessAt) }) : null}{model.stale ? ` · ${t('status.stale')}` : ''}{model.catalogStatus === 'unavailable' ? ` · ${t('status.offline')}` : ''}</span><button className={css.refreshButton} type="button" onClick={onRefresh} disabled={refreshing} aria-label={t('refresh')}><IconRefreshOutline16 size={14} aria-hidden="true" />{refreshing ? t('refreshing') : t('refresh')}</button></div> : null}
      {error ? <p className={css.inlineError} role="alert">{t('status.refreshError')}</p> : null}
      {!canInstall ? <CapabilityNotice profile={profile} t={t} /> : null}
      <label className={css.search}><IconSearchOutline16 aria-hidden="true" /><span className={css.visuallyHidden}>{t('search')}</span><input type="search" value={query} placeholder={t('search')} onChange={(event) => { setQuery(event.currentTarget.value); setPage(1) }} />{query.length > 0 ? <button className={css.clearSearch} type="button" aria-label={t('clearSearch')} onClick={() => { setQuery(''); setPage(1) }}><IconCloseOutline16 size={12} aria-hidden="true" /></button> : null}</label>
      <div className={css.controls}>
        <div className={css.filterGroup} role="group" aria-label={t('category.label')}>{categoryChips.map(chip => <button key={chip.value} type="button" className={css.filterButton} aria-pressed={category === chip.value} data-active={category === chip.value} onClick={() => { setCategory(chip.value); setPage(1) }}>{chip.label} <span className={css.filterCount}>{chip.count}</span></button>)}</div>
        {category !== 'packs' ? <>
          <label className={css.sortControl}><span className={css.filterLabel}>{t('filter.installability')}</span><select value={filter} onChange={(event) => { setFilter(event.currentTarget.value as InstallFilter); setPage(1) }}><option value="all">{t('filter.all')} ({model.counts.all})</option><option value="one-click">{t('filter.one-click')} ({model.counts.oneClick})</option><option value="manual">{t('filter.manual')} ({model.counts.manual})</option></select></label>
          <label className={css.sortControl}><span className={css.filterLabel}>{t('sort.label')}</span><select value={sort} onChange={(event) => { setSort(event.currentTarget.value as SortKey); setPage(1) }}><option value="recommended">{t('sort.recommended')}</option><option value="stars">{t('sort.stars')}</option><option value="updated">{t('sort.updated')}</option><option value="added">{t('sort.added')}</option></select></label>
        </> : null}
      </div>
      {category === 'packs'
        ? (packsModel === null ? <p className={css.status}>{t('installed.loading')}</p> : <PackListView packs={packsModel} query={query} t={t} onOpen={openPack} />)
        : <>
          {model.total === 0 ? <p className={css.status}>{query ? t('state.emptySearch') : t('state.empty')}</p> : <ul className={css.rows}>{model.items.map(plugin => <PluginRow key={plugin.id} plugin={plugin} state={profileStates.get(plugin.id)} t={t} onOpen={openPlugin} onInstall={installPlugin} rowRef={rowRef} canInstall={canInstall} />)}</ul>}
          {model.pageCount > 1 ? <nav className={css.pagination} aria-label={t('pagination.label')}><button type="button" className={css.secondaryButton} disabled={model.page === 1} onClick={() => { setPage(model.page - 1) }}>{t('pagination.previous')}</button><span aria-live="polite">{t('pagination.page', { page: model.page, total: model.pageCount })}</span><button type="button" className={css.secondaryButton} disabled={model.page === model.pageCount} onClick={() => { setPage(model.page + 1) }}>{t('pagination.next')}</button></nav> : null}
        </>}
    </> : <>
      {anyRestartPending ? <p className={css.restartNotice} role="status">{t('operation.restartPending')}</p> : null}
      {!canInstall ? <CapabilityNotice profile={profile} t={t} /> : null}
      {installedError ? <p className={css.inlineError} role="alert">{t('installed.error')}</p> : null}
      {installedModel === null && !installedError ? <p className={css.status}>{t('installed.loading')}</p> : null}
      {installedModel !== null ? <>
        <div className={css.controls}>
          <div className={css.filterGroup} role="group" aria-label={t('category.label')}>{installedChips.map(chip => <button key={chip.value} type="button" className={css.filterButton} aria-pressed={installedCategoryFilter === chip.value} data-active={installedCategoryFilter === chip.value} onClick={() => { setInstalledCategoryFilter(chip.value) }}>{chip.label} <span className={css.filterCount}>{chip.count}</span></button>)}</div>
          <label className={css.sortControl}><span className={css.filterLabel}>{t('sort.label')}</span><select value={installedSort} onChange={(event) => { setInstalledSort(event.currentTarget.value as InstalledSort) }}><option value="updates">{t('installed.sort.updates')}</option><option value="name">{t('installed.sort.name')}</option><option value="updated">{t('installed.sort.updated')}</option></select></label>
        </div>
        {visibleInstalled.length === 0 && visibleExternal.length === 0 ? <p className={css.status}>{t('installed.empty')}</p> : null}
        {visibleInstalled.length > 0 ? <ul className={css.rows}>{visibleInstalled.map(item => <InstalledRow key={item.state.repositoryId ?? item.state.packageName} item={item} t={t} canInstall={canInstall} onOpen={openPlugin} onUpdate={installPlugin} onRemove={removePlugin} onConfigure={() => { activateTab('configurable') }} />)}</ul> : null}
        {visibleExternal.length > 0 ? <>
          <h4 className={css.externalHeading}>{t('installed.external')}</h4>
          <p className={css.status}>{t('installed.externalHint')}</p>
          <ul className={css.rows}>{visibleExternal.map(item => <ExternalRow key={item.packageName} item={item} t={t} />)}</ul>
        </> : null}
      </> : null}
    </>}
  </div>
}
