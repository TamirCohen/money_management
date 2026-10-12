/**
 * The folder is the source of truth: statements are read from it and expenses.config.json is
 * read from / written to it. Nothing else is persisted (the browser only remembers which folder).
 */
import { formatConfig } from './config.ts'
import { mergeTransactions, parseWorkbook } from './parsers/index.ts'
import type { Config, FileInfo, Transaction } from './types.ts'

export const CONFIG_FILE = 'expenses.config.json'
const DB = 'expenses'
const STORE = 'handles'

type Dir = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  values(): AsyncIterable<FileSystemHandle>
}

export interface LoadResult {
  transactions: Transaction[]
  warnings: string[]
  files: FileInfo[]
}

export interface Source {
  name: string
  load(): Promise<LoadResult>
  /** Config file text, or null when the folder has none yet */
  readConfig(): Promise<string | null>
  /** Writes the config and returns the exact text written */
  writeConfig(config: Config): Promise<string>
}

export const folderSupported = () => 'showDirectoryPicker' in window

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const req = fn(open.result.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }
  })
}

export async function forgetFolder() {
  try {
    await idb('readwrite', (s) => s.delete('dir'))
  } catch {
    /* ignore */
  }
}

export async function pickFolder(): Promise<Dir> {
  const dir = await (window as unknown as { showDirectoryPicker(o: object): Promise<Dir> }).showDirectoryPicker({ mode: 'readwrite' })
  await idb('readwrite', (s) => s.put(dir, 'dir'))
  return dir
}

/** The previously opened folder, if the browser still remembers it. */
export async function savedFolder(): Promise<{ dir: Dir; granted: boolean } | null> {
  try {
    const dir = await idb<Dir | undefined>('readonly', (s) => s.get('dir'))
    if (!dir) return null
    return { dir, granted: (await dir.queryPermission({ mode: 'readwrite' })) === 'granted' }
  } catch {
    return null
  }
}

export const grant = async (dir: Dir) => (await dir.requestPermission({ mode: 'readwrite' })) === 'granted'

async function parseAll(files: AsyncIterable<{ data: ArrayBuffer; path: string }> | { data: ArrayBuffer; path: string }[]): Promise<LoadResult> {
  const lists: Transaction[][] = []
  const warnings: string[] = []
  const infos: FileInfo[] = []
  for await (const { data, path } of files) {
    try {
      const r = parseWorkbook(data, path)
      lists.push(r.transactions)
      warnings.push(...r.warnings)
      infos.push(...(r.files.length ? r.files : [{ path, provider: '—', statementMonth: '', rows: 0, statedTotal: null, parsedTotal: 0, warnings: r.warnings }]))
    } catch (e) {
      warnings.push(`${path}: ${(e as Error).message}`)
    }
  }
  return { transactions: mergeTransactions(lists), warnings, files: infos.sort((a, b) => a.path.localeCompare(b.path)) }
}

async function* walk(dir: Dir, path = ''): AsyncGenerator<{ data: ArrayBuffer; path: string }> {
  for await (const h of dir.values()) {
    if (h.name.startsWith('.')) continue
    if (h.kind === 'directory') yield* walk(h as Dir, `${path}${h.name}/`)
    else if (/\.(xlsx|xls)$/i.test(h.name)) yield { data: await (await (h as FileSystemFileHandle).getFile()).arrayBuffer(), path: path + h.name }
  }
}

export function folderSource(dir: Dir): Source {
  return {
    name: dir.name,
    load: () => parseAll(walk(dir)),
    async readConfig() {
      try {
        return await (await (await dir.getFileHandle(CONFIG_FILE)).getFile()).text()
      } catch {
        return null
      }
    },
    async writeConfig(config) {
      const text = formatConfig(config)
      const w = await (await dir.getFileHandle(CONFIG_FILE, { create: true })).createWritable()
      await w.write(text)
      await w.close()
      return text
    },
  }
}

/** Dev server only: the repo's ./data folder, served by the dev-data Vite plugin. */
export function devSource(): Source {
  return {
    name: 'data (dev)',
    async load() {
      const names: string[] = await (await fetch('/__dev/files/')).json()
      return parseAll(await Promise.all(names.map(async (path) => ({ path, data: await (await fetch(`/__dev/files/${encodeURIComponent(path)}`)).arrayBuffer() }))))
    },
    async readConfig() {
      const r = await fetch('/__dev/config')
      return r.ok ? r.text() : null
    },
    async writeConfig(config) {
      const text = formatConfig(config)
      await fetch('/__dev/config', { method: 'PUT', body: text })
      return text
    },
  }
}

export type { Dir }
