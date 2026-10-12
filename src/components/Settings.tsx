import { useMemo, useState } from 'react'
import type { Model } from '../lib/analytics.ts'
import { PALETTE } from '../lib/config.ts'
import { slug } from '../lib/categories.ts'
import { CONFIG_FILE, type LoadResult } from '../lib/storage.ts'
import type { Asset, AssetKind, Config, IncomeItem, ManualItem, MatchType, Rule } from '../lib/types.ts'
import { CategorySelect, Icon, ils, monthLong } from './ui.tsx'

interface Props {
  model: Model
  config: Config
  setConfig: (fn: (c: Config) => Config) => void
  data: LoadResult
  sourceName: string
  /** Forget the current folder and pick another (local or Google Drive) */
  onSwitchSource?: () => void
}

const KINDS: AssetKind[] = ['cash', 'stocks', 'pension', 'other']
const CADENCE: Record<number, string> = { 1: 'monthly', 2: 'every 2 months', 3: 'quarterly', 6: 'every 6 months', 12: 'yearly' }
const today = () => new Date().toISOString().slice(0, 10)
const id = () => crypto.randomUUID().slice(0, 8)

const validRegex = (v: string) => {
  try {
    new RegExp(v)
    return true
  } catch {
    return false
  }
}

export function newCategory(config: Config, name: string): { config: Config; id: string } {
  let cid = slug(name)
  while (config.categories.some((c) => c.id === cid)) cid += '-2'
  const used = new Set(config.categories.map((c) => c.color))
  const color = PALETTE.find((p) => !used.has(p)) ?? PALETTE[config.categories.length % PALETTE.length]
  return { config: { ...config, categories: [...config.categories, { id: cid, name, color }] }, id: cid }
}

function withSnapshot(c: Config, assets: Asset[]): Config {
  const total = assets.reduce((s, a) => s + a.value, 0)
  const hist = c.netWorthHistory.filter((h) => h.date !== today())
  return { ...c, assets, netWorthHistory: [...hist, { date: today(), total }].sort((a, b) => a.date.localeCompare(b.date)) }
}

export function Settings({ model, config, setConfig, data, sourceName, onSwitchSource }: Props) {
  const [ruleQ, setRuleQ] = useState('')
  const [ruleCat, setRuleCat] = useState('')

  const ruleHits = useMemo(() => {
    const m = new Map<Rule, number>()
    for (const t of model.txs) if (t.rule) m.set(t.rule, (m.get(t.rule) ?? 0) + 1)
    return m
  }, [model.txs])
  const catCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of model.txs) m.set(t.category, (m.get(t.category) ?? 0) + 1)
    return m
  }, [model.txs])

  const setRule = (i: number, patch: Partial<Rule>) => setConfig((c) => ({ ...c, rules: c.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))
  const setManual = (mid: string, patch: Partial<ManualItem>) => setConfig((c) => ({ ...c, manual: c.manual.map((m) => (m.id === mid ? { ...m, ...patch } : m)) }))
  const setIncome = (iid: string, patch: Partial<IncomeItem>) => setConfig((c) => ({ ...c, income: c.income.map((x) => (x.id === iid ? { ...x, ...patch } : x)) }))
  const setAsset = (aid: string, patch: Partial<Asset>) => setConfig((c) => withSnapshot(c, c.assets.map((a) => (a.id === aid ? { ...a, ...patch } : a))))

  const deleteCategory = (cid: string) => {
    const name = config.categories.find((c) => c.id === cid)?.name
    const rules = config.rules.filter((r) => r.category === cid).length
    if (!confirm(`Delete “${name}”?${rules ? ` Its ${rules} rule(s) will be removed too.` : ''}`)) return
    setConfig((c) => ({ ...c, categories: c.categories.filter((x) => x.id !== cid), rules: c.rules.filter((r) => r.category !== cid) }))
  }

  const needle = ruleQ.trim().toLowerCase()
  const visibleRules = config.rules.map((r, i) => ({ r, i })).filter(({ r }) => (!ruleCat || r.category === ruleCat) && (!needle || r.value.toLowerCase().includes(needle)))
  const thisMonth = model.months[model.months.length - 1] ?? today().slice(0, 7)

  return (
    <div className="stack settings">
      <div className="month-head">
        <a className="ghost" href="#/">{Icon.back} Back</a>
        <h1>Settings</h1>
        <div className="muted small">Saved to {sourceName}/{CONFIG_FILE}</div>
      </div>

      <section className="card">
        <div className="card-head">
          <h3>Categories</h3>
          <button
            className="ghost"
            onClick={() => {
              const name = prompt('New category name')?.trim()
              if (name) setConfig((c) => newCategory(c, name).config)
            }}
          >
            {Icon.plus} Add
          </button>
        </div>
        <table className="table">
          <tbody>
            {config.categories.map((cat) => (
              <tr key={cat.id}>
                <td className="w1"><input type="color" value={cat.color} onChange={(e) => setConfig((c) => ({ ...c, categories: c.categories.map((x) => (x.id === cat.id ? { ...x, color: e.target.value } : x)) }))} /></td>
                <td><input className="plain" value={cat.name} onChange={(e) => setConfig((c) => ({ ...c, categories: c.categories.map((x) => (x.id === cat.id ? { ...x, name: e.target.value } : x)) }))} /></td>
                <td className="muted small num">{catCount.get(cat.id) ?? 0} transactions</td>
                <td className="actions"><button className="ghost tiny" onClick={() => deleteCategory(cat.id)}>{Icon.x}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Rules</h3>
          <button className="ghost" onClick={() => setConfig((c) => ({ ...c, rules: [{ match: 'contains', value: '', category: c.categories[0]?.id ?? '' }, ...c.rules] }))}>
            {Icon.plus} Add
          </button>
        </div>
        <p className="hint">Merchant name → category. “is” rules win; otherwise the first matching rule from the top. Changing a category on a transaction adds an “is” rule here.</p>
        <div className="list-head">
          <input className="search" placeholder="Search rules" value={ruleQ} onChange={(e) => setRuleQ(e.target.value)} />
          <select value={ruleCat} onChange={(e) => setRuleCat(e.target.value)}>
            <option value="">All categories</option>
            {config.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span className="muted small nowrap">{visibleRules.length} rules</span>
        </div>
        <table className="table">
          <tbody>
            {visibleRules.map(({ r, i }) => (
              <tr key={i}>
                <td className="w1">
                  <select value={r.match} onChange={(e) => setRule(i, { match: e.target.value as MatchType })}>
                    <option value="is">is</option>
                    <option value="contains">contains</option>
                    <option value="matches">matches (regex)</option>
                  </select>
                </td>
                <td>
                  <input className={`plain ${r.match === 'matches' && !validRegex(r.value) ? 'invalid' : ''}`} dir="auto" value={r.value} placeholder="merchant text" onChange={(e) => setRule(i, { value: e.target.value })} />
                </td>
                <td className="w1"><CategorySelect categories={config.categories} value={r.category} onChange={(category) => setRule(i, { category })} allowNew={false} /></td>
                <td className="muted small num nowrap">{ruleHits.get(r) ?? 0} hits</td>
                <td className="actions"><button className="ghost tiny" onClick={() => setConfig((c) => ({ ...c, rules: c.rules.filter((_, j) => j !== i) }))}>{Icon.x}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>External expenses</h3>
          <button className="ghost" onClick={() => setConfig((c) => ({ ...c, manual: [...c.manual, { id: id(), name: 'Rent', amount: 0, category: c.categories.find((x) => x.id === 'housing')?.id ?? c.categories[0].id, every: 1, start: model.months[0] ?? thisMonth }] }))}>
            {Icon.plus} Add
          </button>
        </div>
        {config.manual.map((m) => (
          <div key={m.id} className="form-row">
            <input value={m.name} onChange={(e) => setManual(m.id, { name: e.target.value })} />
            <input type="number" placeholder="₪" value={m.amount || ''} onChange={(e) => setManual(m.id, { amount: +e.target.value })} />
            <select value={m.every} onChange={(e) => setManual(m.id, { every: +e.target.value })}>
              {Object.entries(CADENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <CategorySelect categories={config.categories} value={m.category} onChange={(category) => setManual(m.id, { category })} allowNew={false} />
            <input type="month" value={m.start} onChange={(e) => setManual(m.id, { start: e.target.value })} title="From" />
            <input type="month" value={m.end ?? ''} onChange={(e) => setManual(m.id, { end: e.target.value || undefined })} title="Until (optional)" />
            <button className="ghost" onClick={() => setConfig((c) => ({ ...c, manual: c.manual.filter((x) => x.id !== m.id) }))}>{Icon.x}</button>
          </div>
        ))}
      </section>

      <div className="grid2">
        <section className="card">
          <div className="card-head">
            <h3>Income</h3>
            <button className="ghost" onClick={() => setConfig((c) => ({ ...c, income: [...c.income, { id: id(), name: 'Salary', amount: 0, start: model.months[0] ?? thisMonth }] }))}>{Icon.plus} Add</button>
          </div>
          {config.income.map((x) => (
            <div key={x.id} className="form-row">
              <input value={x.name} onChange={(e) => setIncome(x.id, { name: e.target.value })} />
              <input type="number" placeholder="₪ net / month" value={x.amount || ''} onChange={(e) => setIncome(x.id, { amount: +e.target.value })} />
              <input type="month" value={x.start} onChange={(e) => setIncome(x.id, { start: e.target.value })} title="From" />
              <button className="ghost" onClick={() => setConfig((c) => ({ ...c, income: c.income.filter((y) => y.id !== x.id) }))}>{Icon.x}</button>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Assets</h3>
            <button className="ghost" onClick={() => setConfig((c) => withSnapshot(c, [...c.assets, { id: id(), name: '', kind: 'cash', value: 0 }]))}>{Icon.plus} Add</button>
          </div>
          {config.assets.map((a) => (
            <div key={a.id} className="form-row">
              <input placeholder="Bank / broker" value={a.name} onChange={(e) => setAsset(a.id, { name: e.target.value })} />
              <select value={a.kind} onChange={(e) => setAsset(a.id, { kind: e.target.value as AssetKind })}>
                {KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>
              <input type="number" placeholder="₪" value={a.value || ''} onChange={(e) => setAsset(a.id, { value: +e.target.value })} />
              <button className="ghost" onClick={() => setConfig((c) => withSnapshot(c, c.assets.filter((x) => x.id !== a.id)))}>{Icon.x}</button>
            </div>
          ))}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h3>Months</h3>
          <select value={config.monthBasis} onChange={(e) => setConfig((c) => ({ ...c, monthBasis: e.target.value as Config['monthBasis'] }))}>
            <option value="billing">By statement (billing) month</option>
            <option value="purchase">By purchase date</option>
          </select>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Files · {sourceName}</h3>
          {onSwitchSource && <button className="ghost" onClick={onSwitchSource}>{Icon.folder} Switch folder</button>}
        </div>
        <table className="table">
          <tbody>
            {data.files.map((f) => {
              const ok = f.statedTotal == null || Math.abs(f.statedTotal - f.parsedTotal) < 0.05
              return (
                <tr key={f.path}>
                  <td dir="auto">{f.path}</td>
                  <td className="muted">{f.provider}</td>
                  <td className="muted">{f.statementMonth ? monthLong(f.statementMonth) : '—'}</td>
                  <td className="muted num">{f.rows} rows</td>
                  <td className="num">{f.statedTotal != null ? ils(f.statedTotal, true) : '—'}</td>
                  <td className={ok ? 'good' : 'bad'} title={ok ? 'Rows add up to the statement total' : `Rows sum to ${ils(f.parsedTotal, true)}`}>{ok ? '✓' : '✗'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}
