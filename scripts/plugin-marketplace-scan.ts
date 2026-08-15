/** Incremental, non-executing GitHub scanner for the static DSH plugin catalog. */

import { readFile } from 'node:fs/promises'
import { posix, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { writeFileAtomic } from '../src/atomic-write.ts'
import {
  parseMarketplaceCatalogText,
  sealMarketplaceCatalog,
} from '../src/catalog.ts'
import type {
  MarketplaceCatalogEntry,
  MarketplaceCatalogSnapshot,
  MarketplacePackEntry,
  MarketplacePackValidationCode,
  MarketplaceRiskSignal,
  MarketplaceValidationCode,
  MarketplaceValidationStatus,
} from '../src/types.ts'
import * as yaml from 'js-yaml'
import {
  GitHubMarketplaceClient,
  type GitHubContentResult,
  type GitHubRepository,
  type GitHubSearchPage,
  type GitHubSearchWindow,
} from './plugin-marketplace-github.ts'

export const MARKETPLACE_SCANNER_VERSION = '6'
export const DEFAULT_MARKETPLACE_TOPIC = 'dsh-plugin'
/** A repository carrying this topic alongside dsh-plugin is a solution pack, not a bundle. */
export const MARKETPLACE_PACK_TOPIC = 'dsh-plugin-pack'
export const MARKETPLACE_PACK_MANIFEST_PATH = 'dsh.pack.json'
const MAX_PACK_ITEMS = 50
const VALIDATION_CONCURRENCY = 12
const STATE_SCHEMA_VERSION = 6
const SEARCH_EPOCH = '1970-01-01T00:00:00.000Z'

/** Narrow seam used by deterministic scanner tests. */
export interface MarketplaceGitHubReader {
  searchRepositories(topic: string, window: GitHubSearchWindow, page: number): Promise<GitHubSearchPage>
  getRepositoryById(id: string): Promise<GitHubRepository | null>
  getContent(fullName: string, path: string, ref: string, etag: string | null): Promise<GitHubContentResult>
  getTreePaths(fullName: string, ref: string): Promise<{ paths: ReadonlySet<string>; truncated: boolean }>
  resolveDefaultBranchCommits(repositories: readonly GitHubRepository[]): Promise<Readonly<Record<string, string>>>
}

interface PluginScanState {
  readonly kind: 'plugin'
  readonly repositoryId: string
  readonly pushedAt: string
  readonly validatorVersion: string
  readonly packageEtag: string | null
  /** ETag of the bundle patch document. */
  readonly documentEtag: string | null
  readonly exportFileTargets: readonly string[]
  readonly patchFileTargets: readonly string[]
  readonly patchFileTargetsKnown: boolean
  /** Root-relative install targets whose existence was checked at the pinned commit. */
  readonly oneClickFileTargets: readonly string[]
  /** True when every one-click target was proven to exist at the pinned commit. */
  readonly oneClickEvidence: boolean
  readonly entry: MarketplaceCatalogEntry
}

interface PackScanState {
  readonly kind: 'pack'
  readonly repositoryId: string
  readonly pushedAt: string
  readonly validatorVersion: string
  /** ETag of the pack manifest document. */
  readonly documentEtag: string | null
  /** Item owner/repo strings exactly as declared; ids are re-resolved at publish. */
  readonly packItems: readonly string[]
  readonly pack: MarketplacePackEntry
}

type RepositoryScanState = PluginScanState | PackScanState

interface MarketplaceScannerState {
  readonly schemaVersion: 6
  readonly topic: string
  readonly searchWindows: readonly GitHubSearchWindow[]
  readonly repositories: Readonly<Record<string, RepositoryScanState>>
}

interface ScanOptions {
  readonly client: MarketplaceGitHubReader
  readonly topic: string
  readonly outputPath: string
  readonly rejectedPath: string
  readonly statePath: string
  readonly now?: () => Date
}

interface PackageMetadata {
  readonly name: string | null
  readonly version: string | null
  readonly description: string | null
  readonly author: string | null
  readonly license: string | null
  readonly keywords: readonly string[]
  readonly patchPath: string | null
  /** All package export targets required by the Host and, where declared, Client entry points. */
  readonly exportTargets: readonly string[] | null
  /** Lifecycle script bodies (preinstall/install/postinstall/prepare), verbatim; null when absent. */
  readonly installScripts: Readonly<Record<string, string>> | null
  readonly riskSignals: readonly MarketplaceRiskSignal[]
  readonly earlyFailure: MarketplaceValidationCode | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function validationMessage(code: MarketplaceValidationCode): string | null {
  const messages: Partial<Record<MarketplaceValidationCode, string>> = {
    'repository-archived': 'The repository is archived.',
    'package-json-missing': 'The root package.json file is missing.',
    'package-json-invalid': 'The root package.json file is not valid JSON.',
    'bundle-declaration-missing': 'The root package.json does not declare dsh.bundle.patch.',
    'patch-path-invalid': 'The declared bundle patch path is not a safe root-relative path.',
    'patch-missing': 'The declared bundle patch file is missing.',
    'patch-invalid': 'The declared bundle patch is not a valid Cordis patch document.',
    'github-request-failed': 'Repository validation could not be completed.',
  }
  return messages[code] ?? null
}

function packValidationMessage(code: MarketplacePackValidationCode): string | null {
  const messages: Partial<Record<MarketplacePackValidationCode, string>> = {
    'repository-archived': 'The repository is archived.',
    'pack-manifest-missing': 'The root dsh.pack.json pack manifest is missing.',
    'pack-manifest-invalid': 'The pack manifest is not a valid dsh.pack.json document.',
    'github-request-failed': 'Repository validation could not be completed.',
  }
  return messages[code] ?? null
}

function normalizePatchPath(value: string): string | null {
  if (value.includes('\\') || posix.isAbsolute(value)) return null
  const normalized = posix.normalize(value.replace(/^\.\//, ''))
  if (normalized.length === 0 || normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null
  return normalized
}

function exportTargetPaths(value: unknown): string[] | null {
  if (typeof value === 'string') {
    const path = normalizePatchPath(value)
    return path === null ? null : [path]
  }
  if (!isRecord(value)) return null
  const targets: string[] = []
  for (const target of Object.values(value)) {
    const nested = exportTargetPaths(target)
    if (nested === null) return null
    targets.push(...nested)
  }
  return uniqueSorted(targets)
}

function declaredExportTargets(value: Record<string, unknown>): string[] | null {
  const exports = value.exports
  if (exports === undefined) {
    const main = typeof value.main === 'string' ? normalizePatchPath(value.main) : null
    return main === null ? null : [main]
  }
  const clientDeclared = isRecord(value.dsh) && 'client' in value.dsh
  if (!isRecord(exports)) {
    const hostTargets = exportTargetPaths(exports)
    return clientDeclared || hostTargets === null ? null : hostTargets
  }
  const hostExport = '.' in exports
    ? exports['.']
    : Object.keys(exports).some(key => key.startsWith('.')) ? undefined : exports
  const hostTargets = hostExport === undefined ? null : exportTargetPaths(hostExport)
  if (hostTargets === null) return null
  if (!clientDeclared) return hostTargets
  const clientTargets = exportTargetPaths(exports['./client'])
  return clientTargets === null ? null : uniqueSorted([...hostTargets, ...clientTargets])
}

function directPatchFileTargets(text: string): string[] | null {
  let document: unknown
  try {
    document = loadPatchDocument(text)
  } catch {
    return null
  }
  const targets: string[] = []
  const visit = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.every(visit)
    if (!isRecord(value)) return true
    if (typeof value.name === 'string' && value.name.startsWith('.')) {
      const target = normalizePatchPath(value.name)
      if (target === null) return false
      targets.push(target)
    }
    return Object.values(value).every(visit)
  }
  return visit(document) ? uniqueSorted(targets) : null
}

function authorFromPackage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value
  if (isRecord(value) && typeof value.name === 'string' && value.name.trim().length > 0) return value.name
  return null
}

function keywordsFromPackage(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueSorted(value.filter(item => typeof item === 'string' && item.length > 0))
  if (typeof value === 'string') return uniqueSorted(value.split(',').map(item => item.trim()).filter(Boolean))
  return []
}

const LIFECYCLE_SCRIPT_NAMES = ['preinstall', 'install', 'postinstall', 'prepare'] as const

/** Lifecycle script bodies verbatim, or null when the package declares none. */
function installScriptsFromPackage(scripts: Record<string, unknown>): Record<string, string> | null {
  const bodies: Record<string, string> = {}
  for (const name of LIFECYCLE_SCRIPT_NAMES) {
    const body = scripts[name]
    if (typeof body === 'string' && body.trim().length > 0) bodies[name] = body
  }
  return Object.keys(bodies).length === 0 ? null : bodies
}

function emptyMetadata(repository: GitHubRepository, earlyFailure: MarketplaceValidationCode | null): PackageMetadata {
  return {
    name: null,
    version: null,
    description: repository.description,
    author: repository.owner,
    license: repository.license,
    keywords: [],
    patchPath: null,
    exportTargets: null,
    installScripts: null,
    riskSignals: [],
    earlyFailure,
  }
}

function packageMetadata(text: string, repository: GitHubRepository): PackageMetadata {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return emptyMetadata(repository, 'package-json-invalid')
  }
  if (!isRecord(value)) {
    return emptyMetadata(repository, 'package-json-invalid')
  }
  const risks: MarketplaceRiskSignal[] = []
  const installScripts = isRecord(value.scripts) ? installScriptsFromPackage(value.scripts) : null
  if (installScripts !== null) risks.push('lifecycle-script')
  if (isRecord(value.scripts) && typeof value.scripts.build === 'string') risks.push('build-script')
  const patchValue = isRecord(value.dsh) && isRecord(value.dsh.bundle) ? value.dsh.bundle.patch : undefined
  const declaredPath = typeof patchValue === 'string' ? normalizePatchPath(patchValue) : null
  const earlyFailure = typeof patchValue !== 'string'
    ? 'bundle-declaration-missing'
    : declaredPath === null ? 'patch-path-invalid' : null
  return {
    name: typeof value.name === 'string' ? value.name : null,
    version: typeof value.version === 'string' ? value.version : null,
    description: typeof value.description === 'string' ? value.description : repository.description,
    author: authorFromPackage(value.author) ?? repository.owner,
    license: typeof value.license === 'string' ? value.license : repository.license,
    keywords: keywordsFromPackage(value.keywords),
    patchPath: declaredPath,
    exportTargets: declaredExportTargets(value),
    installScripts,
    riskSignals: uniqueSorted(risks) as MarketplaceRiskSignal[],
    earlyFailure,
  }
}

function packageMetadataFromEntry(entry: MarketplaceCatalogEntry): PackageMetadata {
  return {
    ...entry.package,
    keywords: entry.keywords,
    patchPath: entry.source.patchPath,
    exportTargets: null,
    installScripts: entry.installScripts,
    riskSignals: entry.riskSignals.filter(signal => signal === 'lifecycle-script' || signal === 'build-script'),
    earlyFailure: entry.source.patchPath === null && entry.validation.status === 'invalid'
      ? entry.validation.code
      : null,
  }
}

/**
 * The Loader's entry-list YAML dialect mirrored without execution: `!!js`
 * scalars parse to inert sentinel objects, so dynamic patches validate
 * structurally while their expressions are never run and never analyzed as
 * file targets. Kept in sync with dsh-app-boot's entryListSchema.
 */
const inertJsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: data => typeof data === 'string',
  construct: data => ({ __jsExpr: data }),
})
const patchYamlSchema = yaml.JSON_SCHEMA.extend(inertJsExpr)

function loadPatchDocument(text: string): unknown {
  return yaml.load(text, { schema: patchYamlSchema })
}

function patchDocumentIsValid(text: string): boolean {
  let value: unknown
  try {
    value = loadPatchDocument(text)
  } catch {
    return false
  }
  return Array.isArray(value) && value.length > 0 && value.every(operation =>
    isRecord(operation) && ['insert', 'update', 'remove'].some(key => key in operation))
}

function sourceFor(repository: GitHubRepository, commitSha: string | null): {
  ref: string
  risks: MarketplaceRiskSignal[]
} {
  const git = `git+https://github.com/${repository.fullName}.git`
  return {
    ref: commitSha === null ? git : `${git}#${commitSha}`,
    risks: commitSha === null ? ['git-source', 'unpinned-source'] : ['git-source'],
  }
}

/**
 * One-click eligibility is earned by proof, not by the absence of worrying
 * signals: the install targets must exist at the pinned commit. Scripts no
 * longer disqualify — the one-click path always installs with
 * --ignore-scripts, so declared scripts never run there; entries whose targets
 * are NOT shipped stay 'manual', and lifecycle scripts on them mark the
 * consent-gated path instead.
 */
function installabilityFor(
  status: MarketplaceCatalogEntry['validation']['status'],
  commitSha: string | null,
  metadata: PackageMetadata,
  oneClickEvidence: boolean,
): MarketplaceCatalogEntry['installability'] {
  if (status !== 'valid') return 'browse-only'
  if (commitSha === null || metadata.name === null || metadata.version === null || !oneClickEvidence) {
    return 'manual'
  }
  return 'one-click-eligible'
}

function makeEntry(
  repository: GitHubRepository,
  commitSha: string | null,
  metadata: PackageMetadata,
  code: MarketplaceValidationCode,
  firstSeenAt: string,
  indexedAt: string,
  oneClickEvidence = false,
): MarketplaceCatalogEntry {
  const status = code === 'valid-bundle' ? 'valid' : code === 'repository-archived' ? 'archived' : 'invalid'
  const source = sourceFor(repository, commitSha)
  const risks = uniqueSorted([
    ...source.risks,
    ...metadata.riskSignals,
    ...(repository.archived ? ['repository-archived' as const] : []),
  ]) as MarketplaceRiskSignal[]
  return {
    repositoryId: repository.id,
    repository: {
      fullName: repository.fullName,
      url: repository.url,
      defaultBranch: repository.defaultBranch,
      commitSha,
      archived: repository.archived,
    },
    package: {
      name: metadata.name,
      version: metadata.version,
      description: metadata.description,
      author: metadata.author,
      license: metadata.license,
    },
    topics: uniqueSorted(repository.topics),
    keywords: uniqueSorted(metadata.keywords),
    stars: repository.stars,
    repositoryCreatedAt: repository.createdAt,
    lastCodePushAt: repository.pushedAt,
    firstSeenAt,
    indexedAt,
    source: {
      kind: 'git',
      ref: source.ref,
      packageJsonPath: 'package.json',
      patchPath: metadata.patchPath,
    },
    validation: { status, code, message: validationMessage(code) },
    compatibility: 'unknown',
    installability: installabilityFor(status, commitSha, metadata, oneClickEvidence),
    riskSignals: risks,
    installScripts: metadata.installScripts,
  }
}

function refreshRepositoryMetadata(repository: GitHubRepository, previous: MarketplaceCatalogEntry): MarketplaceCatalogEntry {
  const source = sourceFor(repository, previous.repository.commitSha)
  return {
    ...previous,
    repository: {
      fullName: repository.fullName,
      url: repository.url,
      defaultBranch: repository.defaultBranch,
      commitSha: previous.repository.commitSha,
      archived: repository.archived,
    },
    package: {
      ...previous.package,
      description: previous.package.description ?? repository.description,
      author: previous.package.author ?? repository.owner,
      license: previous.package.license ?? repository.license,
    },
    topics: uniqueSorted(repository.topics),
    stars: repository.stars,
    repositoryCreatedAt: repository.createdAt,
    lastCodePushAt: repository.pushedAt,
    source: { ...previous.source, ref: source.ref },
  }
}

interface PackManifest {
  readonly name: string | null
  readonly description: string | null
  readonly items: readonly string[]
}

const PACK_ITEM_NAME = /^[\w.-]+\/[\w.-]+$/

/**
 * Parse a dsh.pack.json document. A pack is a curated list of plugin
 * repositories — nothing more. Items are owner/repo strings; resolution to
 * stable repository ids happens at publish time against the scan's own stream,
 * never by trusting the pack's text as identity.
 */
function packManifest(text: string): PackManifest | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.items)) return null
  const seen = new Set<string>()
  const items: string[] = []
  for (const item of value.items) {
    if (typeof item !== 'string' || !PACK_ITEM_NAME.test(item)) return null
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push(item)
  }
  if (items.length === 0 || items.length > MAX_PACK_ITEMS) return null
  const name = typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 100
    ? value.name.trim()
    : null
  const description = typeof value.description === 'string' && value.description.length <= 500
    ? value.description
    : null
  return { name, description, items }
}

function makePackEntry(
  repository: GitHubRepository,
  commitSha: string | null,
  manifest: PackManifest | null,
  code: MarketplacePackValidationCode,
  firstSeenAt: string,
  indexedAt: string,
): MarketplacePackEntry {
  const status = code === 'valid-pack' ? 'valid' : code === 'repository-archived' ? 'archived' : 'invalid'
  return {
    repositoryId: repository.id,
    repository: {
      fullName: repository.fullName,
      url: repository.url,
      defaultBranch: repository.defaultBranch,
      commitSha,
      archived: repository.archived,
    },
    name: manifest?.name ?? repository.fullName.split('/')[1] ?? repository.fullName,
    description: manifest?.description ?? repository.description,
    items: (manifest?.items ?? []).map(fullName => ({ fullName, repositoryId: null })),
    stars: repository.stars,
    repositoryCreatedAt: repository.createdAt,
    lastCodePushAt: repository.pushedAt,
    firstSeenAt,
    indexedAt,
    validation: { status, code, message: packValidationMessage(code) },
  }
}

function refreshPackMetadata(repository: GitHubRepository, previous: MarketplacePackEntry): MarketplacePackEntry {
  return {
    ...previous,
    repository: {
      fullName: repository.fullName,
      url: repository.url,
      defaultBranch: repository.defaultBranch,
      commitSha: previous.repository.commitSha,
      archived: repository.archived,
    },
    stars: repository.stars,
    repositoryCreatedAt: repository.createdAt,
    lastCodePushAt: repository.pushedAt,
  }
}

function midpoint(window: GitHubSearchWindow): string {
  const start = Date.parse(window.start)
  const end = Date.parse(window.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start <= 1_000) {
    throw new Error(`GitHub search window cannot be split below 1 second: ${window.start}..${window.end}`)
  }
  return new Date(start + Math.floor((end - start) / 2)).toISOString()
}

async function scanWindow(
  client: MarketplaceGitHubReader,
  topic: string,
  window: GitHubSearchWindow,
): Promise<{ repositories: GitHubRepository[]; windows: GitHubSearchWindow[] }> {
  const first = await client.searchRepositories(topic, window, 1)
  if (first.incomplete || first.totalCount > 1_000) {
    let split: string
    try {
      split = midpoint(window)
    } catch (cause) {
      if (first.incomplete) {
        throw new Error(`GitHub search returned incomplete_results for ${window.start}..${window.end}`, { cause })
      }
      throw cause
    }
    const left = await scanWindow(client, topic, { start: window.start, end: split })
    const right = await scanWindow(client, topic, { start: split, end: window.end })
    return {
      repositories: [...left.repositories, ...right.repositories],
      windows: [...left.windows, ...right.windows],
    }
  }
  const repositories = [...first.repositories]
  const pages = Math.ceil(first.totalCount / 100)
  for (let page = 2; page <= pages; page += 1) {
    const next = await client.searchRepositories(topic, window, page)
    if (next.incomplete || next.totalCount !== first.totalCount) {
      throw new Error(`GitHub search changed or became incomplete while paging ${window.start}..${window.end}`)
    }
    repositories.push(...next.repositories)
  }
  return { repositories, windows: [window] }
}

function validWindows(value: unknown): GitHubSearchWindow[] {
  if (!Array.isArray(value)) return []
  const windows = value.flatMap((window): GitHubSearchWindow[] =>
    isRecord(window) && typeof window.start === 'string' && typeof window.end === 'string'
      && Date.parse(window.start) < Date.parse(window.end)
      ? [{ start: window.start, end: window.end }]
      : [])
  windows.sort((left, right) => left.start.localeCompare(right.start))
  const first = windows[0]
  if (first === undefined || first.start !== SEARCH_EPOCH) return []
  for (let index = 1; index < windows.length; index += 1) {
    const previous = windows[index - 1]
    const current = windows[index]
    if (previous === undefined || current === undefined || previous.end !== current.start) return []
  }
  return windows
}

function parsePreviousEntry(value: unknown): MarketplaceCatalogEntry | null {
  if (!isRecord(value)) return null
  try {
    const candidate = sealMarketplaceCatalog({
      schemaVersion: 1,
      generatedAt: '2000-01-01T00:00:00.000Z',
      scannerVersion: 'state-validation',
      topic: DEFAULT_MARKETPLACE_TOPIC,
      integrity: { algorithm: 'sha256', digest: '' },
      summary: {
        entryCount: 1,
        invalidEntryCount: isRecord(value.validation) && value.validation.status === 'valid' ? 0 : 1,
        packCount: 0,
      },
      entries: [value as unknown as MarketplaceCatalogEntry],
      packs: [],
    })
    return parseMarketplaceCatalogText(JSON.stringify(candidate)).entries[0] ?? null
  } catch {
    return null
  }
}

function parsePreviousPack(value: unknown): MarketplacePackEntry | null {
  if (!isRecord(value)) return null
  try {
    const candidate = sealMarketplaceCatalog({
      schemaVersion: 1,
      generatedAt: '2000-01-01T00:00:00.000Z',
      scannerVersion: 'state-validation',
      topic: DEFAULT_MARKETPLACE_TOPIC,
      integrity: { algorithm: 'sha256', digest: '' },
      summary: {
        entryCount: 0,
        invalidEntryCount: 0,
        packCount: 1,
      },
      entries: [],
      packs: [value as unknown as MarketplacePackEntry],
    })
    return parseMarketplaceCatalogText(JSON.stringify(candidate)).packs[0] ?? null
  } catch {
    return null
  }
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return null
  return uniqueSorted(value)
}

/** Item order is the pack author's curation; validate without reordering. */
function orderedStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return null
  return [...value]
}

function readPluginState(id: string, raw: Record<string, unknown>): PluginScanState | null {
  if (typeof raw.pushedAt !== 'string'
    || typeof raw.validatorVersion !== 'string'
    || !(typeof raw.packageEtag === 'string' || raw.packageEtag === null)
    || !(typeof raw.documentEtag === 'string' || raw.documentEtag === null)
    || typeof raw.patchFileTargetsKnown !== 'boolean'
    || typeof raw.oneClickEvidence !== 'boolean') return null
  const exportFileTargets = stringArray(raw.exportFileTargets)
  const patchFileTargets = stringArray(raw.patchFileTargets)
  const oneClickFileTargets = stringArray(raw.oneClickFileTargets)
  if (exportFileTargets === null || patchFileTargets === null || oneClickFileTargets === null) return null
  const entry = parsePreviousEntry(raw.entry)
  if (entry === null || entry.repositoryId !== id) return null
  return {
    kind: 'plugin',
    repositoryId: id,
    pushedAt: raw.pushedAt,
    validatorVersion: raw.validatorVersion,
    packageEtag: raw.packageEtag,
    documentEtag: raw.documentEtag,
    exportFileTargets,
    patchFileTargets,
    patchFileTargetsKnown: raw.patchFileTargetsKnown,
    oneClickFileTargets,
    oneClickEvidence: raw.oneClickEvidence,
    entry,
  }
}

function readPackState(id: string, raw: Record<string, unknown>): PackScanState | null {
  if (typeof raw.pushedAt !== 'string'
    || typeof raw.validatorVersion !== 'string'
    || !(typeof raw.documentEtag === 'string' || raw.documentEtag === null)) return null
  const packItems = orderedStringArray(raw.packItems)
  if (packItems === null) return null
  const pack = parsePreviousPack(raw.pack)
  if (pack === null || pack.repositoryId !== id) return null
  return {
    kind: 'pack',
    repositoryId: id,
    pushedAt: raw.pushedAt,
    validatorVersion: raw.validatorVersion,
    documentEtag: raw.documentEtag,
    packItems,
    pack,
  }
}

async function readState(path: string, topic: string): Promise<MarketplaceScannerState> {
  const empty: MarketplaceScannerState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    topic,
    searchWindows: [],
    repositories: {},
  }
  let value: unknown
  try {
    value = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return empty
    return empty
  }
  if (!isRecord(value) || value.schemaVersion !== STATE_SCHEMA_VERSION || value.topic !== topic || !isRecord(value.repositories)) {
    return empty
  }
  const repositories: Record<string, RepositoryScanState> = {}
  for (const [id, raw] of Object.entries(value.repositories)) {
    if (!isRecord(raw)) continue
    const state = raw.kind === 'pack' ? readPackState(id, raw) : raw.kind === 'plugin' ? readPluginState(id, raw) : null
    if (state !== null) repositories[id] = state
  }
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    topic,
    searchWindows: validWindows(value.searchWindows),
    repositories,
  }
}

async function discoverRepositories(
  client: MarketplaceGitHubReader,
  topic: string,
  previousWindows: readonly GitHubSearchWindow[],
  scanEnd: string,
): Promise<{ repositories: GitHubRepository[]; windows: GitHubSearchWindow[] }> {
  const requested = previousWindows.length === 0
    ? [{ start: SEARCH_EPOCH, end: scanEnd }]
    : [...previousWindows]
  const lastEnd = requested.at(-1)?.end ?? SEARCH_EPOCH
  if (lastEnd < scanEnd) requested.push({ start: lastEnd, end: scanEnd })
  const repositories = new Map<string, GitHubRepository>()
  const windows: GitHubSearchWindow[] = []
  for (const window of requested) {
    const result = await scanWindow(client, topic, window)
    windows.push(...result.windows)
    for (const repository of result.repositories) repositories.set(repository.id, repository)
  }
  return {
    repositories: [...repositories.values()].sort((left, right) => left.id.localeCompare(right.id)),
    windows,
  }
}

/**
 * Prove that every install target exists at the pinned commit. One recursive
 * tree call answers for the whole package; giant truncated trees fall back to
 * per-file reads. A commit id is immutable, so a positive answer stays true
 * for as long as the pin does.
 */
async function targetsExistAtCommit(
  client: MarketplaceGitHubReader,
  fullName: string,
  commitSha: string,
  targets: readonly string[],
): Promise<boolean> {
  const tree = await client.getTreePaths(fullName, commitSha)
  if (!tree.truncated) return targets.every(target => tree.paths.has(target))
  for (const target of targets) {
    const result = await client.getContent(fullName, target, commitSha, null)
    if (result.status !== 'ok') return false
  }
  return true
}

async function validateRepository(
  client: MarketplaceGitHubReader,
  repository: GitHubRepository,
  previous: PluginScanState | undefined,
  indexedAt: string,
  commitSha: string | null,
): Promise<PluginScanState> {
  const firstSeenAt = previous?.entry.firstSeenAt ?? indexedAt
  if (repository.archived) {
    const metadata = previous === undefined
      ? emptyMetadata(repository, null)
      : packageMetadataFromEntry(previous.entry)
    return {
      kind: 'plugin',
      repositoryId: repository.id,
      pushedAt: repository.pushedAt,
      validatorVersion: MARKETPLACE_SCANNER_VERSION,
      packageEtag: previous?.packageEtag ?? null,
      documentEtag: previous?.documentEtag ?? null,
      exportFileTargets: previous?.exportFileTargets ?? [],
      patchFileTargets: previous?.patchFileTargets ?? [],
      patchFileTargetsKnown: previous?.patchFileTargetsKnown ?? false,
      oneClickFileTargets: previous?.oneClickFileTargets ?? [],
      oneClickEvidence: previous?.oneClickEvidence ?? false,
      entry: makeEntry(repository, commitSha, metadata, 'repository-archived', firstSeenAt, indexedAt),
    }
  }

  // A scanner-version change means the rules changed: replay validation on
  // fresh content. Reusing ETags here would carry the old rules' verdicts
  // forward behind 304s without ever re-parsing the files.
  const reusable = previous !== undefined && previous.validatorVersion === MARKETPLACE_SCANNER_VERSION
  const manifest = await client.getContent(
    repository.fullName,
    'package.json',
    commitSha ?? repository.defaultBranch,
    reusable ? previous?.packageEtag ?? null : null,
  )
  let metadata: PackageMetadata
  if (manifest.status === 'not-found') {
    metadata = emptyMetadata(repository, 'package-json-missing')
  } else if (manifest.status === 'not-modified') {
    if (previous === undefined) throw new Error(`GitHub returned 304 without state for ${repository.fullName}/package.json`)
    metadata = packageMetadataFromEntry(previous.entry)
  } else {
    metadata = packageMetadata(manifest.text, repository)
  }
  const packageEtag = manifest.etag
  if (metadata.earlyFailure !== null) {
    return {
      kind: 'plugin',
      repositoryId: repository.id,
      pushedAt: repository.pushedAt,
      validatorVersion: MARKETPLACE_SCANNER_VERSION,
      packageEtag,
      documentEtag: null,
      exportFileTargets: [],
      patchFileTargets: [],
      patchFileTargetsKnown: false,
      oneClickFileTargets: [],
      oneClickEvidence: false,
      entry: makeEntry(repository, commitSha, metadata, metadata.earlyFailure, firstSeenAt, indexedAt),
    }
  }
  if (metadata.patchPath === null) throw new Error(`validated patch path disappeared for ${repository.fullName}`)
  const patch = await client.getContent(
    repository.fullName,
    metadata.patchPath,
    commitSha ?? repository.defaultBranch,
    reusable && previous?.entry.source.patchPath === metadata.patchPath ? previous?.documentEtag ?? null : null,
  )
  let code: MarketplaceValidationCode
  if (patch.status === 'not-found') code = 'patch-missing'
  else if (patch.status === 'not-modified') {
    if (previous === undefined || previous.entry.source.patchPath !== metadata.patchPath) {
      throw new Error(`GitHub returned 304 without patch state for ${repository.fullName}`)
    }
    code = previous.entry.validation.code === 'valid-bundle' ? 'valid-bundle' : 'patch-invalid'
  } else code = patchDocumentIsValid(patch.text) ? 'valid-bundle' : 'patch-invalid'
  const exportFileTargets = manifest.status === 'not-modified'
    ? previous?.exportFileTargets ?? []
    : metadata.exportTargets ?? []
  const parsedPatchTargets = patch.status === 'ok' ? directPatchFileTargets(patch.text) : null
  const patchFileTargets = patch.status === 'not-modified'
    ? previous?.patchFileTargets ?? []
    : parsedPatchTargets ?? []
  const patchFileTargetsKnown = patch.status === 'not-modified'
    ? previous?.patchFileTargetsKnown ?? false
    : parsedPatchTargets !== null
  const targets = code === 'valid-bundle' && exportFileTargets.length > 0 && patchFileTargetsKnown
    ? uniqueSorted([...exportFileTargets, ...patchFileTargets, metadata.patchPath])
    : []
  // Existence at an immutable commit is stable, so a same-pin revalidation
  // under unchanged rules reuses the earlier proof instead of re-listing trees.
  let oneClickEvidence = false
  if (targets.length > 0 && commitSha !== null) {
    if (reusable && previous !== undefined
      && previous.entry.repository.commitSha === commitSha
      && previous.oneClickFileTargets.length === targets.length
      && previous.oneClickFileTargets.every((target, index) => target === targets[index])) {
      oneClickEvidence = previous.oneClickEvidence
    } else {
      oneClickEvidence = await targetsExistAtCommit(client, repository.fullName, commitSha, targets)
    }
  }
  return {
    kind: 'plugin',
    repositoryId: repository.id,
    pushedAt: repository.pushedAt,
    validatorVersion: MARKETPLACE_SCANNER_VERSION,
    packageEtag,
    documentEtag: patch.etag,
    exportFileTargets,
    patchFileTargets,
    patchFileTargetsKnown,
    oneClickFileTargets: targets,
    oneClickEvidence,
    entry: makeEntry(repository, commitSha, metadata, code, firstSeenAt, indexedAt, oneClickEvidence),
  }
}

/** Validate a double-tagged solution-pack repository against its dsh.pack.json. */
async function validatePackRepository(
  client: MarketplaceGitHubReader,
  repository: GitHubRepository,
  previous: PackScanState | undefined,
  indexedAt: string,
  commitSha: string | null,
): Promise<PackScanState> {
  const firstSeenAt = previous?.pack.firstSeenAt ?? indexedAt
  if (repository.archived) {
    const manifest = previous === undefined ? null : { name: previous.pack.name, description: previous.pack.description, items: previous.packItems }
    return {
      kind: 'pack',
      repositoryId: repository.id,
      pushedAt: repository.pushedAt,
      validatorVersion: MARKETPLACE_SCANNER_VERSION,
      documentEtag: previous?.documentEtag ?? null,
      packItems: previous?.packItems ?? [],
      pack: makePackEntry(repository, commitSha, manifest, 'repository-archived', firstSeenAt, indexedAt),
    }
  }
  const reusable = previous !== undefined && previous.validatorVersion === MARKETPLACE_SCANNER_VERSION
  const document = await client.getContent(
    repository.fullName,
    MARKETPLACE_PACK_MANIFEST_PATH,
    commitSha ?? repository.defaultBranch,
    reusable ? previous?.documentEtag ?? null : null,
  )
  let code: MarketplacePackValidationCode
  let manifest: PackManifest | null
  if (document.status === 'not-found') {
    code = 'pack-manifest-missing'
    manifest = null
  } else if (document.status === 'not-modified') {
    if (previous === undefined) throw new Error(`GitHub returned 304 without pack state for ${repository.fullName}`)
    code = previous.pack.validation.code
    manifest = { name: previous.pack.name, description: previous.pack.description, items: previous.packItems }
  } else {
    manifest = packManifest(document.text)
    code = manifest === null ? 'pack-manifest-invalid' : 'valid-pack'
  }
  return {
    kind: 'pack',
    repositoryId: repository.id,
    pushedAt: repository.pushedAt,
    validatorVersion: MARKETPLACE_SCANNER_VERSION,
    documentEtag: document.etag,
    packItems: manifest?.items ?? [],
    pack: makePackEntry(repository, commitSha, manifest, code, firstSeenAt, indexedAt),
  }
}

function failedPluginState(
  repository: GitHubRepository,
  previous: PluginScanState | undefined,
  indexedAt: string,
  commitSha: string | null,
): PluginScanState {
  const metadata = previous === undefined
    ? emptyMetadata(repository, null)
    : packageMetadataFromEntry(previous.entry)
  return {
    kind: 'plugin',
    repositoryId: repository.id,
    pushedAt: repository.pushedAt,
    validatorVersion: MARKETPLACE_SCANNER_VERSION,
    packageEtag: previous?.packageEtag ?? null,
    documentEtag: previous?.documentEtag ?? null,
    exportFileTargets: [],
    patchFileTargets: [],
    patchFileTargetsKnown: false,
    oneClickFileTargets: [],
    oneClickEvidence: false,
    entry: makeEntry(
      repository,
      commitSha,
      metadata,
      'github-request-failed',
      previous?.entry.firstSeenAt ?? indexedAt,
      indexedAt,
    ),
  }
}

function failedPackState(
  repository: GitHubRepository,
  previous: PackScanState | undefined,
  indexedAt: string,
  commitSha: string | null,
): PackScanState {
  return {
    kind: 'pack',
    repositoryId: repository.id,
    pushedAt: repository.pushedAt,
    validatorVersion: MARKETPLACE_SCANNER_VERSION,
    documentEtag: previous?.documentEtag ?? null,
    packItems: previous?.packItems ?? [],
    pack: makePackEntry(
      repository,
      commitSha,
      previous === undefined ? null : { name: previous.pack.name, description: previous.pack.description, items: previous.packItems },
      'github-request-failed',
      previous?.pack.firstSeenAt ?? indexedAt,
      indexedAt,
    ),
  }
}

type MissedOutcome =
  | { readonly kind: 'carried'; readonly repository: GitHubRepository }
  | { readonly kind: 'retained'; readonly state: RepositoryScanState }
  | { readonly kind: 'evicted' }

/**
 * Search is a discovery hint, not an authority: a repository GitHub Search
 * fails to return in one run must not silently vanish from the catalog.
 * Verify each missed repository by its stable id and evict only on proof —
 * deleted or made private (null), or the marketplace topic withdrawn. Live
 * repositories rejoin the normal validation pipeline, so a changed pushedAt
 * still revalidates and re-pins them. When verification itself fails, keep
 * the last-known-good state rather than punish the repository for our outage.
 */
async function recoverMissedRepositories(
  client: MarketplaceGitHubReader,
  topic: string,
  previous: MarketplaceScannerState,
  discovered: readonly GitHubRepository[],
): Promise<{ carried: GitHubRepository[]; retained: RepositoryScanState[] }> {
  const discoveredIds = new Set(discovered.map(repository => repository.id))
  const missed = Object.values(previous.repositories)
    .filter(state => !discoveredIds.has(state.repositoryId))
  const carried: GitHubRepository[] = []
  const retained: RepositoryScanState[] = []
  for (let offset = 0; offset < missed.length; offset += VALIDATION_CONCURRENCY) {
    const batch = missed.slice(offset, offset + VALIDATION_CONCURRENCY)
    const outcomes = await Promise.all(batch.map(async (state): Promise<MissedOutcome> => {
      try {
        const repository = await client.getRepositoryById(state.repositoryId)
        if (repository !== null && repository.topics.includes(topic)) return { kind: 'carried', repository }
        return { kind: 'evicted' }
      } catch {
        return { kind: 'retained', state }
      }
    }))
    for (const outcome of outcomes) {
      if (outcome.kind === 'carried') carried.push(outcome.repository)
      else if (outcome.kind === 'retained') retained.push(outcome.state)
    }
  }
  return { carried, retained }
}

/** The pack topic alone decides the branch: a pack repo is never bundle-validated. */
function kindFor(repository: GitHubRepository): RepositoryScanState['kind'] {
  return repository.topics.includes(MARKETPLACE_PACK_TOPIC) ? 'pack' : 'plugin'
}

function stateValidationStatus(state: RepositoryScanState): MarketplaceValidationStatus {
  return state.kind === 'pack' ? state.pack.validation.status : state.entry.validation.status
}

function stateArchived(state: RepositoryScanState): boolean {
  return state.kind === 'pack' ? state.pack.repository.archived : state.entry.repository.archived
}

/** Revalidate when the repository, the rules, or the repo's own kind changed. */
function mustRevalidate(
  kind: RepositoryScanState['kind'],
  repository: GitHubRepository,
  old: RepositoryScanState | undefined,
): boolean {
  return old === undefined
    || old.kind !== kind
    || old.pushedAt !== repository.pushedAt
    || old.validatorVersion !== MARKETPLACE_SCANNER_VERSION
    || stateValidationStatus(old) !== 'valid'
    || stateArchived(old) !== repository.archived
}

function refreshStateMetadata(repository: GitHubRepository, old: RepositoryScanState): RepositoryScanState {
  return old.kind === 'pack'
    ? { ...old, pack: refreshPackMetadata(repository, old.pack) }
    : { ...old, entry: refreshRepositoryMetadata(repository, old.entry) }
}

/** Discover, incrementally validate, retain missed known repositories, and atomically publish one complete snapshot. */
export async function runMarketplaceScan(options: ScanOptions): Promise<MarketplaceCatalogSnapshot> {
  const now = options.now?.() ?? new Date()
  const generatedAt = now.toISOString()
  const scanEnd = new Date(now.getTime() + 1).toISOString()
  const previous = await readState(options.statePath, options.topic)
  const discovered = await discoverRepositories(options.client, options.topic, previous.searchWindows, scanEnd)
  const recovered = await recoverMissedRepositories(options.client, options.topic, previous, discovered.repositories)
  const candidates = [...discovered.repositories, ...recovered.carried]
  let repositories: Record<string, RepositoryScanState> = {}
  for (const state of recovered.retained) repositories[state.repositoryId] = state
  const stale = candidates.filter(repository =>
    !repository.archived && mustRevalidate(kindFor(repository), repository, previous.repositories[repository.id]))
  let commits: Readonly<Record<string, string>> = {}
  try {
    commits = await options.client.resolveDefaultBranchCommits(stale)
  } catch {
    // Content validation can still produce an active, browseable entry when the
    // best-effort immutable-ref lookup is temporarily unavailable.
  }
  for (let offset = 0; offset < candidates.length; offset += VALIDATION_CONCURRENCY) {
    const batch = candidates.slice(offset, offset + VALIDATION_CONCURRENCY)
    const results = await Promise.all(batch.map(async (repository) => {
      const kind = kindFor(repository)
      const old = previous.repositories[repository.id]
      let state: RepositoryScanState
      if (!mustRevalidate(kind, repository, old)) {
        state = refreshStateMetadata(repository, old as RepositoryScanState)
      } else {
        try {
          state = kind === 'pack'
            ? await validatePackRepository(
              options.client,
              repository,
              old?.kind === 'pack' ? old : undefined,
              generatedAt,
              commits[repository.id] ?? null,
            )
            : await validateRepository(
              options.client,
              repository,
              old?.kind === 'plugin' ? old : undefined,
              generatedAt,
              commits[repository.id] ?? null,
            )
        } catch {
          state = kind === 'pack'
            ? failedPackState(repository, old?.kind === 'pack' ? old : undefined, generatedAt, commits[repository.id] ?? null)
            : failedPluginState(repository, old?.kind === 'plugin' ? old : undefined, generatedAt, commits[repository.id] ?? null)
        }
      }
      return [repository.id, state] as const
    }))
    for (const [id, state] of results) repositories[id] = state
  }
  // Pack item ids resolve against this run's full repository set, so a pack
  // reflects the catalog as published, not as of the pack's own revalidation.
  const pluginIdByFullName = new Map<string, string>()
  for (const state of Object.values(repositories)) {
    if (state.kind === 'plugin') pluginIdByFullName.set(state.entry.repository.fullName.toLowerCase(), state.repositoryId)
  }
  repositories = Object.fromEntries(Object.entries(repositories).map(([id, state]) => {
    if (state.kind !== 'pack' || state.packItems.length === 0) return [id, state]
    const items = state.packItems.map(fullName => ({
      fullName,
      repositoryId: pluginIdByFullName.get(fullName.toLowerCase()) ?? null,
    }))
    return [id, { ...state, pack: { ...state.pack, items } }]
  }))
  const allEntries = Object.values(repositories)
    .flatMap(state => state.kind === 'plugin' ? [state.entry] : [])
    .sort((left, right) => left.repository.fullName.localeCompare(right.repository.fullName))
  const allPacks = Object.values(repositories)
    .flatMap(state => state.kind === 'pack' ? [state.pack] : [])
    .sort((left, right) => left.repository.fullName.localeCompare(right.repository.fullName))
  const entries = allEntries.filter(entry => entry.validation.status === 'valid' && !entry.repository.archived)
  const packs = allPacks.filter(pack => pack.validation.status === 'valid' && !pack.repository.archived)
  const rejectedEntries = allEntries.filter(entry => entry.validation.status !== 'valid' || entry.repository.archived)
  const rejectedPacks = allPacks.filter(pack => pack.validation.status !== 'valid' || pack.repository.archived)
  const catalog = sealMarketplaceCatalog({
    schemaVersion: 1,
    generatedAt,
    scannerVersion: MARKETPLACE_SCANNER_VERSION,
    topic: options.topic,
    integrity: { algorithm: 'sha256', digest: '' },
    summary: {
      entryCount: entries.length,
      invalidEntryCount: 0,
      packCount: packs.length,
    },
    entries,
    packs,
  })
  parseMarketplaceCatalogText(JSON.stringify(catalog))
  const rejected = sealMarketplaceCatalog({
    schemaVersion: 1,
    generatedAt,
    scannerVersion: MARKETPLACE_SCANNER_VERSION,
    topic: options.topic,
    integrity: { algorithm: 'sha256', digest: '' },
    summary: {
      entryCount: rejectedEntries.length,
      invalidEntryCount: rejectedEntries.filter(entry => entry.validation.status !== 'valid').length,
      packCount: rejectedPacks.length,
    },
    entries: rejectedEntries,
    packs: rejectedPacks,
  })
  parseMarketplaceCatalogText(JSON.stringify(rejected))
  const state: MarketplaceScannerState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    topic: options.topic,
    searchWindows: discovered.windows,
    repositories,
  }
  await writeFileAtomic(options.rejectedPath, `${JSON.stringify(rejected)}\n`, { mode: 0o644, dirMode: 0o755 })
  await writeFileAtomic(options.outputPath, `${JSON.stringify(catalog)}\n`, { mode: 0o644, dirMode: 0o755 })
  await writeFileAtomic(options.statePath, `${JSON.stringify(state)}\n`, { mode: 0o600, dirMode: 0o700 })
  return catalog
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      output: { type: 'string', default: 'website/public/plugin-marketplace/catalog-v1.json' },
      rejected: { type: 'string', default: '.cache/plugin-marketplace/rejected-v1.json' },
      state: { type: 'string', default: '.cache/plugin-marketplace/scanner-state-v1.json' },
      topic: { type: 'string', default: DEFAULT_MARKETPLACE_TOPIC },
    },
  })
  const token = process.env.GITHUB_TOKEN ?? ''
  const catalog = await runMarketplaceScan({
    client: new GitHubMarketplaceClient({ token }),
    topic: values.topic,
    outputPath: resolve(values.output),
    rejectedPath: resolve(values.rejected),
    statePath: resolve(values.state),
  })
  process.stdout.write(`Published ${String(catalog.summary.entryCount)} marketplace entries.\n`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
