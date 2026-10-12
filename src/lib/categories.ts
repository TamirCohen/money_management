import type { Category, Config, Rule, Transaction } from './types.ts'

export const UNCATEGORIZED: Category = { id: 'uncategorized', name: 'Uncategorized', color: '#b4b7bd' }

export const merchantKey = (merchant: string) => merchant.toLowerCase().replace(/\s+/g, ' ').trim()

export const slug = (name: string) =>
  merchantKey(name).replace(/[^a-z0-9֐-׿]+/g, '-').replace(/^-|-$/g, '') || `c${Date.now()}`

export interface Match {
  category: string
  rule: Rule | null
}

/** Builds the categorize function from the config's rules. Unknown category ids fall back to Uncategorized. */
export function makeCategorizer(config: Config): (t: Transaction) => Match {
  const known = new Set(config.categories.map((c) => c.id))
  const exact = new Map<string, Rule>()
  const ordered: { rule: Rule; test: (key: string) => boolean }[] = []
  for (const rule of config.rules) {
    if (!known.has(rule.category) || !rule.value) continue
    if (rule.match === 'is') {
      if (!exact.has(merchantKey(rule.value))) exact.set(merchantKey(rule.value), rule)
    } else if (rule.match === 'contains') {
      const v = merchantKey(rule.value)
      ordered.push({ rule, test: (k) => k.includes(v) })
    } else {
      try {
        const re = new RegExp(rule.value, 'i')
        ordered.push({ rule, test: (k) => re.test(k) })
      } catch {
        /* invalid pattern: skipped, flagged in Settings */
      }
    }
  }
  return (t) => {
    if (t.presetCategory) return { category: known.has(t.presetCategory) ? t.presetCategory : UNCATEGORIZED.id, rule: null }
    const key = merchantKey(t.merchant)
    const hit = exact.get(key) ?? ordered.find((o) => o.test(key))?.rule
    return hit ? { category: hit.category, rule: hit } : { category: UNCATEGORIZED.id, rule: null }
  }
}

export const ruleLabel = (r: Rule) => `${r.match} “${r.value}”`
