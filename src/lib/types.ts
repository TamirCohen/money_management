/** Provider-agnostic transaction. Every parser produces these. */
export interface Transaction {
  id: string
  provider: string
  account: string
  /** Purchase date, YYYY-MM-DD */
  date: string
  /** Statement month the charge was billed in, YYYY-MM */
  billingMonth: string
  merchant: string
  /** Charged amount in ILS (negative = refund) */
  amount: number
  originalAmount: number
  originalCurrency: string
  /** Charged by a foreign merchant (online or in person) */
  foreign: boolean
  /** Paid in person abroad (used to detect trips) */
  abroad: boolean
  standingOrder: boolean
  installment?: { n: number; of: number }
  notes: string
  source: string
  /** Synthetic entry from a manual recurring item (rent etc.) */
  manual?: boolean
  /** Category fixed at the source (manual items) */
  presetCategory?: string
}

/** What a parser learned about one statement file, shown in Settings → Files. */
export interface FileInfo {
  path: string
  provider: string
  statementMonth: string
  rows: number
  /** Total printed on the statement, if any */
  statedTotal: number | null
  /** Sum of the parsed rows that the stated total covers */
  parsedTotal: number
  warnings: string[]
}

export interface ParseResult {
  transactions: Transaction[]
  warnings: string[]
  files: FileInfo[]
}

export interface Parser {
  id: string
  /** Returns true if this parser understands the sheet rows */
  detect(rows: unknown[][]): boolean
  parse(rows: unknown[][], source: string): ParseResult
}

export interface Category {
  id: string
  name: string
  color: string
}

export type MatchType = 'is' | 'contains' | 'matches'

/** Merchant name → category. "is" rules win; otherwise the first matching rule in list order. */
export interface Rule {
  match: MatchType
  value: string
  category: string
}

export interface ManualItem {
  id: string
  name: string
  amount: number
  category: string
  /** Every N months */
  every: number
  /** YYYY-MM */
  start: string
  end?: string
}

export interface IncomeItem {
  id: string
  name: string
  /** Monthly net amount */
  amount: number
  start: string
  end?: string
}

export type AssetKind = 'cash' | 'stocks' | 'pension' | 'other'

export interface Asset {
  id: string
  name: string
  kind: AssetKind
  value: number
}

export type MonthBasis = 'billing' | 'purchase'

/** Everything the app knows besides the statements. Stored as expenses.config.json next to them. */
export interface Config {
  version: 2
  /** Group by statement month or by purchase date */
  monthBasis: MonthBasis
  categories: Category[]
  rules: Rule[]
  manual: ManualItem[]
  income: IncomeItem[]
  assets: Asset[]
  netWorthHistory: { date: string; total: number }[]
  /** merchant key → forced recurring (true) / not recurring (false) */
  recurringOverrides: Record<string, boolean>
}
