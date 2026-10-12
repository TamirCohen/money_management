/**
 * Google Drive as the data folder, browser-only: Google Identity Services gives an access token,
 * then the Drive REST API lists/downloads the statements and reads/writes expenses.config.json.
 * Needs VITE_GOOGLE_CLIENT_ID (an OAuth "Web application" client id; not a secret).
 */
import { formatConfig } from './config.ts'
import type { Source } from './storage.ts'
import { CONFIG_FILE, parseAll } from './storage.ts'

export const DRIVE_CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID
// Full Drive scope: needed to read statements you uploaded and update a config file the app didn't create
const SCOPE = 'https://www.googleapis.com/auth/drive'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const FOLDER_KEY = 'driveFolder'
const TOKEN_KEY = 'driveToken'

interface TokenClient {
  requestAccessToken(o?: { prompt?: string }): void
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient(o: { client_id: string; scope: string; callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void }): TokenClient } } }
  }
}

const session = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v)
    } catch {
      /* ignore */
    }
  },
}

/** Which Drive folder was used last (just a pointer; the data stays in Drive). */
export const savedDriveFolder = () => {
  try {
    return localStorage.getItem(FOLDER_KEY)
  } catch {
    return null
  }
}
export const forgetDriveFolder = () => {
  try {
    localStorage.removeItem(FOLDER_KEY)
  } catch {
    /* ignore */
  }
}
const rememberFolder = (id: string) => {
  try {
    localStorage.setItem(FOLDER_KEY, id)
  } catch {
    /* ignore */
  }
}

/** Accepts a folder URL (https://drive.google.com/drive/folders/<id>) or a bare id. */
export function parseFolderId(input: string): string | null {
  const m = input.match(/folders\/([\w-]{10,})/) ?? input.trim().match(/^([\w-]{10,})$/)
  return m ? m[1] : null
}

export function loadGis(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load Google sign-in'))
    document.head.appendChild(s)
  })
}

/** Valid token from this tab session, if any (tokens last ~1 hour). */
export function cachedToken(): string | null {
  const raw = session.get(TOKEN_KEY)
  if (!raw) return null
  const { token, exp } = JSON.parse(raw)
  return Date.now() < exp - 60_000 ? token : null
}

/** Must be called from a click (it may open Google's consent popup). */
export async function signIn(): Promise<string> {
  const cached = cachedToken()
  if (cached) return cached
  if (!DRIVE_CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID is not set')
  await loadGis()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: DRIVE_CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (!r.access_token) return reject(new Error(r.error ?? 'Google sign-in failed'))
        session.set(TOKEN_KEY, JSON.stringify({ token: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 }))
        resolve(r.access_token)
      },
    })
    client.requestAccessToken({ prompt: '' })
  })
}

export function driveSource(folderId: string, folderName: string): Source {
  rememberFolder(folderId)
  const api = async (url: string, init: RequestInit = {}) => {
    // Re-uses the session token; after ~1h this asks Google again (may need a click, e.g. the reload button)
    const token = await signIn()
    const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } })
    if (!r.ok) throw new Error(`Drive ${r.status}: ${(await r.text()).slice(0, 200)}`)
    return r
  }
  const list = async (parent: string) => {
    const q = encodeURIComponent(`'${parent}' in parents and trashed = false`)
    const r = await api(`${API}/files?q=${q}&fields=files(id,name,mimeType)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`)
    return ((await r.json()).files ?? []) as { id: string; name: string; mimeType: string }[]
  }
  const configFile = async () => (await list(folderId)).find((f) => f.name === CONFIG_FILE) ?? null

  async function* walk(parent: string, path = ''): AsyncGenerator<{ data: ArrayBuffer; path: string }> {
    for (const f of await list(parent)) {
      if (f.mimeType === 'application/vnd.google-apps.folder') yield* walk(f.id, `${path}${f.name}/`)
      else if (/\.(xlsx|xls)$/i.test(f.name)) yield { path: path + f.name, data: await (await api(`${API}/files/${f.id}?alt=media`)).arrayBuffer() }
      // Drive may convert uploaded Excel files to Google Sheets: export them back to xlsx
      else if (f.mimeType === 'application/vnd.google-apps.spreadsheet') yield { path: `${path}${f.name}.xlsx`, data: await (await api(`${API}/files/${f.id}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`)).arrayBuffer() }
    }
  }

  return {
    name: folderName,
    load: () => parseAll(walk(folderId)),
    async readConfig() {
      const f = await configFile()
      return f ? (await api(`${API}/files/${f.id}?alt=media`)).text() : null
    },
    async writeConfig(config) {
      const text = formatConfig(config)
      const f = await configFile()
      if (f) {
        await api(`${UPLOAD}/files/${f.id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: text })
      } else {
        const boundary = `b${Date.now()}`
        const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: CONFIG_FILE, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`
        await api(`${UPLOAD}/files?uploadType=multipart`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })
      }
      return text
    },
  }
}

/** Folder name for display; also checks the folder exists and is reachable. */
export async function folderName(folderId: string): Promise<string> {
  const token = await signIn()
  const r = await fetch(`${API}/files/${folderId}?fields=name,mimeType&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(r.status === 404 ? 'Folder not found (check the link and that it is in this Google account)' : `Drive ${r.status}`)
  const f = await r.json()
  if (f.mimeType !== 'application/vnd.google-apps.folder') throw new Error('That link is not a folder')
  return f.name
}
