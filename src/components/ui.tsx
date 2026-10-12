import type { ReactNode } from 'react'
import type { Category } from '../lib/types.ts'

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const ils = (n: number, exact = false) => `${n < 0 ? '−' : ''}₪${(exact ? nf2 : nf).format(Math.abs(n))}`
export const kTick = (v: number) => (v === 0 ? '0' : `${+(v / 1000).toFixed(Math.abs(v) < 10000 ? 1 : 0)}k`)
export const pct = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n * 100))}%`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const monthShort = (ym: string) => MONTHS[+ym.slice(5, 7) - 1]
export const monthLong = (ym: string) => `${MONTHS_LONG[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`
export const dayLabel = (iso: string) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub != null && <div className={`stat-sub ${tone ?? ''}`}>{sub}</div>}
    </div>
  )
}

export const NEW_CATEGORY = '__new__'

export function CategorySelect({ categories, value, onChange, title, allowNew = true }: { categories: Category[]; value: string; onChange: (id: string) => void; title?: string; allowNew?: boolean }) {
  return (
    <select className={`cat-select ${value === 'uncategorized' ? 'warn' : ''}`} value={value} title={title} onChange={(e) => onChange(e.target.value)}>
      {value === 'uncategorized' && <option value="uncategorized">Uncategorized</option>}
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      {allowNew && <option value={NEW_CATEGORY}>+ New category…</option>}
    </select>
  )
}

export const Dot = ({ color }: { color: string }) => <i className="dot" style={{ background: color }} />

export const Icon = {
  repeat: (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-label="Recurring" role="img">
      <path d="M3 6a4 4 0 0 1 7-2.6M13 10a4 4 0 0 1-7 2.6M10 1.5v2.5h-2.5M6 14.5V12h2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  plane: (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-label="Abroad" role="img">
      <path d="M14 8.5 9 6V2.8a1 1 0 0 0-2 0V6L2 8.5V10l5-1.3v3l-1.5 1.1V14L8 13.3l2.5.7v-1.2L9 11.7v-3l5 1.3z" fill="currentColor" />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path d="M1.5 4a1 1 0 0 1 1-1h3.6l1.4 1.5h6a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  eyeOff: (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
      <path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4zM2.5 2.5l11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="8" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-label="Settings" role="img">
      <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  reload: (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-label="Reload" role="img">
      <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5V5h-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  next: (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-label="Remove" role="img">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
}
