import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readJsonlFile } from '../src/lib/readJsonl'
import { safeSlug } from '../src/lib/report'
import type { ModelEvalItem, ModelSummary } from './types'

const RUNS_DIR = join(process.cwd(), 'runs')

async function listRuns() {
  try {
    const entries = await readdir(RUNS_DIR, { withFileTypes: true })
    const runs = []

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const runId = entry.name
        const mdPath = join(RUNS_DIR, `${runId}.md`)
        try {
          const mdContent = await readFile(mdPath, 'utf-8')
          // Extract timestamp from markdown
          const timestampMatch = mdContent.match(/\*\*timestamp\*\*: (.+)/)
          const timestamp = timestampMatch ? timestampMatch[1] : runId

          runs.push({
            id: runId,
            timestamp,
            markdownPath: mdPath,
            rawDir: join(RUNS_DIR, runId, 'raw'),
          })
        } catch {
          // Skip if markdown doesn't exist
        }
      }
    }

    // Sort by timestamp (newest first)
    runs.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime()
      const dateB = new Date(b.timestamp).getTime()
      return dateB - dateA
    })

    return runs
  } catch (err) {
    console.error('Error listing runs:', err)
    return []
  }
}

async function loadRunData(runId: string) {
  const mdPath = join(RUNS_DIR, `${runId}.md`)
  const rawDir = join(RUNS_DIR, runId, 'raw')

  try {
    const mdContent = await readFile(mdPath, 'utf-8')
    const lines = mdContent.split('\n')

    // Parse metadata
    const timestampMatch = mdContent.match(/\*\*timestamp\*\*: (.+)/)
    const filePathMatch = mdContent.match(/\*\*file\*\*: `(.+)`/)
    const limitMatch = mdContent.match(/\*\*limit\*\*: (\d+)/)
    const concurrencyMatch = mdContent.match(/\*\*concurrency\*\*: (\d+)/)
    const modelsMatch = mdContent.match(/\*\*models\*\*: (.+)/)

    const timestamp = timestampMatch ? timestampMatch[1] : runId
    const filePath = filePathMatch ? filePathMatch[1] : 'unknown'
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : 0
    const concurrency = concurrencyMatch ? parseInt(concurrencyMatch[1], 10) : 0
    const models = modelsMatch
      ? modelsMatch[1]
          .split(',')
          .map((m) => m.trim().replace(/`/g, ''))
          .filter(Boolean)
      : []

    // Parse summaries from markdown
    const summaries: ModelSummary[] = []
    let currentModel: string | null = null
    let currentAccuracy = 0
    let currentInvalidRate = 0
    let currentCorrect = 0
    let currentTotal = 0
    let currentInvalid = 0
    let currentConfusion: any = {
      SUPPORTS: { SUPPORTS: 0, REFUTES: 0, 'NOT ENOUGH INFO': 0 },
      REFUTES: { SUPPORTS: 0, REFUTES: 0, 'NOT ENOUGH INFO': 0 },
      'NOT ENOUGH INFO': { SUPPORTS: 0, REFUTES: 0, 'NOT ENOUGH INFO': 0 },
      invalid: 0,
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Model header
      const modelMatch = line.match(/## Model: `(.+)`/)
      if (modelMatch) {
        if (currentModel) {
          summaries.push({
            modelId: currentModel,
            accuracy: currentAccuracy,
            invalidRate: currentInvalidRate,
            correct: currentCorrect,
            total: currentTotal,
            invalid: currentInvalid,
            confusion: currentConfusion,
            items: [],
          })
        }
        currentModel = modelMatch[1]
        currentConfusion = {
          SUPPORTS: { SUPPORTS: 0, REFUTES: 0, 'NOT ENOUGH INFO': 0 },
          REFUTES: { SUPPORTS: 0, REFUTES: 0, 'NOT ENOUGH INFO': 0 },
          'NOT ENOUGH INFO': { SUPPORTS: 0, REFUTES: 0, 'NOT ENOUGH INFO': 0 },
          invalid: 0,
        }
        continue
      }

      // Accuracy line
      const accuracyMatch = line.match(/\*\*accuracy\*\*: ([\d.]+)% \((\d+)\/(\d+)\)/)
      if (accuracyMatch && currentModel) {
        currentAccuracy = parseFloat(accuracyMatch[1]) / 100
        currentCorrect = parseInt(accuracyMatch[2], 10)
        currentTotal = parseInt(accuracyMatch[3], 10)
        continue
      }

      // Invalid rate line
      const invalidMatch = line.match(/\*\*invalid-rate\*\*: ([\d.]+)% \((\d+)\/(\d+)\)/)
      if (invalidMatch && currentModel) {
        currentInvalidRate = parseFloat(invalidMatch[1]) / 100
        currentInvalid = parseInt(invalidMatch[2], 10)
        continue
      }

      // Confusion matrix table
      if (line.includes('| gold\\\\pred |') && currentModel) {
        // Skip header separator
        i++
        // Parse rows
        const labels = ['SUPPORTS', 'REFUTES', 'NOT ENOUGH INFO']
        for (const goldLabel of labels) {
          i++
          const rowLine = lines[i]
          if (!rowLine) break
          const cells = rowLine.split('|').map((c) => c.trim()).filter(Boolean)
          if (cells.length >= 4) {
            for (let j = 0; j < labels.length; j++) {
              const predLabel = labels[j]
              const count = parseInt(cells[j + 1], 10) || 0
              if (currentConfusion[goldLabel]) {
                currentConfusion[goldLabel][predLabel] = count
              }
            }
          }
        }
      }
    }

    // Add last model
    if (currentModel) {
      summaries.push({
        modelId: currentModel,
        accuracy: currentAccuracy,
        invalidRate: currentInvalidRate,
        correct: currentCorrect,
        total: currentTotal,
        invalid: currentInvalid,
        confusion: currentConfusion,
        items: [],
      })
    }

    // Load items from JSONL files
    for (const summary of summaries) {
      const jsonlPath = join(rawDir, `${safeSlug(summary.modelId)}.jsonl`)
      try {
        const items: ModelEvalItem[] = []
        for await (const row of readJsonlFile<ModelEvalItem>(jsonlPath)) {
          items.push(row)
        }
        summary.items = items
      } catch (err) {
        console.error(`Error loading JSONL for ${summary.modelId}:`, err)
        summary.items = []
      }
    }

    return {
      runId,
      timestamp,
      filePath,
      limit,
      concurrency,
      models,
      summaries,
    }
  } catch (err) {
    console.error('Error loading run data:', err)
    throw err
  }
}

export { listRuns, loadRunData }

