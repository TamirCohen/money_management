import { makeCategorizer, merchantKey } from './categories.ts'
import type { Config, Rule, Transaction } from './types.ts'

/** Transaction enriched with derived fields used by the views. */
export interface Tx extends Transaction {
  month: string
  category: string
  /** The rule that set the category (null = manual item, per-transaction override or uncategorized) */
  rule: Rule | null
  override: boolean
  /** In a not-counted category: listed, but left out of every total */
  excluded: boolean
  key: string
  recurring: boolean
}

export const monthOf = (t: Transaction, basis: Config['monthBasis']) => (basis === 'billing' ? t.billingMonth : t.date.slice(0, 7))

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const monthDiff = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m)
  return out
}

const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Expand manual recurring items (rent, etc.) into synthetic transactions for the given months. */
function expandManual(config: Config, months: string[]): Transaction[] {
  const out: Transaction[] = []
  for (const item of config.manual) {
    for (const m of months) {
      if (m < item.start || (item.end && m > item.end)) continue
      if (monthDiff(item.start, m) % Math.max(1, item.every) !== 0) continue
      out.push({
        id: `manual-${item.id}-${m}`,
        provider: 'manual',
        account: '',
        date: `${m}-01`,
        billingMonth: m,
        merchant: item.name,
        amount: item.amount,
        originalAmount: item.amount,
        originalCurrency: '₪',
        foreign: false,
        abroad: false,
        standingOrder: true,
        notes: '',
        source: 'manual',
        manual: true,
        presetCategory: item.category,
      })
    }
  }
  return out
}

export interface RecurringItem {
  key: string
  merchant: string
  category: string
  /** Typical gap between charges, in months */
  cadence: number
  /** Normalized monthly cost */
  monthly: number
  last: number
  previous: number | null
  /** Relative change of the latest charge vs the typical one */
  change: number
  stable: boolean
  months: string[]
  manual: boolean
  history: { month: string; amount: number }[]
}

/**
 * A merchant is recurring if it is a standing order seen in 2+ months,
 * or it shows up in 3+ distinct months with a similar amount.
 */
function detectRecurring(txs: Tx[], config: Config): RecurringItem[] {
  const groups = new Map<string, Tx[]>()
  for (const t of txs) {
    if (t.amount <= 0) continue
    const g = groups.get(t.key) ?? []
    g.push(t)
    groups.set(t.key, g)
  }
  const out: RecurringItem[] = []
  for (const [key, list] of groups) {
    const perMonth = new Map<string, number>()
    for (const t of list) perMonth.set(t.month, (perMonth.get(t.month) ?? 0) + t.amount)
    const months = [...perMonth.keys()].sort()
    const amounts = months.map((m) => perMonth.get(m)!)
    const med = median(amounts)
    const spread = amounts.length ? Math.max(...amounts.map((a) => Math.abs(a - med) / (med || 1))) : 1
    const stable = spread < 0.25
    const manual = list.some((t) => t.manual)
    const standing = list.some((t) => t.standingOrder)
    const forced = config.recurringOverrides[key]
    const auto = manual || (standing && months.length >= 2) || (months.length >= 3 && stable && list.length <= months.length * 2)
    if (forced === false || (!auto && forced !== true)) continue

    const gaps = months.slice(1).map((m, i) => monthDiff(months[i], m))
    const cadence = Math.max(1, Math.round(median(gaps)) || 1)
    // "Typical" charge excludes the latest one so a price change shows up
    const last = amounts[amounts.length - 1]
    const prior = amounts.slice(0, -1)
    const typical = prior.length ? median(prior) : last
    out.push({
      key,
      merchant: list[0].merchant,
      category: list[0].category,
      cadence,
      monthly: (stable ? med : amounts.reduce((a, b) => a + b, 0) / amounts.length) / cadence,
      last,
      previous: prior.length ? prior[prior.length - 1] : null,
      change: typical ? (last - typical) / typical : 0,
      stable,
      months,
      manual,
      history: months.map((m) => ({ month: m, amount: perMonth.get(m)! })),
    })
  }
  return out.sort((a, b) => b.monthly - a.monthly)
}

export interface Model {
  txs: Tx[]
  months: string[]
  totals: Record<string, number>
  fixed: Record<string, number>
  byCategory: Record<string, Record<string, number>>
  /** Sum of not-counted transactions per month (shown, never added to totals) */
  excludedTotals: Record<string, number>
  income: Record<string, number>
  recurring: RecurringItem[]
  /** Unusually large charges vs the category's typical charge */
  outliers: Set<string>
}

export function buildModel(raw: Transaction[], config: Config): Model {
  const basis = config.monthBasis
  const categorize = makeCategorizer(config)
  const realMonths = [...new Set(raw.map((t) => monthOf(t, basis)))].sort()
  const months = realMonths.length ? monthRange(realMonths[0], realMonths[realMonths.length - 1]) : []
  const all = [...raw, ...expandManual(config, months)]

  const pre: Tx[] = all.map((t) => ({ ...t, month: monthOf(t, basis), ...categorize(t), key: merchantKey(t.merchant), recurring: false }))
  const recurring = detectRecurring(pre.filter((t) => !t.excluded), config)
  const recurringKeys = new Set(recurring.map((r) => r.key))
  const txs = pre.map((t) => ({ ...t, recurring: recurringKeys.has(t.key) })).sort((a, b) => b.date.localeCompare(a.date))

  const totals: Record<string, number> = {}
  const fixed: Record<string, number> = {}
  const byCategory: Record<string, Record<string, number>> = {}
  const excludedTotals: Record<string, number> = {}
  for (const m of months) {
    totals[m] = 0
    excludedTotals[m] = 0
    fixed[m] = 0
    byCategory[m] = {}
  }
  for (const t of txs) {
    if (t.excluded) {
      excludedTotals[t.month] += t.amount
      continue
    }
    totals[t.month] += t.amount
    if (t.recurring) fixed[t.month] += t.amount
    byCategory[t.month][t.category] = (byCategory[t.month][t.category] ?? 0) + t.amount
  }

  const income: Record<string, number> = {}
  for (const m of months) {
    income[m] = config.income.filter((i) => m >= i.start && (!i.end || m <= i.end)).reduce((s, i) => s + i.amount, 0)
  }

  const outliers = new Set<string>()
  const perCat = new Map<string, number[]>()
  for (const t of txs) if (!t.manual && !t.excluded && t.amount > 0) perCat.set(t.category, [...(perCat.get(t.category) ?? []), t.amount])
  for (const t of txs) {
    if (t.manual || t.excluded || t.recurring || t.category === 'transfers') continue
    const med = median(perCat.get(t.category) ?? [])
    if (t.amount >= 400 && t.amount >= med * 5) outliers.add(t.id)
  }

  return { txs, months, totals, fixed, byCategory, excludedTotals, income, recurring, outliers }
}
