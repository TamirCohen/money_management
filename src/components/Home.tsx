import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Model } from '../lib/analytics.ts'
import { href } from '../lib/route.ts'
import type { Category, Config } from '../lib/types.ts'
import { Dot, Icon, Stat, ils, kTick, monthLong, monthShort } from './ui.tsx'

interface Props {
  model: Model
  config: Config
  catOf: (id: string) => Category
  /** Categories with spending, largest average first */
  order: string[]
  /** Categories picked above the chart (from the URL); empty = total spending */
  selected: string[]
  /** Each month split into its N biggest categories + the rest (null = off) */
  top: number | null
  setConfig: (fn: (c: Config) => Config) => void
}

const go = (h: string) => (location.hash = h)
const TOP_DEFAULT = 5
const REST = '__rest'

type Row = { month: string; total: number } & Record<string, number | string>

function MonthTip({ active, payload, label, names, colors }: { active?: boolean; payload?: { payload: Row }[]; label?: string; names: (id: string) => string; colors: (id: string) => string }) {
  if (!active || !payload?.length || !label) return null
  const row = payload[0].payload
  // Same order as the bar, top segment first
  const parts = Object.keys(row).filter((k) => /^s\d+$/.test(k)).sort((a, b) => +b.slice(1) - +a.slice(1)).map((k) => ({ id: String(row[`${k}id`]), value: Number(row[k]) })).filter((p) => p.value > 0)
  return (
    <div className="tip">
      <div className="tip-title">{monthLong(label)}</div>
      <b>{ils(row.total)}</b>
      {parts.map((p) => (
        <div key={p.id} className="tip-row">
          <Dot color={colors(p.id)} /> {names(p.id)} <span className="tip-val">{ils(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function Home({ model, config, catOf, order, selected, top, setConfig }: Props) {
  const { months, totals, income, byCategory } = model
  const avgAll = months.reduce((s, m) => s + totals[m], 0) / Math.max(1, months.length)
  const recurringMonthly = model.recurring.reduce((s, r) => s + r.monthly, 0)
  const withIncome = months.filter((m) => income[m] > 0)
  const incomeSum = withIncome.reduce((s, m) => s + income[m], 0)
  // Only months with income count, so a salary added from some month on doesn't skew the average
  const savedSum = withIncome.reduce((s, m) => s + income[m] - totals[m], 0)
  const savedAvg = withIncome.length ? savedSum / withIncome.length : null
  const netWorth = config.assets.reduce((s, a) => s + a.value, 0)

  // Top mode: each month keeps its own 5 biggest categories; the rest is one grey segment
  const topOf = (m: string) => Object.entries(byCategory[m]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, top ?? TOP_DEFAULT).map(([id]) => id)
  const topUnion = top ? order.filter((id) => months.some((m) => topOf(m).includes(id))) : []
  const picked = top ? topUnion : order.filter((id) => selected.includes(id))
  const value = (m: string) => (picked.length && !top ? picked.reduce((s, id) => s + Math.max(0, byCategory[m][id] ?? 0), 0) : totals[m])
  // Each month stacks its own segments biggest-first from the bottom, "Everything else" included.
  // Bars are positional slots s0, s1, … and each row records which category sits in each slot.
  const data: Row[] = months.map((m) => {
    const keep = top ? topOf(m) : picked
    const parts = keep.map((id) => ({ id, v: Math.max(0, byCategory[m][id] ?? 0) })).filter((p) => p.v > 0)
    if (top) parts.push({ id: REST, v: Math.max(0, totals[m] - parts.reduce((s, p) => s + p.v, 0)) })
    parts.sort((a, b) => b.v - a.v)
    const row: Row = { month: m, total: value(m) }
    parts.forEach((p, j) => {
      row[`s${j}`] = p.v
      row[`s${j}id`] = p.id
    })
    row.topSlot = parts.length - 1
    return row
  })
  const slots = Math.max(0, ...data.map((r) => Number(r.topSlot) + 1))
  const series = top ? [...picked, REST] : picked
  const colorOf = (id: string) => (id === REST ? 'var(--rest)' : catOf(id).color)
  const nameOf = (id: string) => (id === REST ? 'Everything else' : catOf(id).name)
  const avg = months.reduce((s, m) => s + value(m), 0) / Math.max(1, months.length)
  const toggle = (id: string) => go(href.home(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]))
  // A bar click opens the month; with exactly one category picked, already filtered to it
  const openMonth = (m: string) => go(href.month(m, !top && picked.length === 1 ? picked[0] : null))

  return (
    <div className="stack">
      <div className="stats">
        <Stat label="Average month" value={ils(avgAll)} sub={`${months.length} months`} />
        <Stat label="Recurring" value={ils(recurringMonthly)} sub="per month" />
        {savedAvg != null && <Stat label="Saved per month" value={ils(savedAvg)} tone={savedAvg < 0 ? 'bad' : 'good'} sub={`${Math.round((savedSum / incomeSum) * 100)}% of income`} />}
        {netWorth > 0 && <Stat label="Net worth" value={ils(netWorth)} sub={avgAll ? `${(netWorth / avgAll).toFixed(0)} months of spending` : undefined} />}
      </div>

      <section className="card">
        <div className="chips">
          <button className={`chip ${picked.length ? '' : 'on'}`} onClick={() => go(href.home())}>All</button>
          {top ? (
            <span className="chip on stepper">
              <button className="step" onClick={() => go(href.top(Math.max(1, top - 1)))} disabled={top <= 1} aria-label="Fewer">−</button>
              <button className="step-label" onClick={() => go(href.home())} title="Turn off">Top {top}</button>
              <button className="step" onClick={() => go(href.top(Math.min(10, top + 1)))} disabled={top >= 10} aria-label="More">+</button>
            </span>
          ) : (
            <button className="chip" onClick={() => go(href.top(TOP_DEFAULT))}>Top {TOP_DEFAULT}</button>
          )}
          <span className="chip-sep" />
          {order.map((id) => (
            <button key={id} className={`chip ${!top && picked.includes(id) ? 'on' : ''} ${top && !picked.includes(id) ? 'dim' : ''}`} onClick={() => toggle(id)}>
              <Dot color={catOf(id).color} /> {catOf(id).name}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart key={series.join(',')} data={data} barCategoryGap="28%" margin={{ top: 8, right: 4, left: 4, bottom: 0 }} onClick={(e) => e?.activeLabel && openMonth(String(e.activeLabel))}>
            <XAxis dataKey="month" tickFormatter={monthShort} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-3)', fontSize: 12 }} />
            <YAxis tickFormatter={kTick} axisLine={false} tickLine={false} width={36} tick={{ fill: 'var(--text-3)', fontSize: 12 }} />
            <Tooltip content={<MonthTip names={nameOf} colors={colorOf} />} cursor={{ fill: 'var(--hover)' }} />
            <ReferenceLine y={avg} stroke="var(--text-3)" strokeDasharray="3 4" />
            {picked.length === 0 ? (
              <Bar dataKey="total" fill="var(--series-1)" radius={[4, 4, 0, 0]} cursor="pointer" />
            ) : (
              Array.from({ length: slots }, (_, j) => (
                <Bar key={j} dataKey={`s${j}`} stackId="s" stroke="var(--surface)" strokeWidth={1} cursor="pointer" isAnimationActive={false}>
                  {data.map((r) => (
                    <Cell key={r.month} fill={r[`s${j}id`] ? colorOf(String(r[`s${j}id`])) : 'transparent'} radius={j === r.topSlot ? ([4, 4, 0, 0] as unknown as number) : 0} />
                  ))}
                </Bar>
              ))
            )}
          </BarChart>
        </ResponsiveContainer>
      </section>

      {model.recurring.length > 0 && (
        <section className="card">
          <h3>Recurring</h3>
          <table className="table">
            <tbody>
              {model.recurring.map((r) => (
                <tr key={r.key}>
                  <td className="merchant" dir="auto">{r.merchant}</td>
                  <td className="muted">{catOf(r.category).name}</td>
                  <td className="muted">{r.cadence === 1 ? 'monthly' : `every ${r.cadence} mo`}</td>
                  <td className={`num small ${r.previous == null || Math.abs(r.change) < 0.1 ? 'muted' : r.change > 0 ? 'bad' : 'good'}`}>
                    {r.previous != null && Math.abs(r.change) >= 0.1 ? `${ils(r.previous, true)} → ${ils(r.last, true)}` : ''}
                  </td>
                  <td className="num strong">{ils(r.monthly)}<span className="muted">/mo</span></td>
                  <td className="actions">
                    {!r.manual && (
                      <button className="ghost tiny" title="Not recurring" onClick={() => setConfig((c) => ({ ...c, recurringOverrides: { ...c.recurringOverrides, [r.key]: false } }))}>
                        {Icon.x}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

    </div>
  )
}
