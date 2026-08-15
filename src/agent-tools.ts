/**
 * Agent-facing surface of the marketplace: four tools the DSH agent can call.
 *
 * Trust contract (identical to the WebUI):
 * - search/detail/manual-guide are read-only.
 * - marketplace_install runs the SAME plan→execute pipeline as the WebUI and is
 *   additionally gated by a `tools/pre-execute` ask guard, so every install is
 *   approved by a human, once, and consent is never persisted.
 * - Script-gated entries are refused: verbatim script review stays in the WebUI.
 * - Manual entries are never executed by the marketplace; the guide tool only
 *   fetches the repository's own instructions for the agent to follow with its
 *   ordinary shell tools under the session's existing permission mode.
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { detailMarketplaceEntry, queryMarketplaceCatalog } from './catalog-query.ts'
import type { MarketplaceProfileOperations } from './profile-operations.ts'
import type {
  MarketplaceCatalogEntry,
  MarketplaceCatalogView,
  MarketplaceOperationCapabilities,
  MarketplaceRatingCounts,
} from './types.ts'

export interface MarketplaceAgentToolsDeps {
  readonly catalog: () => MarketplaceCatalogView
  readonly operations: MarketplaceProfileOperations
  readonly capabilities: MarketplaceOperationCapabilities
}

const SEARCH_LIMIT = 10
const GUIDE_MAX_CHARS = 2000
const GUIDE_FETCH_TIMEOUT_MS = 10_000

const CATEGORY_VALUES = ['theme', 'memory', 'usage', 'skill', 'security', 'channel', 'ui', 'tool', 'provider', 'uncategorized'] as const
const SORT_VALUES = ['recommended', 'stars', 'recently-updated', 'recently-added'] as const

type SearchSort = (typeof SORT_VALUES)[number]

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback
}

/** Verdict is shown only at 10+ total votes, matching the WebUI rating chip. */
export function formatAgentRating(rating: MarketplaceRatingCounts | null): string {
  if (rating === null) return 'no vote channel yet'
  const total = rating.up + rating.down
  if (total === 0) return 'no votes yet'
  if (total < 10) return `insufficient votes (${total}/10) — no verdict`
  const percent = Math.round((rating.up / total) * 100)
  const recentTotal = rating.upRecent + rating.downRecent
  const recent = recentTotal > 0 ? `, last 90 days ${Math.round((rating.upRecent / recentTotal) * 100)}% of ${recentTotal}` : ''
  return `${percent}% positive of ${total} votes${recent}`
}

function installabilityLabel(entry: MarketplaceCatalogEntry): string {
  return entry.installability
}

function findEntry(view: MarketplaceCatalogView, repositoryId: string): MarketplaceCatalogEntry | null {
  return view.catalog?.entries.find(entry => entry.repositoryId === repositoryId) ?? null
}

function catalogUnavailable() {
  return { available: false as const, message: 'The marketplace catalog is not loaded yet; retry in a few seconds.' }
}

/** Extract install-relevant README sections; falls back to the document head. */
export function extractInstallGuide(markdown: string, maxChars = GUIDE_MAX_CHARS): string {
  const sections = markdown.split(/^(?=#{1,3}\s)/m)
  const wanted = sections.filter(section => /^#{1,3}\s.*(install|setup|getting started|usage|quickstart|安装|使用|快速开始)/i.test(section))
  const picked = wanted.length > 0 ? wanted.join('\n') : markdown.slice(0, maxChars)
  const trimmed = picked.trim()
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}\n… (truncated)` : trimmed
}

async function fetchReadme(fullName: string, signal: AbortSignal): Promise<string | null> {
  for (const name of ['README.md', 'readme.md', 'README.zh-CN.md']) {
    try {
      const response = await fetch(`https://raw.githubusercontent.com/${fullName}/HEAD/${name}`, { signal, redirect: 'follow' })
      if (response.ok) return await response.text()
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
    }
  }
  return null
}

export function applyMarketplaceAgentTools(ctx: Context, deps: MarketplaceAgentToolsDeps): void {
  ctx.systemPrompt.section({
    name: 'tool:marketplace',
    order: 112,
    text: 'The marketplace_search, marketplace_detail, marketplace_install, and marketplace_manual_guide tools expose the DSH Plugin Marketplace catalog. Prefer marketplace_search over web_search when the user asks about DSH plugins. marketplace_install handles only catalog entries whose installability is "one-click-eligible"; every install asks the user for one-time approval and consent is never persisted. For "script-gated" entries, direct the user to Settings → Plugins → Marketplace to review the install scripts verbatim — never try to bypass that review. For "manual" entries, call marketplace_manual_guide and follow the returned instructions with your ordinary shell tools under the session permission mode. Installed plugins activate only after the user restarts dsh web — always say so.',
  })

  ctx.tools.register(defineTool({
    name: 'marketplace_search',
    description: 'Search the DSH Plugin Marketplace catalog. Returns compact rows (name, repository id, stars, category, installability, freshness, community rating) for discovered DSH plugins and solution packs. Read-only.',
    parameters: {
      query: { type: 'string', description: 'Optional free-text search over names, descriptions, authors, and keywords.' },
      category: { type: 'string', description: `Optional category filter: ${CATEGORY_VALUES.join(' | ')}.` },
      installability: { type: 'string', description: 'Optional filter: one-click-eligible | manual.' },
      sort: { type: 'string', description: `Optional sort: ${SORT_VALUES.join(' | ')} (default recommended).` },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          available: { type: 'boolean', required: true },
          message: { type: 'string' },
          total: { type: 'number' },
          applied: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                repositoryId: { type: 'string', required: true },
                repository: { type: 'string', required: true },
                stars: { type: 'number', required: true },
                category: { type: 'string', required: true },
                installability: { type: 'string', required: true },
                freshnessPercent: { type: 'number', required: true },
                rating: { type: 'string', required: true },
                description: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const result = value as { available: boolean; message?: string; total?: number; items?: Array<{ name: string; repositoryId: string; repository: string; stars: number; category: string; installability: string; freshnessPercent: number; rating: string; description: string }> }
        if (!result.available) return [{ type: 'text', text: result.message ?? 'Catalog unavailable.' }]
        const lines = (result.items ?? []).map(item => `- ${item.name} (${item.repository}) [id ${item.repositoryId}] — ★${item.stars}, ${item.category}, ${item.installability}, freshness ${item.freshnessPercent}%, ${item.rating}. ${item.description}`)
        return [{ type: 'text', text: `${result.total ?? 0} matches; showing ${lines.length}:\n${lines.join('\n')}` }]
      },
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const view = deps.catalog()
      if (view.catalog === null) return catalogUnavailable()
      const query = asString((args as Record<string, unknown>).query) ?? ''
      const category = normalizeEnum((args as Record<string, unknown>).category, CATEGORY_VALUES, 'all' as const)
      const installability = normalizeEnum((args as Record<string, unknown>).installability, ['one-click-eligible', 'manual'] as const, 'all' as const)
      const sort: SearchSort = normalizeEnum((args as Record<string, unknown>).sort, SORT_VALUES, 'recommended')
      const list = queryMarketplaceCatalog(view, { query, category, installability, sort, page: 1 })
      return {
        available: true as const,
        total: list.total,
        applied: `query=${JSON.stringify(query)} category=${category} installability=${installability} sort=${sort}`,
        items: list.items.slice(0, SEARCH_LIMIT).map(item => ({
          name: item.name,
          repositoryId: item.repositoryId,
          repository: item.repositoryFullName,
          stars: item.stars,
          category: item.category ?? 'uncategorized',
          installability: item.installability,
          freshnessPercent: Math.round(item.freshness * 100),
          rating: formatAgentRating(item.rating),
          description: (item.description ?? '').slice(0, 120),
        })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'marketplace_detail',
    description: 'Full marketplace evidence for one catalog entry: validation status, risk signals, installability, freshness, community rating, and current profile state. Read-only. Use the repositoryId from marketplace_search.',
    parameters: {
      repositoryId: { type: 'string', required: true, description: 'The catalog repositoryId of the plugin.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          found: { type: 'boolean', required: true },
          message: { type: 'string' },
          detail: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: String((value as { detail?: string; message?: string }).detail ?? (value as { message?: string }).message ?? '') }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const repositoryId = asString((args as Record<string, unknown>).repositoryId)
      if (repositoryId === null) return { found: false as const, message: 'repositoryId is required.' }
      const view = deps.catalog()
      if (view.catalog === null) return { found: false as const, message: catalogUnavailable().message }
      const response = detailMarketplaceEntry(view, repositoryId, deps.operations.snapshot().plugins)
      const entry = response.entry
      if (entry === null) return { found: false as const, message: `No catalog entry for repositoryId ${repositoryId}.` }
      const guidance = entry.installability === 'one-click-eligible'
        ? 'Installable via marketplace_install (the user approves once).'
        : entry.installScripts !== null
          ? 'Script-gated: install scripts must be reviewed verbatim in Settings → Plugins → Marketplace; agent install is refused by design.'
          : 'Manual install only: use marketplace_manual_guide and follow the repository instructions.'
      const detail = [
        `${entry.package.name} (${entry.repository.fullName}) [id ${entry.repositoryId}]`,
        entry.package.description ?? '',
        `Publisher ${entry.repository.fullName.split('/')[0]} · author ${entry.package.author ?? 'unknown'} · license ${entry.package.license ?? 'undeclared'} · ★${entry.stars}`,
        `Created ${entry.repositoryCreatedAt} · last push ${entry.lastCodePushAt} · first indexed ${entry.firstSeenAt}`,
        `Freshness ${response.freshness === null ? 'unknown' : `${Math.round(response.freshness * 100)}%`} · rating: ${formatAgentRating(response.rating)}`,
        `Validation ${entry.validation.status} · compatibility ${entry.compatibility} · installability ${installabilityLabel(entry)}`,
        `Risk signals: ${entry.riskSignals.length > 0 ? entry.riskSignals.join(', ') : 'none'}`,
        `Pinned source: ${entry.source.ref}`,
        `Profile state: ${response.state === null ? 'not installed' : response.state.state}`,
        response.voteUrl === null ? 'Vote channel pending.' : `Vote: ${response.voteUrl}`,
        `Repository: ${entry.repository.url}`,
        `Guidance: ${guidance}`,
      ].join('\n')
      return { found: true as const, detail }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'marketplace_install',
    description: 'Install a one-click-eligible marketplace plugin into the current DSH profile. Every call asks the user for one-time approval; script-gated and manual entries are refused. The plugin activates after the user restarts dsh web.',
    parameters: {
      repositoryId: { type: 'string', required: true, description: 'The catalog repositoryId of the plugin to install.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          installed: { type: 'boolean', required: true },
          code: { type: 'string', required: true },
          message: { type: 'string', required: true },
          requiresRestart: { type: 'boolean' },
          rollback: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: (value as { message: string }).message }],
    },
    async execute(args) {
      const repositoryId = asString((args as Record<string, unknown>).repositoryId)
      if (repositoryId === null) return { installed: false as const, code: 'request-invalid', message: 'repositoryId is required.' }
      if (!deps.capabilities.profileWritable || deps.capabilities.packageManager === 'unavailable') {
        return { installed: false as const, code: 'capabilities-unavailable', message: deps.capabilities.message ?? 'The Host cannot write this profile or no package manager is available; ask the user to open Settings → Plugins → Marketplace for recovery steps.' }
      }
      const plan = deps.operations.plan({ repositoryId, action: 'install' })
      if (plan.status !== 'ready' || plan.planId === null) {
        const why = plan.blockCode === 'not-one-click-eligible'
          ? 'This entry is not one-click-eligible. Script-gated entries must be reviewed verbatim by the user in Settings → Plugins → Marketplace; manual entries have no automatic path (use marketplace_manual_guide).'
          : `The plan was blocked: ${plan.blockCode ?? 'unknown'}.`
        return { installed: false as const, code: plan.blockCode ?? 'blocked', message: why }
      }
      const result = await deps.operations.execute({ planId: plan.planId })
      const succeeded = result.status === 'succeeded'
      return {
        installed: succeeded,
        code: result.code,
        rollback: result.rollback,
        requiresRestart: succeeded,
        message: succeeded
          ? `Installed ${result.packageName ?? repositoryId} into profile "${plan.profileName}". Tell the user to restart dsh web to activate it.`
          : `Install failed (${result.code}); rollback: ${result.rollback}.`,
      }
    },
  }))

  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name !== 'marketplace_install') return next()
    const repositoryId = asString((exec.arguments as Record<string, unknown>).repositoryId)
    const entry = repositoryId === null ? null : findEntry(deps.catalog(), repositoryId)
    const reason = entry === null
      ? `Approve installing marketplace entry ${repositoryId ?? '?'} into profile "${deps.capabilities.profileName}"? One-time approval; consent is never persisted.`
      : `Approve installing DSH plugin "${entry.package.name}" (${entry.repository.fullName}) into profile "${deps.capabilities.profileName}" at pinned commit ${(entry.repository.commitSha ?? 'unknown').slice(0, 10)}? Risk signals: ${entry.riskSignals.length > 0 ? entry.riskSignals.join(', ') : 'none'}. One-time approval; consent is never persisted.`
    return { kind: 'ask' as const, reason }
  })

  ctx.tools.register(defineTool({
    name: 'marketplace_manual_guide',
    description: 'Fetch the install/usage sections of a manual-install marketplace entry\'s README so you can follow them with your ordinary shell tools. Read-only; the marketplace never executes manual installs.',
    parameters: {
      repositoryId: { type: 'string', required: true, description: 'The catalog repositoryId of the plugin.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          found: { type: 'boolean', required: true },
          message: { type: 'string' },
          repositoryUrl: { type: 'string' },
          guide: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const result = value as { found: boolean; message?: string; guide?: string }
        return [{ type: 'text', text: result.found ? result.guide ?? '' : result.message ?? 'Not found.' }]
      },
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const repositoryId = asString((args as Record<string, unknown>).repositoryId)
      if (repositoryId === null) return { found: false as const, message: 'repositoryId is required.' }
      const entry = findEntry(deps.catalog(), repositoryId)
      if (entry === null) return { found: false as const, message: `No catalog entry for repositoryId ${repositoryId}.` }
      if (entry.installability !== 'manual') {
        return { found: false as const, repositoryUrl: entry.repository.url, message: `${entry.repository.fullName} is "${entry.installability}", not manual — use marketplace_install (one-click) or the WebUI script review (script-gated).` }
      }
      const signal = AbortSignal.any([exec.signal, AbortSignal.timeout(GUIDE_FETCH_TIMEOUT_MS)])
      const readme = await fetchReadme(entry.repository.fullName, signal)
      if (readme === null) {
        return { found: false as const, repositoryUrl: entry.repository.url, message: `Could not fetch a README for ${entry.repository.fullName}. Read the repository directly: ${entry.repository.url}` }
      }
      return {
        found: true as const,
        repositoryUrl: entry.repository.url,
        guide: `Install/usage excerpt from ${entry.repository.fullName}'s README (source: ${entry.repository.url}):\n\n${extractInstallGuide(readme)}`,
      }
    },
  }))
}
