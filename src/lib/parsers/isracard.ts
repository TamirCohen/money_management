import type { Parser, ParseResult, Transaction } from '../types.ts'

const HEBREW_MONTHS: Record<string, number> = {
  ינואר: 1, פברואר: 2, מרץ: 3, אפריל: 4, מאי: 5, יוני: 6,
  יולי: 7, אוגוסט: 8, ספטמבר: 9, אוקטובר: 10, נובמבר: 11, דצמבר: 12,
}

const COL = {
  date: 'תאריך רכישה',
  merchant: 'שם בית עסק',
  amount: 'סכום עסקה',
  currency: 'מטבע עסקה',
  charged: 'סכום חיוב',
  voucher: "מס' שובר",
  notes: 'פירוט נוסף',
}

const str = (v: unknown) => (v == null ? '' : String(v)).replace(/[‪-‮ ]/g, ' ').trim()

const num = (v: unknown): number => {
  if (typeof v === 'number') return v
  const n = parseFloat(str(v).replace(/[₪,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "09.10.26" | Date | Excel serial -> YYYY-MM-DD */
function toISO(v: unknown): string | null {
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  if (typeof v === 'number' && v > 30000) {
    const d = new Date(Math.round((v - 25569) * 864e5))
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const m = str(v).match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/)
  if (!m) return null
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
  return `${y}-${pad(+m[2])}-${pad(+m[1])}`
}

const isHeaderRow = (row: unknown[]) => row.some((c) => str(c) === COL.date) && row.some((c) => str(c) === COL.merchant)

export const isracard: Parser = {
  id: 'isracard',

  detect(rows) {
    return rows.slice(0, 15).some(isHeaderRow) && rows.slice(0, 5).some((r) => r.some((c) => str(c).includes('פירוט עסקאות')))
  },

  parse(rows, source): ParseResult {
    const warnings: string[] = []
    const transactions: Transaction[] = []

    // Statement month from the title row: "אוקטובר 2026"
    let billingMonth = ''
    for (const row of rows.slice(0, 5)) {
      for (const c of row) {
        const m = str(c).match(/^(\S+)\s+(\d{4})$/)
        if (m && HEBREW_MONTHS[m[1]]) billingMonth = `${m[2]}-${pad(HEBREW_MONTHS[m[1]])}`
      }
    }
    // Card last 4: "פלטינה מסטרקארד - 1234"
    let account = ''
    for (const row of rows.slice(0, 5)) {
      const m = str(row[0]).match(/(\d{4})$/)
      if (m) account = m[1]
    }
    if (!billingMonth) warnings.push(`${source}: statement month not found`)

    let cols: Record<keyof typeof COL, number> | null = null
    let section: 'regular' | 'offcycle' | 'future' = 'regular'
    let regularSum = 0
    let footerTotal: number | null = null

    for (const row of rows) {
      const first = str(row[0])
      if (first.startsWith('עסקאות בחיוב מחוץ למועד')) section = 'offcycle'
      else if (first.startsWith('עסקאות בחיוב עתידי')) section = 'future'
      else if (first.startsWith('עסקאות למועד חיוב')) section = 'regular'

      if (row.some((c) => str(c).startsWith('סה"כ לחיוב החודש'))) {
        footerTotal = num(row.slice(2).find((c) => num(c) !== 0))
        continue
      }
      if (isHeaderRow(row)) {
        const idx = (name: string) => row.findIndex((c) => str(c) === name)
        cols = Object.fromEntries(Object.entries(COL).map(([k, name]) => [k, idx(name)])) as Record<keyof typeof COL, number>
        continue
      }
      if (!cols || section === 'future') continue
      const date = toISO(row[cols.date])
      if (!date) continue

      const notes = str(row[cols.notes])
      const amount = num(row[cols.charged])
      const merchant = str(row[cols.merchant]).replace(/\s+/g, ' ')
      const voucher = str(row[cols.voucher])
      const inst = notes.match(/תשלום\s*(\d+)\s*מתוך\s*(\d+)/)
      if (section === 'regular') regularSum += amount

      transactions.push({
        id: `isracard-${account}-${voucher}-${date}-${amount}`,
        provider: 'isracard',
        account,
        date,
        billingMonth,
        merchant,
        amount,
        originalAmount: num(row[cols.amount]),
        originalCurrency: str(row[cols.currency]) || '₪',
        foreign: notes.includes('חו"ל'),
        abroad: notes.includes('בוצע בחו"ל'),
        standingOrder: notes.includes('הוראת קבע'),
        installment: inst ? { n: +inst[1], of: +inst[2] } : undefined,
        notes,
        source,
      })
    }

    if (footerTotal != null && Math.abs(footerTotal - regularSum) > 0.05) {
      warnings.push(`${source}: rows sum to ${regularSum.toFixed(2)} but statement total is ${footerTotal.toFixed(2)}`)
    }
    if (!transactions.length) warnings.push(`${source}: no transactions found`)
    return {
      transactions,
      warnings,
      files: [{ path: source, provider: 'isracard', statementMonth: billingMonth, rows: transactions.length, statedTotal: footerTotal, parsedTotal: regularSum, warnings }],
    }
  },
}
