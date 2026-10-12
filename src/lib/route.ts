import { useEffect, useState } from 'react'

/** Hash routes, so browser back/forward and bookmarks work:  #/  ·  #/?top  ·  #/?c=dining,coffee  ·  #/2026-10  ·  #/2026-10/dining  ·  #/settings */
export type Route = { page: 'home'; cats: string[]; top: boolean } | { page: 'month'; month: string; category: string | null } | { page: 'settings' }

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  if (parts[0] === 'settings') return { page: 'settings' }
  if (parts[0] && /^\d{4}-\d{2}$/.test(parts[0])) return { page: 'month', month: parts[0], category: parts[1] ?? null }
  const params = new URLSearchParams(query)
  const c = params.get('c')
  return { page: 'home', cats: c ? c.split(',').filter(Boolean) : [], top: params.has('top') }
}

export const href = {
  home: (cats: string[] = []) => (cats.length ? `#/?c=${cats.map(encodeURIComponent).join(',')}` : '#/'),
  top: () => '#/?top',
  month: (month: string, category?: string | null) => `#/${month}${category ? `/${encodeURIComponent(category)}` : ''}`,
  settings: () => '#/settings',
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash))
  useEffect(() => {
    const on = () => {
      const next = parseRoute(location.hash)
      setRoute((prev) => {
        // Only jump to the top when the page changes, not when filtering within a month
        const same = prev.page === next.page && (prev.page !== 'month' || (next.page === 'month' && prev.month === next.month))
        if (!same) window.scrollTo(0, 0)
        return next
      })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
