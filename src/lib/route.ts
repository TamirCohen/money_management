import { useEffect, useState } from 'react'

/** Hash routes, so browser back/forward and bookmarks work:  #/  ·  #/?top=5  ·  #/?c=dining,coffee  ·  #/2026-10  ·  #/2026-10/dining  ·  #/settings */
export type Route = { page: 'home'; cats: string[]; top: number | null } | { page: 'month'; month: string; category: string | null } | { page: 'settings' }

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  if (parts[0] === 'settings') return { page: 'settings' }
  if (parts[0] && /^\d{4}-\d{2}$/.test(parts[0])) return { page: 'month', month: parts[0], category: parts[1] ?? null }
  const params = new URLSearchParams(query)
  const c = params.get('c')
  return { page: 'home', cats: c ? c.split(',').filter(Boolean) : [], top: params.has('top') ? Math.min(10, Math.max(1, Number(params.get('top')) || 5)) : null }
}

export const href = {
  home: (cats: string[] = []) => (cats.length ? `#/?c=${cats.map(encodeURIComponent).join(',')}` : '#/'),
  top: (n = 5) => `#/?top=${n}`,
  month: (month: string, category?: string | null) => `#/${month}${category ? `/${encodeURIComponent(category)}` : ''}`,
  settings: () => '#/settings',
}

export function useRoute(): Route {
  // Keep the raw hash and parse on every render, so the route always matches the URL (also after code reloads)
  const [hash, setHash] = useState(() => location.hash)
  useEffect(() => {
    const on = () =>
      setHash((prevHash) => {
        const prev = parseRoute(prevHash)
        const next = parseRoute(location.hash)
        // Only jump to the top when the page changes, not when filtering within a month
        const same = prev.page === next.page && (prev.page !== 'month' || (next.page === 'month' && prev.month === next.month))
        if (!same) window.scrollTo(0, 0)
        return location.hash
      })
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return parseRoute(hash)
}
