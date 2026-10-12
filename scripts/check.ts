// Sanity-check parsing + categorization: node scripts/check.ts data/*.xlsx
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { buildModel, placeOf } from '../src/lib/analytics.ts'
import { seedConfig } from '../src/lib/config.ts'
import { mergeTransactions, parseWorkbook } from '../src/lib/parsers/index.ts'

const results = process.argv.slice(2).map((p) => {
  const b = readFileSync(p)
  return parseWorkbook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), basename(p))
})
for (const f of results.flatMap((r) => r.files)) console.log('FILE', f.path, f.statementMonth, f.rows, 'stated', f.statedTotal, 'parsed', f.parsedTotal.toFixed(2))
results.flatMap((r) => r.warnings).forEach((w) => console.warn('WARN', w))

const txs = mergeTransactions(results.map((r) => r.transactions))
const config = seedConfig(txs)
const m = buildModel(txs, config)
console.log('transactions', txs.length, 'rules', config.rules.length, `(${config.rules.filter((r) => r.match === 'is').length} "is")`)
console.table(Object.fromEntries(m.months.map((mo) => [mo, m.totals[mo].toFixed(2)])))
console.log('uncategorized:', [...new Set(m.txs.filter((t) => t.category === 'uncategorized').map((t) => t.merchant))].join(' | '))
for (const r of m.recurring) console.log('REC', r.merchant, r.category, 'every', r.cadence, 'monthly', r.monthly.toFixed(0))
for (const t of m.trips) console.log('TRIP', placeOf(t.currency), t.start, t.end, t.total.toFixed(0))
