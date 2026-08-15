import { describe, expect, it, vi } from 'vitest'
import { GitHubMarketplaceClient } from './plugin-marketplace-github.ts'
import type { GitHubRepository } from './plugin-marketplace-github.ts'

const window = {
  start: '1970-01-01T00:00:00.000Z',
  end: '2026-08-15T00:00:00.000Z',
}

describe('GitHubMarketplaceClient', () => {
  it('honors rate signals and the independent Search pacing budget', async () => {
    let now = 0
    const sleeps: number[] = []
    const requests: Headers[] = []
    let requestCount = 0
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Headers(init?.headers))
      requestCount += 1
      if (requestCount === 1) return new Response(null, { status: 429, headers: { 'retry-after': '1' } })
      return new Response(JSON.stringify({
        total_count: 0,
        incomplete_results: false,
        items: [],
      }))
    })
    const fetchImpl = fetchMock as unknown as typeof fetch
    const client = new GitHubMarketplaceClient({
      token: 'project-token',
      fetchImpl,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms)
        now += ms
      },
    })
    await client.searchRepositories('deepseek-harness-plugin', window, 1)
    await client.searchRepositories('deepseek-harness-plugin', window, 1)
    expect(sleeps).toContain(1_000)
    expect(sleeps.reduce((total, delay) => total + delay, 0)).toBe(2_100)
    expect(requests[0]?.get('authorization')).toBe('Bearer project-token')
  })

  it('sends conditional content requests and preserves a 304 response', async () => {
    let requestHeaders: Headers | undefined
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestHeaders = new Headers(init?.headers)
      return new Response(null, {
        status: 304,
        headers: { etag: '"manifest"' },
      })
    })
    const fetchImpl = fetchMock as unknown as typeof fetch
    const client = new GitHubMarketplaceClient({ token: 'project-token', fetchImpl })
    await expect(client.getContent('owner/repo', 'package.json', 'main', '"manifest"'))
      .resolves.toEqual({ status: 'not-modified', etag: '"manifest"' })
    expect(requestHeaders?.get('if-none-match')).toBe('"manifest"')
    expect(requestHeaders?.get('authorization')).toBeNull()
  })

  it('resolves immutable default-branch commits in bounded GraphQL batches', async () => {
    const requests: RequestInit[] = []
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init ?? {})
      if (typeof init?.body !== 'string') throw new TypeError('expected a JSON request body')
      const query = JSON.parse(init.body) as { query: string }
      const aliases = [...query.query.matchAll(/r(\d+): repository/g)].map(match => Number(match[1]))
      return new Response(JSON.stringify({
        data: Object.fromEntries(aliases.map(index => [
          `r${String(index)}`,
          { defaultBranchRef: { target: { oid: String(index + 1).padStart(40, 'a') } } },
        ])),
      }))
    })
    const repositories: GitHubRepository[] = Array.from({ length: 51 }, (_, index) => ({
      id: String(index + 1),
      fullName: `owner/repo-${String(index + 1)}`,
      url: `https://github.com/owner/repo-${String(index + 1)}`,
      defaultBranch: 'main',
      archived: false,
      description: null,
      stars: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      pushedAt: '2026-01-02T00:00:00.000Z',
      topics: [],
      owner: 'owner',
      license: null,
    }))
    const client = new GitHubMarketplaceClient({
      token: 'project-token',
      fetchImpl: fetchMock,
    })
    const commits = await client.resolveDefaultBranchCommits(repositories)
    expect(requests).toHaveLength(2)
    expect(requests[0]?.method).toBe('POST')
    expect(new Headers(requests[0]?.headers).get('authorization')).toBe('Bearer project-token')
    expect(commits['1']).toMatch(/^[0-9a-f]{40}$/)
    expect(Object.keys(commits)).toHaveLength(51)
  })
})
