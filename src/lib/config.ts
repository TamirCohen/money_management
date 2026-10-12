import type { Category, Config, Transaction } from './types.ts'

/** Colors: the validated 8-slot categorical palette first, then muted extras. */
export const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948', '#3fa7b5', '#b07a4f', '#8a9a3a', '#6b7a90', '#a58e7a', '#9aa0a6']

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'dining', name: 'Dining', color: '#eb6834' },
  { id: 'coffee', name: 'Coffee & Bakery', color: '#b07a4f' },
  { id: 'groceries', name: 'Groceries', color: '#1baf7a' },
  { id: 'transport', name: 'Transport', color: '#2a78d6' },
  { id: 'housing', name: 'Housing & Utilities', color: '#4a3aa7' },
  { id: 'phone', name: 'Phone & Internet', color: '#3fa7b5' },
  { id: 'subscriptions', name: 'Subscriptions', color: '#e87ba4' },
  { id: 'health', name: 'Health & Fitness', color: '#008300' },
  { id: 'shopping', name: 'Shopping', color: '#e34948' },
  { id: 'entertainment', name: 'Entertainment', color: '#eda100' },
  { id: 'travel', name: 'Travel', color: '#8a9a3a' },
  { id: 'insurance', name: 'Insurance', color: '#6b7a90' },
  { id: 'transfers', name: 'Transfers', color: '#9aa0a6' },
  { id: 'other', name: 'Other', color: '#a58e7a' },
  { id: 'excluded', name: 'Excluded', color: '#cfcfca', excluded: true },
]

const baseConfig = (): Config => ({
  version: 2,
  monthBasis: 'billing',
  categories: DEFAULT_CATEGORIES,
  rules: [],
  transactionOverrides: [],
  manual: [],
  income: [],
  assets: [],
  netWorthHistory: [],
  recurringOverrides: {},
})

/** First run: default categories, no rules. Rules are added by you (in the app or the file). */
export function seedConfig(_txs: Transaction[]): Config {
  return baseConfig()
}

/** Accept whatever is on disk (older versions, hand edits) and fill in missing fields. */
export function normalizeConfig(raw: Record<string, unknown>, txs: Transaction[]): Config {
  if (raw.version === 2) return { ...baseConfig(), ...(raw as Partial<Config>) } as Config
  // v1: overrides were { merchantKey: category }
  const seeded = seedConfig(txs)
  const overrides = Object.entries((raw.overrides as Record<string, string>) ?? {}).map(([value, category]) => ({ match: 'is' as const, value, category }))
  return {
    ...seeded,
    rules: [...overrides, ...seeded.rules],
    manual: (raw.manual as Config['manual']) ?? [],
    income: (raw.income as Config['income']) ?? [],
    assets: (raw.assets as Config['assets']) ?? [],
    netWorthHistory: (raw.netWorthHistory as Config['netWorthHistory']) ?? [],
    recurringOverrides: (raw.recurringOverrides as Config['recurringOverrides']) ?? {},
  }
}

/** Pretty JSON for hand editing: one line per category / rule / item, nested objects inline. */
export function formatConfig(config: Config): string {
  const fields = Object.entries(config).map(([k, v]) => {
    const value = Array.isArray(v)
      ? v.length
        ? `[\n${v.map((x) => `    ${JSON.stringify(x)}`).join(',\n')}\n  ]`
        : '[]'
      : JSON.stringify(v)
    return `  ${JSON.stringify(k)}: ${value}`
  })
  return `{\n${fields.join(',\n')}\n}\n`
}
