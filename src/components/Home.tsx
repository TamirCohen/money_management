import { Fragment, useState } from 'react'
import { Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { placeOf, type Model } from '../lib/analytics.ts'
import { href } from '../lib/route.ts'
import type { Category, Config } from '../lib/types.ts'
import { Dot, Icon, Stat, dayLabel, ils, kTick, monthLong, monthShort, pct } from './ui.tsx'

interface Props {
  model: Model
  config: Config
  catOf: (id: string) => Category
  /** Categories with spending, largest average first */
  order: string[]
  /** Categories picked above the chart (from the URL); empty = total spending */
  selected: string[]
  /** Each month split into its 5 biggest categories + the rest */
  top: boolean
  setConfig: (fn: (c: Config) => Config) => void
}

const go = (h: string) => (location.hash = h)
const TOP_N = 5
const REST = '__rest'

type Row = { month: string; total: number } & Record<string, number | string>

function MonthTip({ active, payload, label, names }: { active?: boolean; payload?: { dataKey: string; value: number; color: string; payload: Row }[]; label?: string; names: (id: string) => string }) {
  if (!active || !payload?.length || !label) return null
  const parts = payload.filter((p) => p.dataKey !== 'total')
  return (
    <div className="tip">
      <div className="tip-title">{monthLong(label)}</div>
      <b>{ils(payload[0].payload.total)}</b>
      {[...parts].sort((a, b) => b.value - a.value).filter((p) => p.value > 0).map((p) => (
        <div key={p.dataKey} className="tip-row">
          <Dot color={p.color} /> {names(p.dataKey)} <span className="tip-val">{ils(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function Home({ model, config, catOf, order, selected, top, setConfig }: Props) {
  const { months, totals, income, byCategory } = model
  const [openTrip, setOpenTrip] = useState<string | null>(null)
  const avgAll = months.reduce((s, m) => s + totals[m], 0) / Math.max(1, months.length)
  const recurringMonthly = model.recurring.reduce((s, r) => s + r.monthly, 0)
  const withIncome = months.filter((m) => income[m] > 0)
  const incomeSum = withIncome.reduce((s, m) => s + income[m], 0)
  const savingsRate = incomeSum ? withIncome.reduce((s, m) => s + income[m] - totals[m], 0) / incomeSum : null
  const netWorth = config.assets.reduce((s, a) => s + a.value, 0)

  // Top mode: each month keeps its own 5 biggest categories; the rest is one grey segment
  const topOf = (m: string) => Object.entries(byCategory[m]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, TOP_N).map(([id]) => id)
  const topUnion = top ? order.filter((id) => months.some((m) => topOf(m).includes(id))) : []
  // Selected categories stack bottom-up in the same order as the chips (largest first)
  const picked = top ? topUnion : order.filter((id) => selected.includes(id))
  const value = (m: string) => (picked.length && !top ? picked.reduce((s, id) => s + Math.max(0, byCategory[m][id] ?? 0), 0) : totals[m])
  const data: Row[] = months.map((m) => {
    const keep = top ? topOf(m) : picked
    const parts = Object.fromEntries(picked.map((id) => [id, keep.includes(id) ? Math.max(0, byCategory[m][id] ?? 0) : 0]))
    const rest = top ? totals[m] - Object.values(parts).reduce((s, v) => s + v, 0) : 0
    return { month: m, total: value(m), ...parts, ...(top ? { [REST]: Math.max(0, rest) } : {}) }
  })
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
        {savingsRate != null && <Stat label="Savings rate" value={`${Math.round(savingsRate * 100)}%`} tone={savingsRate < 0 ? 'bad' : 'good'} sub="of income" />}
        {netWorth > 0 && <Stat label="Net worth" value={ils(netWorth)} sub={avgAll ? `${(netWorth / avgAll).toFixed(0)} months of spending` : undefined} />}
      </div>

      <section className="card">
        <div className="chips">
          <button className={`chip ${picked.length ? '' : 'on'}`} onClick={() => go(href.home())}>All</button>
          <button className={`chip ${top ? 'on' : ''}`} onClick={() => go(top ? href.home() : href.top())}>Top {TOP_N}</button>
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
            <Tooltip content={<MonthTip names={nameOf} />} cursor={{ fill: 'var(--hover)' }} />
            <ReferenceLine y={avg} stroke="var(--text-3)" strokeDasharray="3 4" />
            {picked.length === 0 ? (
              <Bar dataKey="total" fill="var(--series-1)" radius={[4, 4, 0, 0]} cursor="pointer" />
            ) : (
              series.map((id, j) => (
                <Bar key={id} dataKey={id} stackId="s" fill={colorOf(id)} stroke="var(--surface)" strokeWidth={j < series.length - 1 ? 1 : 0} radius={j === series.length - 1 ? [4, 4, 0, 0] : 0} cursor="pointer" isAnimationActive={false} />
              ))
            )}
          </BarChart>
        </ResponsiveContainer>
        <table className="table rows">
          <tbody>
            {[...months].reverse().map((m) => (
              <tr key={m} className="click" onClick={() => openMonth(m)}>
                <td>{monthLong(m)}</td>
                <td className={`num small ${value(m) > avg ? 'bad' : 'good'}`}>{avg ? pct((value(m) - avg) / avg) : ''}</td>
                <td className="num strong">{ils(value(m))}</td>
                <td className="chev">{Icon.next}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

      {model.trips.length > 0 && (
        <section className="card">
          <h3>Trips</h3>
          <table className="table">
            <tbody>
              {model.trips.map((t) => (
                <Fragment key={t.id}>
                  <tr className="click" onClick={() => setOpenTrip(openTrip === t.id ? null : t.id)}>
                    <td className="strong">{placeOf(t.currency)}</td>
                    <td className="muted">{dayLabel(t.start)} – {dayLabel(t.end)} {t.start.slice(0, 4)}</td>
                    <td className="muted num">{t.days} days · {ils(t.total / t.days)}/day</td>
                    <td className="num strong">{ils(t.total)}</td>
                  </tr>
                  {openTrip === t.id &&
                    t.txs.map((x) => (
                      <tr key={x.id} className="sub">
                        <td className="muted">{dayLabel(x.date)}</td>
                        <td className="merchant" dir="auto">{x.merchant}</td>
                        <td className="muted num">{x.originalCurrency !== '₪' ? `${x.originalAmount.toLocaleString()} ${x.originalCurrency}` : ''}</td>
                        <td className="num">{ils(x.amount)}</td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
