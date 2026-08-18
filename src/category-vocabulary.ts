/** Single Host-owned vocabulary for category chips, classification, and search. */

import type { MarketplaceCategory } from './types.ts'

export interface MarketplaceCategoryVocabulary {
  readonly slug: MarketplaceCategory | 'uncategorized'
  readonly zh: string
  readonly en: string
  readonly tokens: readonly string[]
  readonly needles: readonly string[]
  readonly aliases: readonly string[]
}

/** Fixed taxonomy priority: the first matching category wins, one chip per row. */
export const MARKETPLACE_CATEGORY_PRIORITY: readonly MarketplaceCategory[] = [
  'theme', 'memory', 'usage', 'skill', 'security', 'channel', 'ui', 'tool', 'provider',
]

/**
 * Conservative fallback tokens are English whole words. CJK never survives
 * [a-z0-9] tokenization, so `needles` match as substrings. Chip labels in both
 * languages are search aliases; extra `aliases` cover shorter UI synonyms.
 */
export const MARKETPLACE_CATEGORY_VOCABULARY: readonly MarketplaceCategoryVocabulary[] = [
  {
    slug: 'theme', zh: '主题', en: 'Themes',
    tokens: ['theme', 'themes', 'skin', 'skins', 'color-scheme', 'colour-scheme', 'appearance'],
    needles: ['主题'], aliases: [],
  },
  {
    slug: 'memory', zh: '记忆', en: 'Memory',
    tokens: ['memory', 'memories', 'rag', 'embedding', 'embeddings', 'vector', 'vectors', 'knowledge', 'recall'],
    needles: ['记忆'], aliases: [],
  },
  {
    slug: 'usage', zh: '用量', en: 'Usage',
    tokens: ['usage', 'balance', 'billing', 'quota', 'cost', 'costs', 'metering', 'spend'],
    needles: ['用量'], aliases: [],
  },
  {
    slug: 'skill', zh: '技能', en: 'Skills',
    tokens: ['skill', 'skills'],
    needles: ['技能'], aliases: [],
  },
  {
    slug: 'security', zh: '安全', en: 'Security',
    tokens: ['security', 'audit', 'audits', 'approval', 'approvals', 'sandbox', 'permission', 'permissions', 'policy'],
    needles: ['安全', '沙箱', '审计', '鉴权'], aliases: [],
  },
  {
    slug: 'channel', zh: '消息渠道', en: 'Channels',
    tokens: ['feishu', 'lark', 'telegram', 'discord', 'wechat', 'dingtalk', 'slack', 'qq', 'qqbot'],
    needles: ['消息渠道'], aliases: ['渠道'],
  },
  {
    slug: 'ui', zh: '界面', en: 'UI',
    tokens: ['ui', 'tui', 'gui', 'webui', 'sidebar', 'dashboard', 'panel', 'interface', 'layout', 'pet', 'pets', 'widget', 'widgets'],
    needles: ['界面'], aliases: [],
  },
  {
    slug: 'tool', zh: '工具', en: 'Tools',
    tokens: ['tool', 'tools', 'mcp', 'ocr', 'vision', 'terminal', 'cli', 'automation', 'notify', 'notification',
      'workflow', 'workflows', 'scheduler', 'session', 'sessions'],
    needles: ['工具'], aliases: [],
  },
  {
    slug: 'provider', zh: '模型接入', en: 'Providers',
    tokens: ['provider', 'providers', 'openrouter', 'oauth'],
    needles: ['模型接入'], aliases: [],
  },
  {
    slug: 'uncategorized', zh: '未分类', en: 'Uncategorized',
    tokens: [], needles: [], aliases: [],
  },
]

/** Labels on the Discover packs chip; packs are not a plugin category. */
export const MARKETPLACE_PACK_QUERY_ALIASES: readonly string[] = [
  '整合方案', '整合', 'solution packs', 'packs',
]

export function marketplaceCategoryLocaleEntries(
  locale: 'zh' | 'en',
): Record<`category.${MarketplaceCategory | 'uncategorized'}`, string> {
  return Object.fromEntries(
    MARKETPLACE_CATEGORY_VOCABULARY.map(item => [`category.${item.slug}`, item[locale]]),
  ) as Record<`category.${MarketplaceCategory | 'uncategorized'}`, string>
}

export function marketplaceQueryWords(query: string): readonly string[] {
  return query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
}

const ASCII_WORD = /^[a-z0-9][a-z0-9-]*$/u

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/** ASCII queries use word boundaries so `ui` does not hit `build`. CJK stays substring. */
export function marketplaceFieldMatchesWord(field: string, word: string): boolean {
  const normalized = field.toLocaleLowerCase()
  if (normalized === word) return true
  if (ASCII_WORD.test(word)) {
    return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(word)}(?:$|[^a-z0-9])`, 'u').test(normalized)
  }
  return normalized.includes(word)
}

function vocabularyAliases(item: MarketplaceCategoryVocabulary): readonly string[] {
  return [item.slug, item.zh, item.en.toLocaleLowerCase(), ...item.aliases]
}

export function marketplaceQueryCategoryAlias(word: string): MarketplaceCategory | 'uncategorized' | null {
  for (const item of MARKETPLACE_CATEGORY_VOCABULARY) {
    for (const alias of vocabularyAliases(item)) {
      if (word === alias) return item.slug
      if (!ASCII_WORD.test(alias) && word.includes(alias)) return item.slug
    }
  }
  return null
}

export function marketplaceQueryIsPackAlias(word: string): boolean {
  return (MARKETPLACE_PACK_QUERY_ALIASES as readonly string[]).includes(word)
}

/**
 * AND-match of query words against free-text fields.
 * Pack browse may treat the Discover packs chip labels as a hit for every pack.
 */
export function marketplaceTextsMatchQuery(
  texts: readonly string[],
  query: string,
  options: { readonly packs?: boolean } = {},
): boolean {
  const trimmed = query.trim().toLocaleLowerCase()
  if (trimmed.length === 0) return true
  if (options.packs === true && marketplaceQueryIsPackAlias(trimmed)) return true
  const words = marketplaceQueryWords(query)
  return words.every(word => {
    if (options.packs === true && marketplaceQueryIsPackAlias(word)) return true
    return texts.some(text => marketplaceFieldMatchesWord(text, word))
  })
}
