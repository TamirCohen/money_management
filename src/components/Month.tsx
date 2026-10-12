import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { Model } from '../lib/analytics.ts'
import { ruleLabel } from '../lib/categories.ts'
import { href } from '../lib/route.ts'
import type { Category } from '../lib/types.ts'
import { CategorySelect, Dot, Icon, NEW_CATEGORY, dayLabel, ils, monthLong, pct } from './ui.tsx'

interface Props {
  model: Model
  month: string
  category: string | null
  categories: Category[]
  catOf: (id: string) => Category
  onAssign: (merchant: string, category: string) => void
  onNewCategory: (name: string) => string
}

/** Pie slices beyond this many fold into one "rest" slice so colors stay distinguishable. */
const MAX_SLICES = 7

export function Month({ model, month, category, categories, catOf, onAssign, onNewCategory }: Props) {
  const [q, setQ] = useState('')
  const { months, totals, byCategory } = model
  const i = months.indexOf(month)
  const prev = months[i - 1]
  const next = months[i + 1]
  const total = totals[month] ?? 0
  const others = months.filter((m) => m !== month)
  const avg = others.length ? others.reduce((s, m) => s + totals[m], 0) / others.length : total

  const cats = Object.entries(byCategory[month] ?? {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
  const positive = cats.reduce((s, [, v]) => s + v, 0)
  const maxCat = cats[0]?.[1] ?? 1

  const slices = cats.slice(0, MAX_SLICES).map(([id, v]) => ({ id, name: catOf(id).name, value: v, color: catOf(id).color }))
  const rest = cats.slice(MAX_SLICES).reduce((s, [, v]) => s + v, 0)
  if (rest > 0) slices.push({ id: '', name: `${cats.length - MAX_SLICES} more`, value: rest, color: 'var(--rest)' })

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return model.txs.filter((t) => t.month === month && (!category || t.category === category) && (!needle || t.key.includes(needle) || String(t.amount).includes(needle)))
  }, [model.txs, month, category, q])
  const rowsSum = rows.reduce((s, t) => s + t.amount, 0)

  const filter = (id: string | null) => (location.hash = href.month(month, id === category ? null : id))

  const assign = (merchant: string, id: string) => {
    if (id === NEW_CATEGORY) {
      const name = prompt('New category name')?.trim()
      if (!name) return
      id = onNewCategory(name)
    }
    onAssign(merchant, id)
  }

  return (
    <div className="stack">
      <div className="month-head">
        <a className="ghost" href={href.home()}>{Icon.back} All months</a>
        <div className="month-nav">
          <a className={`ghost icon ${prev ? '' : 'disabled'}`} href={prev ? href.month(prev, category) : undefined} aria-label="Previous month">{Icon.back}</a>
          <h1>{monthLong(month)}</h1>
          <a className={`ghost icon ${next ? '' : 'disabled'}`} href={next ? href.month(next, category) : undefined} aria-label="Next month">{Icon.next}</a>
        </div>
        <div className="month-total">
          <div className="big-num">{ils(total)}</div>
          {others.length > 0 && <div className={`small ${total > avg ? 'bad' : 'good'}`}>{pct((total - avg) / (avg || 1))} vs avg {ils(avg)}</div>}
        </div>
      </div>

      <section className="card breakdown">
        <div className="donut">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="96%" paddingAngle={1} stroke="var(--surface)" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false} onClick={(d) => d.payload.id && filter(d.payload.id)}>
                {slices.map((s) => (
                  <Cell key={s.id || 'rest'} fill={s.color} opacity={!category || category === s.id ? 1 : 0.25} cursor={s.id ? 'pointer' : 'default'} />
                ))}
              </Pie>
              <Tooltip formatter={(v, n) => [`${ils(Number(v))} · ${Math.round((Number(v) / positive) * 100)}%`, n]} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-center">
            <div className="muted small">{category ? catOf(category).name : 'Total'}</div>
            <div className="strong">{ils(category ? (byCategory[month]?.[category] ?? 0) : total)}</div>
          </div>
        </div>

        <div className="bars">
          {cats.map(([id, v]) => (
            <button key={id} className={`bar-row ${category === id ? 'on' : ''} ${category && category !== id ? 'dim' : ''}`} onClick={() => filter(id)}>
              <span className="bar-label"><Dot color={catOf(id).color} />{catOf(id).name}</span>
              <span className="bar-track"><span className="bar-fill" style={{ width: `${(v / maxCat) * 100}%`, background: catOf(id).color }} /></span>
              <span className="bar-pct muted">{Math.round((v / positive) * 100)}%</span>
              <span className="bar-value">{ils(v)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card flush">
        <div className="list-head">
          {category && (
            <button className="chip on" onClick={() => filter(null)}>
              <Dot color={catOf(category).color} /> {catOf(category).name} {Icon.x}
            </button>
          )}
          {category && <a className="ghost small" href={href.home([category])}>Over time {Icon.next}</a>}
          <input className="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="muted small nowrap">{rows.length} · <b className="strong">{ils(rowsSum)}</b></span>
        </div>
        <table className="table tx">
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className={model.outliers.has(t.id) ? 'hl' : ''}>
                <td className="muted nowrap">{dayLabel(t.date)}</td>
                <td>
                  <div className="merchant-cell">
                  <span className="merchant" dir="auto">{t.merchant}</span>
                  <span className="flags">
                    {t.recurring && <span title="Recurring">{Icon.repeat}</span>}
                    {t.foreign && <span title={`${t.originalAmount} ${t.originalCurrency}`}>{Icon.plane}</span>}
                    {t.installment && <span className="pill">{t.installment.n}/{t.installment.of}</span>}
                  </span>
                  </div>
                </td>
                <td className="cat-cell">
                  {t.manual ? (
                    <span className="muted small">manual · {catOf(t.category).name}</span>
                  ) : (
                    <CategorySelect categories={categories} value={t.category} onChange={(id) => assign(t.merchant, id)} title={t.rule ? `Rule: ${ruleLabel(t.rule)}` : 'No rule matches'} />
                  )}
                </td>
                <td className={`num ${t.amount < 0 ? 'good' : ''}`}>{ils(t.amount, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
