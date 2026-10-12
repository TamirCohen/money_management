import type { Category, Config, Rule, Transaction } from './types.ts'

export const UNCATEGORIZED: Category = { id: 'uncategorized', name: 'Uncategorized', color: '#b4b7bd' }

export const merchantKey = (merchant: string) => merchant.toLowerCase().replace(/\s+/g, ' ').trim()

export const slug = (name: string) =>
  merchantKey(name).replace(/[^a-z0-9\u0590-\u05ff]+/g, '-').replace(/^-|-$/g, '') || `c${Date.now()}`

export interface Match {
  category: string
  rule: Rule | null
  /** Category was set for this transaction only */
  override: boolean
  /** The category is marked as not counted */
  excluded: boolean
}

/** Builds the categorize function from the config's rules. Unknown category ids fall back to Uncategorized. */
export function makeCategorizer(config: Config): (t: Transaction) => Match {
  const known = new Set(config.categories.map((c) => c.id))
  const excludedIds = new Set(config.categories.filter((c) => c.excluded).map((c) => c.id))
  const overrides = new Map(config.transactionOverrides.filter((o) => known.has(o.category)).map((o) => [o.id, o.category]))
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
  const done = (category: string, rule: Rule | null, override = false): Match => ({ category, rule, override, excluded: excludedIds.has(category) })
  return (t) => {
    if (t.presetCategory) return done(known.has(t.presetCategory) ? t.presetCategory : UNCATEGORIZED.id, null)
    const own = overrides.get(t.id)
    if (own) return done(own, null, true)
    const key = merchantKey(t.merchant)
    const hit = exact.get(key) ?? ordered.find((o) => o.test(key))?.rule
    return hit ? done(hit.category, hit) : done(UNCATEGORIZED.id, null)
  }
}

export const ruleLabel = (r: Rule) => `${r.match} “${r.value}”`
