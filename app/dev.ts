import { serve, build } from 'bun'
import { join } from 'node:path'
import { listRuns, loadRunData } from './server'

const PORT = 3000

// Pre-bundle the React app
const appEntry = join(import.meta.dir, 'main.tsx')
const buildDir = join(import.meta.dir, '.bun-build')
let bundledApp: string | null = null

async function getBundledApp() {
  if (!bundledApp) {
    console.log('Bundling React app...')
    try {
      const result = await build({
        entrypoints: [appEntry],
        outdir: buildDir,
        target: 'browser',
        format: 'esm',
        minify: false,
      })
      
      // Find the output file (Bun creates a file based on the entrypoint name)
      const outputFile = join(buildDir, 'main.js')
      const file = Bun.file(outputFile)
      
      if (await file.exists()) {
        bundledApp = await file.text()
        console.log('✓ App bundled successfully')
      } else {
        // Check what files were actually created
        const buildFiles = await Array.fromAsync(
          new Bun.Glob('**/*.js').scan({ cwd: buildDir })
        )
        console.error('Expected file not found. Built files:', buildFiles)
        throw new Error(`Bundled file not found at ${outputFile}`)
      }
    } catch (err) {
      console.error('Error bundling app:', err)
      throw err
    }
  }
  return bundledApp
}

// Bundle on startup
getBundledApp().catch(console.error)

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    // API routes
    if (url.pathname === '/api/runs') {
      const runs = await listRuns()
      return new Response(JSON.stringify(runs), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (url.pathname.startsWith('/api/runs/')) {
      const runId = url.pathname.replace('/api/runs/', '')
      try {
        const runData = await loadRunData(runId)
        return new Response(JSON.stringify(runData), {
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (err) {
        return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // Serve bundled app
    if (url.pathname === '/main.js' || url.pathname === '/main.tsx') {
      try {
        const bundle = await getBundledApp()
        return new Response(bundle, {
          headers: { 'Content-Type': 'application/javascript' },
        })
      } catch (err) {
        return new Response(
          `Error loading app: ${err instanceof Error ? err.message : 'Unknown error'}`,
          { status: 500 }
        )
      }
    }

    // Serve index.html with updated script tag
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const htmlPath = join(import.meta.dir, 'index.html')
      let html = await Bun.file(htmlPath).text()
      // Replace the TSX import with the bundled JS
      html = html.replace('./main.tsx', './main.js')
      return new Response(html, {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    // Serve other static files
    const filePath = url.pathname
    const fullPath = join(import.meta.dir, filePath)

    try {
      const file = Bun.file(fullPath)
      if (await file.exists()) {
        // Determine content type
        let contentType = 'text/plain'
        if (filePath.endsWith('.css')) {
          contentType = 'text/css'
        } else if (filePath.endsWith('.js')) {
          contentType = 'application/javascript'
        } else if (filePath.endsWith('.json')) {
          contentType = 'application/json'
        } else if (filePath.endsWith('.png')) {
          contentType = 'image/png'
        } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
          contentType = 'image/jpeg'
        } else if (filePath.endsWith('.svg')) {
          contentType = 'image/svg+xml'
        }

        return new Response(file, {
          headers: { 'Content-Type': contentType },
        })
      }
    } catch {
      // File doesn't exist
    }

    return new Response('Not Found', { status: 404 })
  },
})

console.log(`🚀 Checkmate FactBench Viewer running at http://localhost:${PORT}`)

