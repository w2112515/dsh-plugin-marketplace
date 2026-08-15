/** Transactional current-profile operations for reviewed marketplace entries. */

import { randomUUID } from 'node:crypto'
import { constants, readFileSync } from 'node:fs'
import { access, readFile, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import {
  loadOverlayPatches,
  loadProfile,
  readProfileManifest,
  type ProfileManifest,
} from '@deepseek-ai/dsh-app-boot'
import { writeFileAtomic } from './atomic-write.ts'
import { isPublicMarketplaceEntry } from './catalog-query.ts'
import { execa } from 'execa'
import type {
  MarketplaceCatalogEntry,
  MarketplaceCatalogRelation,
  MarketplaceCatalogSnapshot,
  MarketplaceExecuteRequest,
  MarketplaceOperationPlan,
  MarketplaceOperationCapabilities,
  MarketplaceOperationResult,
  MarketplaceOperationSnapshot,
  MarketplacePlanId,
  MarketplacePlanRequest,
  MarketplacePlanWarning,
  MarketplaceProfilePluginState,
} from './types.ts'

const PLAN_TTL_MS = 5 * 60 * 1000
const MAX_PROCESS_OUTPUT_BYTES = 1_000_000

/** Immutable launch snapshot derived from the Loader profile directory. */
export interface MarketplaceProfileRuntime {
  readonly profileName: string
  readonly dir: string
  readonly dependenciesAtLaunch: Readonly<Record<string, string>>
  readonly bundlesAtLaunch: readonly string[]
}

interface CommandResult {
  readonly exitCode: number
  readonly unavailable: boolean
}

type RunPnpm = (
  args: readonly string[],
  cwd: string,
  signal: AbortSignal,
) => Promise<CommandResult>

interface OperationManagerOptions {
  readonly runtime: MarketplaceProfileRuntime
  readonly catalog: () => MarketplaceCatalogSnapshot | null
  readonly capabilities: MarketplaceOperationCapabilities
  readonly runPnpm?: RunPnpm
  readonly now?: () => number
}

interface StoredPlan {
  readonly plan: MarketplaceOperationPlan & { readonly status: 'ready'; readonly planId: MarketplacePlanId }
  readonly catalogDigest: string
  readonly installedSpec: string | null
}

interface FileBackup {
  readonly path: string
  readonly content: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizedEnvironment(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).flatMap(([name, value]) => {
    if (value === undefined || /KEY|SECRET|TOKEN|PASSWORD/i.test(name)) return []
    return [[name, value]]
  }))
}

async function runPnpm(args: readonly string[], cwd: string, signal: AbortSignal): Promise<CommandResult> {
  return runPackageManager('pnpm', args, cwd, signal)
}

async function runPackageManager(
  manager: MarketplaceOperationCapabilities['packageManager'],
  args: readonly string[],
  cwd: string,
  signal: AbortSignal,
): Promise<CommandResult> {
  if (manager === 'unavailable') return { exitCode: 1, unavailable: true }
  const command = manager === 'pnpm' ? 'pnpm' : 'corepack'
  const commandArgs = manager === 'pnpm' ? args : ['pnpm', ...args]
  try {
    const result = await execa(command, commandArgs, {
      cwd,
      env: sanitizedEnvironment(),
      reject: false,
      cancelSignal: signal,
      forceKillAfterDelay: 5_000,
      maxBuffer: MAX_PROCESS_OUTPUT_BYTES,
    })
    return { exitCode: result.exitCode ?? 1, unavailable: false }
  } catch (error) {
    return {
      exitCode: 1,
      unavailable: (error as NodeJS.ErrnoException | null)?.code === 'ENOENT',
    }
  }
}

type ProbePackageManager = (
  command: 'pnpm' | 'corepack',
  args: readonly string[],
  cwd: string,
) => Promise<boolean>

async function probePackageManager(command: 'pnpm' | 'corepack', args: readonly string[], cwd: string): Promise<boolean> {
  try {
    const result = await execa(command, args, {
      cwd,
      env: sanitizedEnvironment(),
      reject: false,
      timeout: 10_000,
      maxBuffer: MAX_PROCESS_OUTPUT_BYTES,
    })
    return result.exitCode === 0
  } catch {
    return false
  }
}

/** Preflight the exact current-profile authority before exposing an install action. */
export async function detectMarketplaceOperationCapabilities(
  runtime: MarketplaceProfileRuntime,
  probe: ProbePackageManager = probePackageManager,
  checkWritable: (path: string, mode: number) => Promise<void> = access,
): Promise<MarketplaceOperationCapabilities> {
  let profileWritable = true
  try {
    await Promise.all([
      checkWritable(runtime.dir, constants.W_OK),
      checkWritable(join(runtime.dir, 'package.json'), constants.W_OK),
      checkWritable(join(runtime.dir, 'pnpm-workspace.yaml'), constants.W_OK),
    ])
  } catch {
    profileWritable = false
  }
  const packageManager = await probe('pnpm', ['--version'], runtime.dir)
    ? 'pnpm'
    : await probe('corepack', ['pnpm', '--version'], runtime.dir)
      ? 'corepack-pnpm'
      : 'unavailable'
  const message = !profileWritable
    ? 'The current DSH profile is not writable.'
    : packageManager === 'unavailable'
      ? 'Neither pnpm nor Corepack pnpm is available. Install pnpm 11 or enable Corepack, then restart DSH.'
      : null
  return { packageManager, profileWritable, profileName: runtime.profileName, message }
}

async function backup(path: string): Promise<FileBackup> {
  try {
    return { path, content: await readFile(path, 'utf8') }
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return { path, content: null }
    throw error
  }
}

async function restore(backups: readonly FileBackup[]): Promise<void> {
  for (const file of backups) {
    if (file.content === null) await rm(file.path, { force: true })
    else await writeFileAtomic(file.path, file.content, { mode: 0o600, dirMode: 0o700 })
  }
}

function packageDir(profileDir: string, packageName: string): string {
  return join(profileDir, 'node_modules', ...packageName.split('/'))
}

function installedVersion(profileDir: string, packageName: string): string | null {
  try {
    const value: unknown = JSON.parse(requireText(join(packageDir(profileDir, packageName), 'package.json')))
    return isRecord(value) && typeof value.version === 'string' ? value.version : null
  } catch {
    return null
  }
}

function requireText(path: string): string {
  return readFileSync(path, 'utf8')
}

function profileHome(profileDir: string): string {
  return dirname(dirname(profileDir))
}

function manifestBundles(manifest: ProfileManifest): readonly string[] {
  return manifest.dsh?.profile?.bundles ?? []
}

interface CoreProfileState {
  readonly state: MarketplaceProfilePluginState['state']
  readonly installedSpec: string | null
}

/** Entry-independent lifecycle: what the profile manifest and launch snapshot prove. */
function coreProfileState(
  runtime: MarketplaceProfileRuntime,
  manifest: ProfileManifest,
  packageName: string,
): CoreProfileState {
  const installedSpec = manifest.dependencies?.[packageName] ?? null
  const launchSpec = runtime.dependenciesAtLaunch[packageName]
  const activeAtLaunch = runtime.bundlesAtLaunch.includes(packageName)
  const activeAfterRestart = manifestBundles(manifest).includes(packageName)
  let state: CoreProfileState['state']
  if (installedSpec === null) state = activeAtLaunch ? 'pending-removal' : 'not-installed'
  else if (!activeAfterRestart && activeAtLaunch) state = 'pending-removal'
  else if (!activeAfterRestart) state = 'installed-inactive'
  else if (!activeAtLaunch || launchSpec === undefined) state = 'pending-install'
  else if (launchSpec !== installedSpec) state = 'pending-update'
  else state = 'active'
  return { state, installedSpec }
}

/** Project one catalog entry against the profile; identity comes from the entry by construction. */
function pluginState(
  runtime: MarketplaceProfileRuntime,
  manifest: ProfileManifest,
  entry: MarketplaceCatalogEntry,
  records: Readonly<Record<string, InstallRecord>> = {},
): MarketplaceProfilePluginState {
  const packageName = entry.package.name
  if (packageName === null) {
    return {
      repositoryId: entry.repositoryId,
      packageName,
      state: 'not-installed',
      installedVersion: null,
      installedSpec: null,
      installedRepository: null,
      catalogSpec: entry.source.ref,
      catalogRelation: 'up-to-date',
      updateAvailable: false,
    }
  }
  const core = coreProfileState(runtime, manifest, packageName)
  const origin = installedOrigin(core.installedSpec)
  const sameOrigin = origin !== null && sameRepository(origin, entry)
  // Only an origin-matched entry may relate pins; a foreign same-name entry
  // must never compute an "update" against someone else's repository.
  const relation = sameOrigin
    ? catalogRelationFor(core.installedSpec, entry, records[packageName])
    : core.installedSpec === null ? 'up-to-date' : 'diverged'
  return {
    repositoryId: entry.repositoryId,
    packageName,
    state: core.state,
    installedVersion: core.installedSpec === null ? null : installedVersion(runtime.dir, packageName),
    installedSpec: core.installedSpec,
    installedRepository: installedOrigin(core.installedSpec ?? runtime.dependenciesAtLaunch[packageName] ?? null)?.fullName ?? null,
    catalogSpec: entry.source.ref,
    catalogRelation: relation,
    updateAvailable: relation === 'update-available',
  }
}

function emptyPlan(
  request: MarketplacePlanRequest,
  profileName: string,
  blockCode: MarketplaceOperationPlan['blockCode'],
  entry?: MarketplaceCatalogEntry,
): MarketplaceOperationPlan {
  return {
    status: 'blocked',
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
    expiresAt: null,
  }
}

function isRestartPending(state: MarketplaceProfilePluginState['state']): boolean {
  return state === 'pending-install' || state === 'pending-update' || state === 'pending-removal'
}

interface InstalledOrigin {
  readonly fullName: string
  readonly commitSha: string | null
}

/** Parse the GitHub origin out of an installed spec in either supported notation. */
function installedOrigin(spec: string | null): InstalledOrigin | null {
  if (spec === null) return null
  const match = /^github:([\w.-]+\/[\w.-]+?)(?:#([0-9a-f]{40}))?$/i.exec(spec)
    ?? /^git\+https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?(?:#([0-9a-f]{40}))?$/i.exec(spec)
  const fullName = match?.[1]
  if (fullName === undefined) return null
  return { fullName, commitSha: match?.[2]?.toLowerCase() ?? null }
}

function sameRepository(origin: InstalledOrigin, entry: MarketplaceCatalogEntry): boolean {
  return origin.fullName.toLowerCase() === entry.repository.fullName.toLowerCase()
}

/** Adversarial review provenance for pins the Marketplace itself installed. */
interface InstallRecord {
  readonly spec: string
  readonly commitSha: string | null
  readonly installedAt: string
  /** True when the user explicitly allowed lifecycle scripts for this install. */
  readonly scripts: boolean
}

const INSTALL_STATE_FILE = 'dsh-plugin-marketplace.installs.json'

/** Read pins this Marketplace installed, best-effort; anything unreadable degrades to no provenance. */
function readInstallRecords(profileDir: string): Readonly<Record<string, InstallRecord>> {
  try {
    const value: unknown = JSON.parse(requireText(join(profileDir, INSTALL_STATE_FILE)))
    if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.installs)) return {}
    return Object.fromEntries(Object.entries(value.installs).flatMap(([name, record]) => {
      if (!isRecord(record) || typeof record.spec !== 'string') return []
      return [[name, {
        spec: record.spec,
        commitSha: typeof record.commitSha === 'string' ? record.commitSha.toLowerCase() : null,
        installedAt: typeof record.installedAt === 'string' ? record.installedAt : '',
        scripts: record.scripts === true,
      } satisfies InstallRecord]]
    }))
  } catch {
    return {}
  }
}

/**
 * Relate the installed pin to the origin-matched catalog entry. An update is
 * claimed only when the Marketplace itself placed the current pin and the
 * catalog has moved since; scanner pins advance along the default branch, so
 * a moved catalog pin is newer. Anything else that differs is honestly
 * 'diverged' — never an update offer, and never a silent downgrade funnel.
 */
function catalogRelationFor(
  installedSpec: string | null,
  entry: MarketplaceCatalogEntry,
  record: InstallRecord | undefined,
): MarketplaceCatalogRelation {
  if (installedSpec === null) return 'up-to-date'
  const installedSha = installedOrigin(installedSpec)?.commitSha ?? null
  const catalogSha = entry.repository.commitSha?.toLowerCase() ?? null
  const samePin = installedSha !== null && catalogSha !== null
    ? installedSha === catalogSha
    : installedSpec === entry.source.ref
  if (samePin) return 'up-to-date'
  if (record !== undefined && installedSha !== null && record.commitSha === installedSha) return 'update-available'
  return 'diverged'
}

function marketplacePlanId(value: string): MarketplacePlanId {
  return value as MarketplacePlanId
}

const WORKSPACE_FILE = 'pnpm-workspace.yaml'

function quoteYamlKey(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** True for an allowBuilds line granting this package, whatever spec it pins. */
function isGrantLineFor(line: string, packageName: string): boolean {
  return line.trimStart().startsWith(`'${`${packageName}@`.replace(/'/g, "''")}`)
}

/**
 * pnpm 11 runs a dependency's lifecycle scripts only when that dependency is
 * named in the profile's allowBuilds. Consent is granted for exactly one
 * name@spec key — the reviewed pin — so an approval never silently covers a
 * different commit, and every other package stays script-blocked by default.
 */
function grantBuildConsent(text: string, packageName: string, sourceRef: string): string {
  const grantLine = `  ${quoteYamlKey(`${packageName}@${sourceRef}`)}: true`
  const lines = text.split('\n')
  const headerIndex = lines.findIndex(line => /^allowBuilds:\s*$/.test(line))
  if (headerIndex === -1) {
    if (/^allowBuilds:/m.test(text)) throw new Error('pnpm-workspace.yaml allowBuilds uses an unsupported layout')
    const base = text.endsWith('\n') ? text.slice(0, -1) : text
    return `${base}\n\nallowBuilds:\n${grantLine}\n`
  }
  const kept = lines.filter(line => !isGrantLineFor(line, packageName))
  const at = kept.findIndex(line => /^allowBuilds:\s*$/.test(line))
  kept.splice(at + 1, 0, grantLine)
  return kept.join('\n')
}

/** Drop this package's allowBuilds grants, and the block header when it turns empty. */
function revokeBuildConsent(text: string, packageName: string): string {
  const kept = text.split('\n').filter(line => !isGrantLineFor(line, packageName))
  const at = kept.findIndex(line => /^allowBuilds:\s*$/.test(line))
  if (at !== -1) {
    let cursor = at + 1
    while (cursor < kept.length && kept[cursor]?.trim() === '') cursor += 1
    const next = kept[cursor]
    if (next === undefined || (!next.startsWith(' ') && !next.startsWith('\t'))) {
      kept.splice(at, 1)
    }
  }
  return kept.join('\n')
}

function hasExactReviewedSource(entry: MarketplaceCatalogEntry): boolean {
  const commitSha = entry.repository.commitSha
  if (commitSha === null || !/^[0-9a-f]{40}$/.test(commitSha)) return false
  return entry.source.ref === `git+https://github.com/${entry.repository.fullName}.git#${commitSha}`
}

/** Owns one-at-a-time profile mutations and rollback for the running Web profile. */
export class MarketplaceProfileOperations {
  private readonly plans = new Map<MarketplacePlanId, StoredPlan>()
  private readonly runPnpm: RunPnpm
  private readonly now: () => number
  private busy = false
  private disposed = false
  private operation: Promise<MarketplaceOperationResult> | null = null
  private abort: AbortController | null = null

  constructor(private readonly options: OperationManagerOptions) {
    this.runPnpm = options.runPnpm ?? ((args, cwd, signal) => (
      options.capabilities.packageManager === 'pnpm'
        ? runPnpm(args, cwd, signal)
        : runPackageManager(options.capabilities.packageManager, args, cwd, signal)
    ))
    this.now = options.now ?? Date.now
  }

  /**
   * Return current installed/active state without starting a process.
   * @returns Current profile state projected over catalog entries, plus any
   *   profile packages the catalog does not describe.
   */
  snapshot(): MarketplaceOperationSnapshot {
    const catalog = this.options.catalog()
    const manifest = readProfileManifest('dsh marketplace', this.options.runtime.dir)
    const catalogPackageNames = new Set(
      catalog?.entries.flatMap(entry => entry.package.name === null ? [] : [entry.package.name]) ?? [],
    )
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...manifestBundles(manifest),
    ])
    const external = [...declared]
      .filter(name => !catalogPackageNames.has(name) && !name.startsWith('@deepseek-ai/'))
      .sort((left, right) => left.localeCompare(right))
      .map(name => ({
        packageName: name,
        installedSpec: manifest.dependencies?.[name] ?? null,
        activeAtLaunch: this.options.runtime.bundlesAtLaunch.includes(name),
        activeAfterRestart: manifestBundles(manifest).includes(name),
      }))
    // Rows are built from profile truth, never from catalog identity: a
    // package is identified by its installed (or at-launch) spec, and a
    // catalog entry is attached only when its repository matches that spec's
    // origin. Without an origin match there is no catalog identity to show —
    // the row must not borrow a same-name stranger's publisher, and it must
    // never offer that stranger's code as an "update".
    const records = readInstallRecords(this.options.runtime.dir)
    const entriesByName = new Map<string, MarketplaceCatalogEntry[]>()
    for (const entry of catalog?.entries ?? []) {
      if (entry.package.name === null) continue
      const list = entriesByName.get(entry.package.name)
      if (list === undefined) entriesByName.set(entry.package.name, [entry])
      else list.push(entry)
    }
    const packageNames = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...manifestBundles(manifest),
      ...Object.keys(this.options.runtime.dependenciesAtLaunch),
      ...this.options.runtime.bundlesAtLaunch,
    ])
    const plugins: MarketplaceProfilePluginState[] = []
    for (const packageName of [...packageNames].sort((left, right) => left.localeCompare(right))) {
      const candidates = entriesByName.get(packageName)
      if (candidates === undefined) continue // external territory, reported above
      const core = coreProfileState(this.options.runtime, manifest, packageName)
      if (core.state === 'not-installed') continue
      const origin = installedOrigin(core.installedSpec ?? this.options.runtime.dependenciesAtLaunch[packageName] ?? null)
      const match = origin === null ? undefined : candidates.find(entry => sameRepository(origin, entry))
      if (match === undefined) {
        plugins.push({
          repositoryId: null,
          packageName,
          state: core.state,
          installedVersion: core.installedSpec === null ? null : installedVersion(this.options.runtime.dir, packageName),
          installedSpec: core.installedSpec,
          installedRepository: origin?.fullName ?? null,
          catalogSpec: null,
          catalogRelation: 'not-in-catalog',
          updateAvailable: false,
        })
        continue
      }
      plugins.push(pluginState(this.options.runtime, manifest, match, records))
    }
    return {
      profileName: this.options.runtime.profileName,
      busy: this.busy,
      capabilities: this.options.capabilities,
      plugins,
      external,
    }
  }

  /**
   * Qualify an exact install/update/remove request and retain it briefly for confirmation.
   * @param request - Catalog repository and requested operation.
   * @returns A short-lived exact plan or a blocked decision.
   */
  plan(request: MarketplacePlanRequest): MarketplaceOperationPlan {
    const catalog = this.options.catalog()
    const entry = catalog?.entries.find(item => (
      item.repositoryId === request.repositoryId && isPublicMarketplaceEntry(item)
    ))
    if (catalog === null || entry === undefined) {
      return emptyPlan(request, this.options.runtime.profileName, 'catalog-entry-missing')
    }
    if (this.options.capabilities.packageManager === 'unavailable') {
      return emptyPlan(request, this.options.runtime.profileName, 'package-manager-unavailable', entry)
    }
    if (!this.options.capabilities.profileWritable) {
      return emptyPlan(request, this.options.runtime.profileName, 'profile-not-writable', entry)
    }
    const manifest = readProfileManifest('dsh marketplace', this.options.runtime.dir)
    const state = pluginState(this.options.runtime, manifest, entry, readInstallRecords(this.options.runtime.dir))
    if (isRestartPending(state.state)) {
      return emptyPlan(request, this.options.runtime.profileName, 'restart-required', entry)
    }
    const origin = installedOrigin(state.installedSpec)
    const sameOrigin = origin !== null && sameRepository(origin, entry)
    let action: 'install' | 'update' | 'remove'
    let requiresScripts = false
    if (request.action === 'remove') {
      if (state.installedSpec === null) return emptyPlan(request, this.options.runtime.profileName, 'not-installed', entry)
      action = 'remove'
    } else {
      if (entry.package.name === null || entry.package.version === null || !hasExactReviewedSource(entry)) {
        return emptyPlan(request, this.options.runtime.profileName, 'package-metadata-missing', entry)
      }
      // The consent gate: an entry whose install targets are not shipped can
      // still be installed, but only by running its declared lifecycle scripts —
      // which the user must review in the plan and approve at execute time.
      if (entry.installability !== 'one-click-eligible') {
        if (entry.installability !== 'manual' || entry.installScripts === null) {
          return emptyPlan(request, this.options.runtime.profileName, 'not-one-click-eligible', entry)
        }
        requiresScripts = true
      }
      if (state.state === 'active' && sameOrigin && !state.updateAvailable) {
        return emptyPlan(request, this.options.runtime.profileName, 'already-installed', entry)
      }
      action = state.installedSpec === null ? 'install' : 'update'
    }
    const warnings: MarketplacePlanWarning[] = ['code-executes-on-restart', 'restart-required']
    if (action !== 'remove') {
      warnings.unshift('git-source', requiresScripts ? 'install-scripts-run' : 'install-scripts-disabled')
      if (entry.compatibility === 'unknown') warnings.unshift('compatibility-unknown')
      if (state.installedSpec !== null && !sameOrigin) warnings.push('origin-differs')
    }
    const planId = marketplacePlanId(randomUUID())
    const expiresAt = new Date(this.now() + PLAN_TTL_MS).toISOString()
    const plan: StoredPlan['plan'] = {
      status: 'ready',
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
      expiresAt,
    }
    this.plans.set(planId, { plan, catalogDigest: catalog.integrity.digest, installedSpec: state.installedSpec })
    return plan
  }

  /**
   * Execute one reviewed plan once; concurrent calls are rejected without side effects.
   * @param request - Host-issued plan identifier from the review step.
   * @returns Committed or rolled-back operation result.
   */
  execute(request: MarketplaceExecuteRequest): Promise<MarketplaceOperationResult> {
    if (this.busy) return Promise.resolve(this.failure('operation-busy'))
    if (this.disposed) return Promise.resolve(this.failure('service-disposed'))
    const stored = this.plans.get(request.planId)
    this.plans.delete(request.planId)
    if (stored === undefined) return Promise.resolve(this.failure('plan-invalid'))
    if (Date.parse(stored.plan.expiresAt ?? '') <= this.now()) {
      return Promise.resolve(this.failure('plan-expired'))
    }
    if (stored.plan.requiresScripts && request.allowScripts !== true) {
      return Promise.resolve(this.failure('consent-required', stored.plan))
    }
    const current = this.options.catalog()
    const entry = current?.entries.find(item => item.repositoryId === stored.plan.repositoryId)
    const manifest = readProfileManifest('dsh marketplace', this.options.runtime.dir)
    const state = entry === undefined ? undefined : pluginState(this.options.runtime, manifest, entry)
    if (current?.integrity.digest !== stored.catalogDigest || state?.installedSpec !== stored.installedSpec) {
      return Promise.resolve(this.failure('profile-state-changed', stored.plan))
    }
    this.busy = true
    this.abort = new AbortController()
    this.operation = this.run(stored, this.abort.signal).finally(() => {
      this.busy = false
      this.abort = null
      this.operation = null
    })
    return this.operation
  }

  /** Abort and drain an in-flight pnpm process before the owning Fiber leaves. */
  async close(): Promise<void> {
    this.disposed = true
    this.plans.clear()
    this.abort?.abort()
    await this.operation
  }

  private failure(
    code: Exclude<MarketplaceOperationResult['code'], 'succeeded'>,
    plan?: MarketplaceOperationPlan,
    rollback: MarketplaceOperationResult['rollback'] = 'not-needed',
  ): MarketplaceOperationResult {
    return {
      status: 'failed',
      code,
      action: plan?.action ?? null,
      profileName: this.options.runtime.profileName,
      packageName: plan?.packageName ?? null,
      requiresRestart: false,
      rollback,
      snapshot: this.snapshot(),
    }
  }

  private async run(stored: StoredPlan, signal: AbortSignal): Promise<MarketplaceOperationResult> {
    const { plan } = stored
    const packageName = plan.packageName
    if (packageName === null) return this.failure('plan-invalid', plan)
    const backups = await Promise.all([
      backup(join(this.options.runtime.dir, 'package.json')),
      backup(join(this.options.runtime.dir, 'pnpm-lock.yaml')),
      backup(join(this.options.runtime.dir, WORKSPACE_FILE)),
    ])
    // A consented script install first records its exact-pin grant; if that
    // write fails we stop before pnpm runs anything rather than installing a
    // package whose build never happened.
    if (plan.action !== 'remove' && plan.requiresScripts) {
      try {
        const workspacePath = join(this.options.runtime.dir, WORKSPACE_FILE)
        const current = await readFile(workspacePath, 'utf8')
        await writeFileAtomic(
          workspacePath,
          grantBuildConsent(current, packageName, plan.sourceRef as string),
          { mode: 0o600, dirMode: 0o700 },
        )
      } catch {
        const rollback = await this.rollback(backups)
        return this.failure('profile-write-failed', plan, rollback)
      }
    }
    // pnpm remove rejects --ignore-scripts (it never runs lifecycle scripts);
    // plain installs keep it so third-party hooks never execute; a consented
    // install drops it exactly once, with allowBuilds limiting execution to
    // the reviewed package@spec.
    const args = plan.action === 'remove'
      ? ['remove', packageName]
      : plan.requiresScripts
        ? ['add', '--save-exact', plan.sourceRef as string]
        : ['add', '--ignore-scripts', '--save-exact', plan.sourceRef as string]
    const command = await this.runPnpm(args, this.options.runtime.dir, signal)
    if (this.disposed) {
      const rollback = await this.rollback(backups)
      return this.failure('service-disposed', plan, rollback)
    }
    if (command.exitCode !== 0) {
      const rollback = await this.rollback(backups)
      return this.failure(command.unavailable ? 'pnpm-unavailable' : 'pnpm-failed', plan, rollback)
    }
    try {
      const manifest = readProfileManifest('dsh marketplace', this.options.runtime.dir)
      const bundles = [...manifestBundles(manifest)]
      if (plan.action === 'remove') {
        manifest.dsh = {
          ...manifest.dsh,
          profile: { ...manifest.dsh?.profile, bundles: bundles.filter(name => name !== packageName) },
        }
      } else {
        await this.validateInstalledPackage(packageName, plan.packageVersion, plan.sourceRef)
        if (!bundles.includes(packageName)) bundles.push(packageName)
        manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles } }
      }
      await writeFileAtomic(
        join(this.options.runtime.dir, 'package.json'),
        `${JSON.stringify(manifest, undefined, 2)}\n`,
        { mode: 0o600, dirMode: 0o700 },
      )
      loadProfile(
        'dsh marketplace',
        this.options.runtime.profileName,
        join(this.options.runtime.dir, 'package.json'),
        profileHome(this.options.runtime.dir),
      )
    } catch {
      const rollback = await this.rollback(backups)
      return this.failure(rollback === 'failed' ? 'rollback-failed' : 'installed-package-invalid', plan, rollback)
    }
    // Record provenance for pins this Marketplace placed, so future snapshots
    // can tell a proven catalog advance (update-available) from an unexplained
    // pin change (diverged). Advisory only: a failed write degrades the next
    // snapshot to 'diverged', never to a false claim.
    try {
      const records = { ...readInstallRecords(this.options.runtime.dir) }
      if (plan.action === 'remove') {
        delete records[packageName]
        try {
          const workspacePath = join(this.options.runtime.dir, WORKSPACE_FILE)
          const current = await readFile(workspacePath, 'utf8')
          const next = revokeBuildConsent(current, packageName)
          if (next !== current) {
            await writeFileAtomic(workspacePath, next, { mode: 0o600, dirMode: 0o700 })
          }
        } catch {
          // A stale grant for a spec that is no longer installed is inert.
        }
      } else {
        records[packageName] = {
          spec: plan.sourceRef as string,
          commitSha: plan.commitSha?.toLowerCase() ?? null,
          installedAt: new Date(this.now()).toISOString(),
          scripts: plan.requiresScripts,
        }
      }
      await writeFileAtomic(
        join(this.options.runtime.dir, INSTALL_STATE_FILE),
        `${JSON.stringify({ schemaVersion: 1, installs: records }, undefined, 2)}\n`,
        { mode: 0o600, dirMode: 0o700 },
      )
    } catch {
      // Provenance is best-effort; the profile mutation above is already committed.
    }
    return {
      status: 'succeeded',
      code: 'succeeded',
      action: plan.action,
      profileName: this.options.runtime.profileName,
      packageName,
      requiresRestart: true,
      rollback: 'not-needed',
      snapshot: this.snapshot(),
    }
  }

  private async validateInstalledPackage(
    packageName: string,
    expectedVersion: string | null,
    sourceRef: string | null,
  ): Promise<void> {
    if (sourceRef === null || !/^git\+https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git#[0-9a-f]{40}$/i.test(sourceRef)) {
      throw new TypeError('marketplace install source is not an immutable GitHub commit')
    }
    const dir = packageDir(this.options.runtime.dir, packageName)
    const value: unknown = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    if (!isRecord(value) || value.name !== packageName || value.version !== expectedVersion
      || !isRecord(value.dsh) || !isRecord(value.dsh.bundle)
      || typeof value.dsh.bundle.patch !== 'string') {
      throw new TypeError('installed package does not match the reviewed bundle metadata')
    }
    const patchPath = resolve(dir, value.dsh.bundle.patch)
    const relativePath = relative(dir, patchPath)
    if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new TypeError('installed bundle patch escapes the package')
    }
    loadOverlayPatches('dsh marketplace', patchPath)
  }

  private async rollback(backups: readonly FileBackup[]): Promise<'succeeded' | 'failed'> {
    try {
      await restore(backups)
      // Rollback must outlive cancellation of the mutating command. Reusing its
      // aborted signal would restore metadata but leave node_modules half-mutated.
      const repair = await this.runPnpm(
        ['install', '--ignore-scripts'],
        this.options.runtime.dir,
        AbortSignal.timeout(120_000),
      )
      return repair.exitCode === 0 ? 'succeeded' : 'failed'
    } catch {
      return 'failed'
    }
  }
}
