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
  MarketplaceRiskSignal,
  MarketplaceValidationCode,
} from '../src/types.ts'
import * as yaml from 'js-yaml'
import {
  GitHubMarketplaceClient,
  type GitHubContentResult,
  type GitHubRepository,
  type GitHubSearchPage,
  type GitHubSearchWindow,
} from './plugin-marketplace-github.ts'

export const MARKETPLACE_SCANNER_VERSION = '2'
export const DEFAULT_MARKETPLACE_TOPIC = 'dsh-plugin'
const VALIDATION_CONCURRENCY = 12
const STATE_SCHEMA_VERSION = 1
const SEARCH_EPOCH = '1970-01-01T00:00:00.000Z'

/** Narrow seam used by deterministic scanner tests. */
export interface MarketplaceGitHubReader {
  searchRepositories(topic: string, window: GitHubSearchWindow, page: number): Promise<GitHubSearchPage>
  getContent(fullName: string, path: string, ref: string, etag: string | null): Promise<GitHubContentResult>
  resolveDefaultBranchCommits(repositories: readonly GitHubRepository[]): Promise<Readonly<Record<string, string>>>
}

interface RepositoryScanState {
  readonly pushedAt: string
  readonly validatorVersion: string
  readonly packageEtag: string | null
  readonly patchEtag: string | null
  readonly entry: MarketplaceCatalogEntry
}

interface MarketplaceScannerState {
  readonly schemaVersion: 1
  readonly topic: string
  readonly searchWindows: readonly GitHubSearchWindow[]
  readonly repositories: Readonly<Record<string, RepositoryScanState>>
}

interface ScanOptions {
  readonly client: MarketplaceGitHubReader
  readonly topic: string
  readonly outputPath: string
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

function normalizePatchPath(value: string): string | null {
  if (value.includes('\\') || posix.isAbsolute(value)) return null
  const normalized = posix.normalize(value.replace(/^\.\//, ''))
  if (normalized.length === 0 || normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null
  return normalized
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

function packageMetadata(text: string, repository: GitHubRepository): PackageMetadata {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return {
      name: null,
      version: null,
      description: repository.description,
      author: repository.owner,
      license: repository.license,
      keywords: [],
      patchPath: null,
      riskSignals: [],
      earlyFailure: 'package-json-invalid',
    }
  }
  if (!isRecord(value)) {
    return {
      name: null,
      version: null,
      description: repository.description,
      author: repository.owner,
      license: repository.license,
      keywords: [],
      patchPath: null,
      riskSignals: [],
      earlyFailure: 'package-json-invalid',
    }
  }
  const risks: MarketplaceRiskSignal[] = []
  if (isRecord(value.scripts)) {
    const names = Object.keys(value.scripts)
    if (names.some(name => ['preinstall', 'install', 'postinstall', 'prepare'].includes(name))) risks.push('lifecycle-script')
    if (names.includes('build')) risks.push('build-script')
  }
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
    riskSignals: uniqueSorted(risks) as MarketplaceRiskSignal[],
    earlyFailure,
  }
}

function packageMetadataFromEntry(entry: MarketplaceCatalogEntry): PackageMetadata {
  return {
    ...entry.package,
    keywords: entry.keywords,
    patchPath: entry.source.patchPath,
    riskSignals: entry.riskSignals.filter(signal => signal === 'lifecycle-script' || signal === 'build-script'),
    earlyFailure: entry.source.patchPath === null && entry.validation.status === 'invalid'
      ? entry.validation.code
      : null,
  }
}

function patchDocumentIsValid(text: string): boolean {
  let value: unknown
  try {
    value = yaml.load(text)
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

function installabilityFor(
  status: MarketplaceCatalogEntry['validation']['status'],
  commitSha: string | null,
  metadata: PackageMetadata,
): MarketplaceCatalogEntry['installability'] {
  if (status !== 'valid') return 'browse-only'
  if (commitSha === null || metadata.name === null || metadata.version === null
    || metadata.riskSignals.includes('lifecycle-script') || metadata.riskSignals.includes('build-script')) {
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
    installability: installabilityFor(status, commitSha, metadata),
    riskSignals: risks,
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
      },
      entries: [value as unknown as MarketplaceCatalogEntry],
    })
    return parseMarketplaceCatalogText(JSON.stringify(candidate)).entries[0] ?? null
  } catch {
    return null
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
    if (!isRecord(raw)
      || typeof raw.pushedAt !== 'string'
      || typeof raw.validatorVersion !== 'string'
      || !(typeof raw.packageEtag === 'string' || raw.packageEtag === null)
      || !(typeof raw.patchEtag === 'string' || raw.patchEtag === null)) continue
    const entry = parsePreviousEntry(raw.entry)
    if (entry === null || entry.repositoryId !== id) continue
    repositories[id] = {
      pushedAt: raw.pushedAt,
      validatorVersion: raw.validatorVersion,
      packageEtag: raw.packageEtag,
      patchEtag: raw.patchEtag,
      entry,
    }
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

async function validateRepository(
  client: MarketplaceGitHubReader,
  repository: GitHubRepository,
  previous: RepositoryScanState | undefined,
  indexedAt: string,
  commitSha: string | null,
): Promise<RepositoryScanState> {
  const firstSeenAt = previous?.entry.firstSeenAt ?? indexedAt
  if (repository.archived) {
    const metadata = previous === undefined
      ? {
        name: null,
        version: null,
        description: repository.description,
        author: repository.owner,
        license: repository.license,
        keywords: [],
        patchPath: null,
        riskSignals: [],
        earlyFailure: null,
      } satisfies PackageMetadata
      : packageMetadataFromEntry(previous.entry)
    return {
      pushedAt: repository.pushedAt,
      validatorVersion: MARKETPLACE_SCANNER_VERSION,
      packageEtag: previous?.packageEtag ?? null,
      patchEtag: previous?.patchEtag ?? null,
      entry: makeEntry(repository, commitSha, metadata, 'repository-archived', firstSeenAt, indexedAt),
    }
  }

  const manifest = await client.getContent(
    repository.fullName,
    'package.json',
    commitSha ?? repository.defaultBranch,
    previous?.packageEtag ?? null,
  )
  let metadata: PackageMetadata
  if (manifest.status === 'not-found') {
    metadata = {
      name: null,
      version: null,
      description: repository.description,
      author: repository.owner,
      license: repository.license,
      keywords: [],
      patchPath: null,
      riskSignals: [],
      earlyFailure: 'package-json-missing',
    }
  } else if (manifest.status === 'not-modified') {
    if (previous === undefined) throw new Error(`GitHub returned 304 without state for ${repository.fullName}/package.json`)
    metadata = packageMetadataFromEntry(previous.entry)
  } else {
    metadata = packageMetadata(manifest.text, repository)
  }
  const packageEtag = manifest.etag
  if (metadata.earlyFailure !== null) {
    return {
      pushedAt: repository.pushedAt,
      validatorVersion: MARKETPLACE_SCANNER_VERSION,
      packageEtag,
      patchEtag: null,
      entry: makeEntry(repository, commitSha, metadata, metadata.earlyFailure, firstSeenAt, indexedAt),
    }
  }
  if (metadata.patchPath === null) throw new Error(`validated patch path disappeared for ${repository.fullName}`)
  const patch = await client.getContent(
    repository.fullName,
    metadata.patchPath,
    commitSha ?? repository.defaultBranch,
    previous?.entry.source.patchPath === metadata.patchPath ? previous.patchEtag : null,
  )
  let code: MarketplaceValidationCode
  if (patch.status === 'not-found') code = 'patch-missing'
  else if (patch.status === 'not-modified') {
    if (previous === undefined || previous.entry.source.patchPath !== metadata.patchPath) {
      throw new Error(`GitHub returned 304 without patch state for ${repository.fullName}`)
    }
    code = previous.entry.validation.code === 'valid-bundle' ? 'valid-bundle' : 'patch-invalid'
  } else code = patchDocumentIsValid(patch.text) ? 'valid-bundle' : 'patch-invalid'
  return {
    pushedAt: repository.pushedAt,
    validatorVersion: MARKETPLACE_SCANNER_VERSION,
    packageEtag,
    patchEtag: patch.etag,
    entry: makeEntry(repository, commitSha, metadata, code, firstSeenAt, indexedAt),
  }
}

/** Discover, incrementally validate, and atomically publish one complete snapshot. */
export async function runMarketplaceScan(options: ScanOptions): Promise<MarketplaceCatalogSnapshot> {
  const now = options.now?.() ?? new Date()
  const generatedAt = now.toISOString()
  const scanEnd = new Date(now.getTime() + 1).toISOString()
  const previous = await readState(options.statePath, options.topic)
  const discovered = await discoverRepositories(options.client, options.topic, previous.searchWindows, scanEnd)
  const repositories: Record<string, RepositoryScanState> = {}
  const validation = discovered.repositories.filter((repository) => {
    const old = previous.repositories[repository.id]
    return !repository.archived && (old === undefined
      || old.pushedAt !== repository.pushedAt
      || old.validatorVersion !== MARKETPLACE_SCANNER_VERSION
      || old.entry.validation.status !== 'valid'
      || old.entry.repository.archived !== repository.archived)
  })
  const commits = await options.client.resolveDefaultBranchCommits(validation)
  for (let offset = 0; offset < discovered.repositories.length; offset += VALIDATION_CONCURRENCY) {
    const batch = discovered.repositories.slice(offset, offset + VALIDATION_CONCURRENCY)
    const results = await Promise.all(batch.map(async (repository) => {
      const old = previous.repositories[repository.id]
      const mustValidate = old === undefined
        || old.pushedAt !== repository.pushedAt
        || old.validatorVersion !== MARKETPLACE_SCANNER_VERSION
        || old.entry.validation.status !== 'valid'
        || old.entry.repository.archived !== repository.archived
      const state = mustValidate
        ? await validateRepository(options.client, repository, old, generatedAt, commits[repository.id] ?? null)
        : { ...old, entry: refreshRepositoryMetadata(repository, old.entry) }
      return [repository.id, state] as const
    }))
    for (const [id, state] of results) repositories[id] = state
  }
  const entries = Object.values(repositories)
    .map(state => state.entry)
    .sort((left, right) => left.repository.fullName.localeCompare(right.repository.fullName))
  const catalog = sealMarketplaceCatalog({
    schemaVersion: 1,
    generatedAt,
    scannerVersion: MARKETPLACE_SCANNER_VERSION,
    topic: options.topic,
    integrity: { algorithm: 'sha256', digest: '' },
    summary: {
      entryCount: entries.length,
      invalidEntryCount: entries.filter(entry => entry.validation.status !== 'valid').length,
    },
    entries,
  })
  parseMarketplaceCatalogText(JSON.stringify(catalog))
  const state: MarketplaceScannerState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    topic: options.topic,
    searchWindows: discovered.windows,
    repositories,
  }
  await writeFileAtomic(options.outputPath, `${JSON.stringify(catalog)}\n`, { mode: 0o644, dirMode: 0o755 })
  await writeFileAtomic(options.statePath, `${JSON.stringify(state)}\n`, { mode: 0o600, dirMode: 0o700 })
  return catalog
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      output: { type: 'string', default: 'website/public/plugin-marketplace/catalog-v1.json' },
      state: { type: 'string', default: '.cache/plugin-marketplace/scanner-state-v1.json' },
      topic: { type: 'string', default: DEFAULT_MARKETPLACE_TOPIC },
    },
  })
  const token = process.env.GITHUB_TOKEN ?? ''
  const catalog = await runMarketplaceScan({
    client: new GitHubMarketplaceClient({ token }),
    topic: values.topic,
    outputPath: resolve(values.output),
    statePath: resolve(values.state),
  })
  process.stdout.write(`Published ${String(catalog.summary.entryCount)} marketplace entries.\n`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
