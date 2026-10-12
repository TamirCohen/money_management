import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildModel } from './lib/analytics.ts'
import { UNCATEGORIZED, merchantKey } from './lib/categories.ts'
import { normalizeConfig, seedConfig } from './lib/config.ts'
import { href, useRoute } from './lib/route.ts'
import { CONFIG_FILE, devSource, folderSource, forgetFolder, folderSupported, grant, pickFolder, savedFolder, type Dir, type LoadResult, type Source } from './lib/storage.ts'
import type { Category, Config, Transaction } from './lib/types.ts'
import { Home } from './components/Home.tsx'
import { Month } from './components/Month.tsx'
import { Settings, newCategory } from './components/Settings.tsx'
import { Icon } from './components/ui.tsx'

const isDev = import.meta.env.DEV && new URLSearchParams(location.search).has('dev')

export default function App() {
  const route = useRoute()
  const [status, setStatus] = useState<'init' | 'empty' | 'grant' | 'loading' | 'ready' | 'unsupported' | 'badconfig'>('init')
  const [pending, setPending] = useState<Dir | null>(null)
  const [source, setSource] = useState<Source | null>(null)
  const [data, setData] = useState<LoadResult>({ transactions: [], warnings: [], files: [] })
  const [config, setConfigState] = useState<Config | null>(null)
  const [error, setError] = useState<string | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)

  /** Exact text of expenses.config.json as last read or written, to detect edits made outside the app */
  const diskText = useRef<string | null>(null)

  const open = useCallback(async (src: Source, silent = false) => {
    if (!silent) setStatus('loading')
    setSource(src)
    const loaded = await src.load()
    try {
      const text = await src.readConfig()
      let cfg: Config
      if (text == null) {
        cfg = seedConfig(loaded.transactions)
        diskText.current = await src.writeConfig(cfg)
      } else {
        const raw = JSON.parse(text)
        cfg = normalizeConfig(raw, loaded.transactions)
        diskText.current = raw.version !== 2 ? await src.writeConfig(cfg) : text
      }
      setData(loaded)
      setConfigState(cfg)
      setStatus('ready')
    } catch (e) {
      setError(`${CONFIG_FILE} could not be read (${(e as Error).message}). Fix the file, then reload.`)
      if (!silent) setStatus('badconfig')
    }
  }, [])

  useEffect(() => {
    if (isDev) return void open(devSource())
    if (!folderSupported()) return setStatus('unsupported')
    savedFolder().then((s) => {
      if (!s) setStatus('empty')
      else if (s.granted) open(folderSource(s.dir))
      else {
        setPending(s.dir)
        setStatus('grant')
      }
    })
  }, [open])

  // The file wins: when coming back to the tab, pick up edits made to the config outside the app
  useEffect(() => {
    if (!source || status !== 'ready') return
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      if ((await source.readConfig()) !== diskText.current) open(source, true)
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [source, status, open])

  /** Every change goes straight to expenses.config.json (debounced while typing), unless the file changed underneath us. */
  const setConfig = useCallback(
    (fn: (c: Config) => Config) => {
      setConfigState((prev) => {
        if (!prev || !source) return prev
        const next = fn(prev)
        clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(async () => {
          try {
            if ((await source.readConfig()) !== diskText.current) {
              setError(`${CONFIG_FILE} was changed outside the app, so it was reloaded and your last change was not saved. Please redo it.`)
              return open(source, true)
            }
            diskText.current = await source.writeConfig(next)
            setError(null)
          } catch (e) {
            setError(`Could not save config: ${(e as Error).message}`)
          }
        }, 300)
        return next
      })
    },
    [source, open],
  )

  const model = useMemo(() => (config ? buildModel(data.transactions, config) : null), [data, config])

  const categories = useMemo(() => config?.categories ?? [], [config])
  const catOf = useCallback((cid: string): Category => categories.find((c) => c.id === cid) ?? UNCATEGORIZED, [categories])

  /** Like Copilot/Actual: recategorizing a transaction creates an exact-name rule for that merchant. */
  const assign = (merchant: string, category: string) =>
    setConfig((c) => ({ ...c, rules: [{ match: 'is', value: merchant, category }, ...c.rules.filter((r) => !(r.match === 'is' && merchantKey(r.value) === merchantKey(merchant)))] }))

  /** One transaction only: stored with merchant/date/amount so the config file stays readable. */
  const assignOne = (t: Transaction, category: string) =>
    setConfig((c) => ({
      ...c,
      transactionOverrides: [...c.transactionOverrides.filter((o) => o.id !== t.id), { id: t.id, category, merchant: t.merchant, date: t.date, amount: t.amount }],
    }))

  const addCategory = (name: string) => {
    const made = newCategory(config!, name)
    setConfig(() => made.config)
    return made.id
  }

  if (status !== 'ready' || !config || !model || !source) {
    return (
      <div className="landing">
        <div className="logo big" />
        {status === 'grant' && pending ? (
          <button className="primary lg" onClick={async () => (await grant(pending)) && open(folderSource(pending))}>{Icon.folder} Open {pending.name}</button>
        ) : status === 'empty' ? (
          <button className="primary lg" onClick={async () => open(folderSource(await pickFolder()))}>{Icon.folder} Choose statements folder</button>
        ) : status === 'badconfig' && source ? (
          <>
            <div className="warnings">{error}</div>
            <button className="primary lg" onClick={() => open(source)}>{Icon.reload} Reload</button>
          </>
        ) : status === 'unsupported' ? (
          <div className="muted">Open in Chrome or Edge (folder access is needed).</div>
        ) : (
          <div className="muted">Loading…</div>
        )}
      </div>
    )
  }

  const month = route.page === 'month' && model.months.includes(route.month) ? route.month : null
  const avgOf = (id: string) => model.months.reduce((s, m) => s + (model.byCategory[m][id] ?? 0), 0)
  const order = [...new Set(model.months.flatMap((m) => Object.keys(model.byCategory[m])))].filter((id) => avgOf(id) > 0).sort((a, b) => avgOf(b) - avgOf(a))

  return (
    <div className="app">
      <header>
        <a className="brand" href={href.home()}><span className="logo" />Expenses</a>
        <div className="header-right">
          <button className="ghost" onClick={() => open(source)} title="Reload statements and config from the folder">
            {Icon.reload} {source.name}
          </button>
          <a className={`ghost icon ${route.page === 'settings' ? 'on' : ''}`} href={href.settings()} title="Settings">{Icon.gear}</a>
        </div>
      </header>

      {(error || data.warnings.length > 0) && (
        <div className="warnings">
          {error && <div>{error}</div>}
          {data.warnings.map((w) => <div key={w}>{w}</div>)}
        </div>
      )}

      <main>
        {route.page === 'settings' ? (
          <Settings
            model={model}
            config={config}
            setConfig={setConfig}
            data={data}
            sourceName={source.name}
            onSwitchSource={
              isDev
                ? undefined
                : async () => {
                    await forgetFolder()
                    location.hash = '#/'
                    location.reload()
                  }
            }
          />
        ) : !model.months.length ? (
          <div className="empty">No statements found in {source.name}</div>
        ) : month && route.page === 'month' ? (
          <Month model={model} month={month} category={route.category} categories={categories} catOf={catOf} onAssign={assign} onAssignOne={assignOne} onNewCategory={addCategory} />
        ) : (
          <Home model={model} config={config} catOf={catOf} order={order} selected={route.page === 'home' ? route.cats.filter((c) => order.includes(c)) : []} top={route.page === 'home' ? route.top : null} setConfig={setConfig} />
        )}
      </main>
    </div>
  )
}
