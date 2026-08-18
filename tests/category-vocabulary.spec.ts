import { describe, expect, it } from 'vitest'
import { en, zh } from '../src/client/locales.ts'
import {
  MARKETPLACE_CATEGORY_VOCABULARY,
  marketplaceCategoryLocaleEntries,
  marketplaceFieldMatchesWord,
  marketplaceTextsMatchQuery,
} from '../src/category-vocabulary.ts'

describe('category vocabulary', () => {
  it('keeps Settings chip copy identical to the Host vocabulary', () => {
    const chinese = marketplaceCategoryLocaleEntries('zh')
    const english = marketplaceCategoryLocaleEntries('en')
    for (const item of MARKETPLACE_CATEGORY_VOCABULARY) {
      const key = `category.${item.slug}` as const
      expect(zh[key]).toBe(chinese[key])
      expect(en[key]).toBe(english[key])
    }
  })

  it('matches ASCII queries on word boundaries and CJK as substrings', () => {
    expect(marketplaceFieldMatchesWord('A build kit', 'ui')).toBe(false)
    expect(marketplaceFieldMatchesWord('dsh-ui-kit', 'ui')).toBe(true)
    expect(marketplaceFieldMatchesWord('DSH 本机安全审计', '安全')).toBe(true)
    expect(marketplaceFieldMatchesWord('DSH 本机安全审计', '安')).toBe(false)
  })

  it('treats Discover pack chip labels as a hit for every pack', () => {
    const fields = ['DSH Essentials', 'w2112515', 'w2112515/dsh-essentials-pack', 'A curated starter set']
    expect(marketplaceTextsMatchQuery(fields, '整合方案', { packs: true })).toBe(true)
    expect(marketplaceTextsMatchQuery(fields, 'solution packs', { packs: true })).toBe(true)
    expect(marketplaceTextsMatchQuery(fields, '整合 missing', { packs: true })).toBe(false)
    expect(marketplaceTextsMatchQuery(fields, 'essentials')).toBe(true)
  })
})
