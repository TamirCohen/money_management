import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Dev only: serve statements + config from ./data (gitignored) so the app can use them via ?dev. */
const devData = (): Plugin => ({
  name: 'dev-data',
  apply: 'serve',
  configureServer(server) {
    const dir = resolve(__dirname, 'data')
    const configPath = resolve(dir, 'expenses.config.json')
    server.middlewares.use('/__dev/config', (req, res) => {
      if (req.method === 'PUT') {
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          writeFileSync(configPath, body)
          res.end()
        })
      } else if (existsSync(configPath)) {
        res.setHeader('Content-Type', 'application/json')
        res.end(readFileSync(configPath))
      } else {
        res.statusCode = 404
        res.end()
      }
    })
    server.middlewares.use('/__dev/files', (req, res) => {
      const name = decodeURIComponent((req.url ?? '/').slice(1))
      let files: string[] = []
      try {
        files = readdirSync(dir).filter((f) => /\.xlsx?$/i.test(f))
      } catch {
        /* no data dir */
      }
      if (!name) {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(files))
      } else if (files.includes(name)) {
        res.end(readFileSync(resolve(dir, name)))
      } else {
        res.statusCode = 404
        res.end()
      }
    })
  },
})

export default defineConfig({
  // Relative asset paths: works at /, at <user>.github.io/<repo>/, or opened from anywhere
  base: './',
  plugins: [react(), devData()],
  server: { watch: { ignored: ['**/data/**'] } },
})
