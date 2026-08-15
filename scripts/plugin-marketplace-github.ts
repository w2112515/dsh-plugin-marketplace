/** Bounded GitHub REST client used only by the central marketplace scanner. */

const GITHUB_API = 'https://api.github.com'
const GITHUB_RAW = 'https://raw.githubusercontent.com'
const SEARCH_INTERVAL_MS = 2_100
const MAX_RETRIES = 3
const MAX_RAW_BYTES = 1_000_000
const GRAPHQL_BATCH_SIZE = 50

/** Persisted half-open repository creation window. */
export interface GitHubSearchWindow {
  readonly start: string
  readonly end: string
}

/** Search metadata needed by the catalog; raw API objects do not cross this edge. */
export interface GitHubRepository {
  readonly id: string
  readonly fullName: string
  readonly url: string
  readonly defaultBranch: string
  readonly archived: boolean
  readonly description: string | null
  readonly stars: number
  readonly createdAt: string
  readonly pushedAt: string
  readonly topics: readonly string[]
  readonly owner: string
  readonly license: string | null
}

/** One search page with the completeness flag preserved. */
export interface GitHubSearchPage {
  readonly totalCount: number
  readonly incomplete: boolean
  readonly repositories: readonly GitHubRepository[]
}

/** Conditional content response. */
export type GitHubContentResult =
  | { readonly status: 'ok'; readonly etag: string | null; readonly text: string }
  | { readonly status: 'not-modified'; readonly etag: string | null }
  | { readonly status: 'not-found'; readonly etag: string | null }

/** Non-recoverable GitHub response after bounded rate-aware retries. */
export class GitHubRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'GitHubRequestError'
  }
}

export interface GitHubClientOptions {
  readonly token: string
  readonly fetchImpl?: typeof fetch
  readonly sleep?: (ms: number) => Promise<void>
  readonly now?: () => number
  readonly requestTimeoutMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new TypeError(`GitHub response is missing ${field}`)
  return value
}

function numberValue(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError(`GitHub response has an invalid ${field}`)
  }
  return value
}

function repositoryFromApi(value: unknown): GitHubRepository {
  if (!isRecord(value) || !isRecord(value.owner)) throw new TypeError('GitHub repository result is invalid')
  const license = value.license
  return {
    id: String(numberValue(value.id, 'repository id')),
    fullName: stringValue(value.full_name, 'repository full_name'),
    url: stringValue(value.html_url, 'repository html_url'),
    defaultBranch: stringValue(value.default_branch, 'repository default_branch'),
    archived: value.archived === true,
    description: typeof value.description === 'string' ? value.description : null,
    stars: numberValue(value.stargazers_count, 'repository stargazers_count'),
    createdAt: stringValue(value.created_at, 'repository created_at'),
    pushedAt: stringValue(value.pushed_at, 'repository pushed_at'),
    topics: Array.isArray(value.topics) ? value.topics.filter(topic => typeof topic === 'string') : [],
    owner: stringValue(value.owner.login, 'repository owner login'),
    license: isRecord(license) && typeof license.spdx_id === 'string' && license.spdx_id !== 'NOASSERTION'
      ? license.spdx_id
      : null,
  }
}

function rateDelay(response: Response, now: number): number | null {
  const retryAfter = response.headers.get('retry-after')
  if (retryAfter !== null && Number.isFinite(Number(retryAfter))) {
    return Math.max(1_000, Number(retryAfter) * 1_000)
  }
  if (response.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(response.headers.get('x-ratelimit-reset')) * 1_000
    if (Number.isFinite(reset)) return Math.max(1_000, reset - now + 1_000)
  }
  if (response.status === 403 || response.status === 429) return 60_000
  return null
}

/** Central project-identity client; it never exposes its token to a catalog or browser. */
export class GitHubMarketplaceClient {
  private readonly fetchImpl: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly now: () => number
  private readonly timeoutMs: number
  private lastSearchAt = Number.NEGATIVE_INFINITY

  constructor(private readonly options: GitHubClientOptions) {
    if (options.token.trim().length === 0) throw new TypeError('GITHUB_TOKEN is required for the marketplace scanner')
    this.fetchImpl = options.fetchImpl ?? fetch
    this.sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
    this.now = options.now ?? Date.now
    this.timeoutMs = options.requestTimeoutMs ?? 30_000
  }

  /** Search one page while respecting GitHub Search's independent minute budget. */
  async searchRepositories(topic: string, window: GitHubSearchWindow, page: number): Promise<GitHubSearchPage> {
    const start = Date.parse(window.start)
    const end = Date.parse(window.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new TypeError(`GitHub search window is invalid: ${window.start}..${window.end}`)
    }
    // GitHub accepts a single inclusive range qualifier. Using separate >= and
    // < qualifiers causes one side to be ignored and defeats recursive bisection.
    const inclusiveEnd = new Date(end - 1).toISOString()
    const elapsed = this.now() - this.lastSearchAt
    if (elapsed < SEARCH_INTERVAL_MS) await this.sleep(SEARCH_INTERVAL_MS - elapsed)
    this.lastSearchAt = this.now()
    const params = new URLSearchParams({
      q: `topic:${topic} created:${window.start}..${inclusiveEnd}`,
      per_page: '100',
      page: String(page),
      sort: 'updated',
      order: 'asc',
    })
    const response = await this.request(`/search/repositories?${params.toString()}`)
    const body: unknown = await response.json()
    if (!isRecord(body) || !Array.isArray(body.items)) throw new TypeError('GitHub repository search response is invalid')
    return {
      totalCount: numberValue(body.total_count, 'search total_count'),
      incomplete: body.incomplete_results === true,
      repositories: body.items.map(repositoryFromApi),
    }
  }

  /** Read root-relative repository content with ETag revalidation. */
  async getContent(fullName: string, path: string, ref: string, etag: string | null): Promise<GitHubContentResult> {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/')
    const response = await this.requestRaw(
      `${GITHUB_RAW}/${fullName}/${encodeURIComponent(ref)}/${encodedPath}`,
      etag === null ? undefined : { 'if-none-match': etag },
      [304, 404],
    )
    const nextEtag = response.headers.get('etag') ?? etag
    if (response.status === 304) return { status: 'not-modified', etag: nextEtag }
    if (response.status === 404) return { status: 'not-found', etag: nextEtag }
    return {
      status: 'ok',
      etag: nextEtag,
      text: await readBoundedRawText(response),
    }
  }

  /** Resolve immutable default-branch commit ids in bounded GraphQL batches. */
  async resolveDefaultBranchCommits(
    repositories: readonly GitHubRepository[],
  ): Promise<Readonly<Record<string, string>>> {
    const commits: Record<string, string> = {}
    for (let offset = 0; offset < repositories.length; offset += GRAPHQL_BATCH_SIZE) {
      const batch = repositories.slice(offset, offset + GRAPHQL_BATCH_SIZE)
      const selections = batch.map((repository, index) => {
        const [owner, name, ...rest] = repository.fullName.split('/')
        if (owner === undefined || name === undefined || rest.length > 0) {
          throw new TypeError(`GitHub repository name is invalid: ${repository.fullName}`)
        }
        return `r${String(index)}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { defaultBranchRef { target { ... on Commit { oid } } } }`
      })
      const response = await this.requestWithRetry(`${GITHUB_API}/graphql`, {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.options.token}`,
        'content-type': 'application/json',
        'user-agent': 'deepseek-harness-plugin-marketplace-scanner',
        'x-github-api-version': '2022-11-28',
      }, [], { method: 'POST', body: JSON.stringify({ query: `query { ${selections.join(' ')} }` }) })
      const body: unknown = await response.json()
      if (!isRecord(body) || !isRecord(body.data)) {
        throw new TypeError('GitHub GraphQL commit response is invalid')
      }
      for (const [index, repository] of batch.entries()) {
        const value = body.data[`r${String(index)}`]
        if (!isRecord(value) || !isRecord(value.defaultBranchRef)
          || !isRecord(value.defaultBranchRef.target)
          || typeof value.defaultBranchRef.target.oid !== 'string'
          || !/^[0-9a-f]{40}$/i.test(value.defaultBranchRef.target.oid)) {
          // Empty, deleted, or inaccessible repositories remain browse-only.
          // One missing alias must not discard valid neighbors in the batch.
          continue
        }
        commits[repository.id] = value.defaultBranchRef.target.oid.toLowerCase()
      }
    }
    return commits
  }

  private async request(path: string, extraHeaders?: Record<string, string>, accepted: readonly number[] = []): Promise<Response> {
    return this.requestWithRetry(`${GITHUB_API}${path}`, {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${this.options.token}`,
      'user-agent': 'deepseek-harness-plugin-marketplace-scanner',
      'x-github-api-version': '2022-11-28',
      ...extraHeaders,
    }, accepted)
  }

  private async requestRaw(url: string, extraHeaders?: Record<string, string>, accepted: readonly number[] = []): Promise<Response> {
    return this.requestWithRetry(url, {
      accept: 'application/octet-stream',
      'user-agent': 'deepseek-harness-plugin-marketplace-scanner',
      ...extraHeaders,
    }, accepted)
  }

  private async requestWithRetry(
    url: string,
    headers: Record<string, string>,
    accepted: readonly number[],
    init: Pick<RequestInit, 'method' | 'body'> = {},
  ): Promise<Response> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      let response: Response
      try {
        response = await this.fetchImpl(url, {
          ...init,
          headers,
          signal: AbortSignal.timeout(this.timeoutMs),
        })
      } catch (error) {
        if (attempt === MAX_RETRIES) throw error
        await this.sleep(1_000 * 2 ** attempt)
        continue
      }
      if (response.ok || accepted.includes(response.status)) return response
      const delay = rateDelay(response, this.now())
      if (delay !== null && attempt < MAX_RETRIES) {
        await response.body?.cancel()
        await this.sleep(delay)
        continue
      }
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await response.body?.cancel()
        await this.sleep(1_000 * 2 ** attempt)
        continue
      }
      await response.body?.cancel()
      throw new GitHubRequestError(response.status, `GitHub API returned HTTP ${String(response.status)}`)
    }
    throw new Error('unreachable GitHub request state')
  }
}

async function readBoundedRawText(response: Response): Promise<string> {
  const declared = response.headers.get('content-length')
  if (declared !== null && Number(declared) > MAX_RAW_BYTES) throw new TypeError('GitHub raw content exceeds 1 MB')
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_RAW_BYTES) {
        await reader.cancel()
        throw new TypeError('GitHub raw content exceeds 1 MB')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const content = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    content.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(content)
}
