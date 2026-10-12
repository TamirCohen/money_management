import * as XLSX from 'xlsx'
import type { ParseResult, Parser, Transaction } from '../types.ts'
import { isracard } from './isracard.ts'

/** Add new providers (Max, Cal, bank exports...) here. */
const PARSERS: Parser[] = [isracard]

export function parseWorkbook(data: ArrayBuffer, source: string): ParseResult {
  const wb = XLSX.read(data, { type: 'array' })
  const out: ParseResult = { transactions: [], warnings: [], files: [] }
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null })
    const parser = PARSERS.find((p) => p.detect(rows))
    if (!parser) continue
    const r = parser.parse(rows, source)
    out.transactions.push(...r.transactions)
    out.warnings.push(...r.warnings)
    out.files.push(...r.files)
  }
  if (!out.transactions.length && !out.warnings.length) out.warnings.push(`${source}: unrecognized format`)
  return out
}

/** Merge results from many files, dropping duplicates (same file twice, overlapping exports). */
export function mergeTransactions(lists: Transaction[][]): Transaction[] {
  const seen = new Map<string, Transaction>()
  for (const list of lists) for (const t of list) if (!seen.has(t.id)) seen.set(t.id, t)
  return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date))
}
