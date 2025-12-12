import React, { useEffect, useMemo, useState } from "react"
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { Command } from "commander"
import { readJsonlFile } from "./lib/readJsonl"
import type { FeverExample, ModelEvalSummary, RunProgressEvent } from "./lib/evaluate"
import { evaluateModelExamples } from "./lib/evaluate"
import { ensureDir, renderMarkdownReport, safeSlug, writeJsonl } from "./lib/report"
import {
  FEVER_LABELS,
  correctFromConfusionMatrix,
  createConfusionMatrix,
  isFeverLabel,
  recordPrediction,
  sumConfusionMatrix,
} from "./lib/labels"
import { DEFAULT_MODELS } from "./config/models"
import {
  cacheHitToItem,
  computeExampleHash,
  exampleIdToString,
  getDatasetCacheId,
  getModelCachePath,
  loadModelCache,
  saveModelCache,
  type CacheEntry,
} from "./lib/cache"

type AppState = {
  started: boolean
  done: boolean
  error?: string
  runId?: string
  outMdPath?: string
  outDir?: string
  examplesTotal: number
  currentModel?: string
  currentModelDone: number
  summaries: Record<string, Omit<ModelEvalSummary, "items">>
}

/**
 * Parses command-line arguments and validates them.
 * @param argv - Command-line arguments array.
 * @returns Parsed and validated arguments.
 * @throws Error if arguments are invalid.
 */
function parseArgs(argv: string[]) {
  const program = new Command()
    .name("checkmate-factbench")
    .description("Run FEVER-style label validation via OpenRouter + AI SDK")
    .option("--file <path>", "JSONL dataset file", "val/train.jsonl")
    .option("--limit <n>", "Number of examples to evaluate per model", "10")
    .option(
      "--models <csv>",
      "Comma-separated OpenRouter model IDs",
      DEFAULT_MODELS.join(","),
    )
    .option("--out <path>", "Output markdown path (optional)")
    .option("--concurrency <n>", "Requests in flight per model", "2")

  program.parse(argv)
  const opts = program.opts()

  const filePath = String(opts.file)
  if (!filePath || !filePath.trim()) {
    throw new Error("File path cannot be empty")
  }

  const limitRaw = Number.parseInt(String(opts.limit), 10)
  if (isNaN(limitRaw) || limitRaw < 1) {
    throw new Error(`Invalid limit: ${opts.limit}. Must be a positive integer.`)
  }
  const limit = limitRaw

  const concurrencyRaw = Number.parseInt(String(opts.concurrency), 10)
  if (isNaN(concurrencyRaw) || concurrencyRaw < 1) {
    throw new Error(`Invalid concurrency: ${opts.concurrency}. Must be a positive integer.`)
  }
  const concurrency = concurrencyRaw

  const models = String(opts.models)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  
  if (models.length === 0) {
    throw new Error("At least one model must be specified")
  }

  const out = opts.out ? String(opts.out) : undefined

  return { filePath, limit, models, out, concurrency }
}

/**
 * Loads and validates examples from a JSONL file.
 * @param filePath - Path to the JSONL dataset file.
 * @param limit - Maximum number of examples to load.
 * @returns Array of validated FEVER examples.
 * @throws Error if the file is invalid or examples are malformed.
 */
async function loadExamples(filePath: string, limit: number): Promise<FeverExample[]> {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("File path must be a non-empty string")
  }
  if (limit < 1 || !Number.isInteger(limit)) {
    throw new Error("Limit must be a positive integer")
  }

  const examples: FeverExample[] = []
  let rowIndex = 0
  
  try {
    for await (const row of readJsonlFile<Record<string, unknown>>(filePath, limit)) {
      rowIndex++
      
      if (!row || typeof row !== "object") {
        throw new Error(`Invalid row at index ${rowIndex}: must be a JSON object`)
      }

      const label = row?.label
      if (!isFeverLabel(label)) {
        throw new Error(
          `Invalid label in dataset row id=${row?.id ?? "unknown"} (line ${rowIndex}): ${String(label)}. Expected one of: ${FEVER_LABELS.join(
            ", ",
          )}`,
        )
      }
      
      const claim = String(row?.claim ?? "")
      if (!claim.trim()) {
        throw new Error(`Missing or empty claim in dataset row id=${row?.id ?? "unknown"} (line ${rowIndex})`)
      }
      
      const rowId = row.id
      const id: string | number = 
        typeof rowId === "string" || typeof rowId === "number" 
          ? rowId 
          : rowIndex
      
      examples.push({
        id,
        claim,
        label,
        verifiable: row?.verifiable as string | undefined,
      })
    }
  } catch (err) {
    if (err instanceof Error) {
      throw err
    }
    throw new Error(`Failed to load examples: ${String(err)}`)
  }

  if (examples.length === 0) {
    throw new Error(`No valid examples found in ${filePath}`)
  }

  return examples
}

function App() {
  const args = useMemo(() => parseArgs(process.argv), [])

  const [state, setState] = useState<AppState>(() => ({
    started: false,
    done: false,
    examplesTotal: 0,
    currentModelDone: 0,
    summaries: {},
  }))

  useEffect(() => {
    let cancelled = false

    async function run() {
      const apiKey = process.env.OPENROUTER_API_KEY
      if (!apiKey) {
        throw new Error(
          "Missing OPENROUTER_API_KEY env var. Set it and rerun (e.g. OPENROUTER_API_KEY=... bun run dev -- --limit 10).",
        )
      }

      const timestampIso = new Date().toISOString()
      const runId = timestampIso.replace(/[:.]/g, "-")
      const outDir = `runs/${runId}`
      const rawDir = `${outDir}/raw`
      await ensureDir(rawDir)

      const outMdPath = args.out ?? `${outDir}.md`

      const examples = await loadExamples(args.filePath, args.limit)
      const datasetCacheId = await getDatasetCacheId(args.filePath)
      const cacheRoot = ".cache"

      if (cancelled) return
      setState((s: AppState) => ({
        ...s,
        started: true,
        runId,
        outMdPath,
        outDir,
        examplesTotal: examples.length,
      }))

      const summaries = []
      for (const modelId of args.models) {
        if (cancelled) return

        const cachePath = await getModelCachePath({
          cacheRoot,
          datasetCacheId,
          modelId,
        })
        const cacheMap = await loadModelCache({ cachePath })

        // Prepare cache hits + misses
        const fullItems: Array<import("./lib/evaluate").ModelEvalItem> = new Array(
          examples.length,
        )
        const missing: Array<{ idx: number; ex: FeverExample; exHash: string; exId: string }> =
          []

        for (let i = 0; i < examples.length; i++) {
          const ex = examples[i]
          const exId = exampleIdToString(ex.id)
          const exHash = await computeExampleHash(ex)
          const hit = cacheMap.get(exId)
          if (hit && hit.exampleHash === exHash && hit.modelId === modelId) {
            fullItems[i] = cacheHitToItem(hit)
          } else {
            missing.push({ idx: i, ex, exHash, exId })
          }
        }

        // Notify start
        const onProgress = async (ev: RunProgressEvent) => {
          if (cancelled) return
          if (ev.type === "modelStart") {
            setState((s: AppState) => ({ ...s, currentModel: ev.modelId, currentModelDone: 0 }))
            return
          }
          if (ev.type === "modelItem") {
            setState((s: AppState) => ({
              ...s,
              currentModel: ev.modelId,
              currentModelDone: ev.completed,
              summaries: { ...s.summaries, [ev.modelId]: ev.summarySoFar },
            }))
            return
          }
          if (ev.type === "modelDone") {
            const rawPath = `${rawDir}/${safeSlug(ev.modelId)}.jsonl`
            await writeJsonl(rawPath, ev.summary.items)
            setState((s: AppState) => ({
              ...s,
              summaries: {
                ...s.summaries,
                [ev.modelId]: {
                  modelId: ev.summary.modelId,
                  confusion: ev.summary.confusion,
                  total: ev.summary.total,
                  correct: ev.summary.correct,
                  invalid: ev.summary.invalid,
                  accuracy: ev.summary.accuracy,
                  invalidRate: ev.summary.invalidRate,
                },
              },
            }))
          }
        }

        await onProgress({ type: "modelStart", modelId, totalExamples: examples.length })

        // Seed confusion with cached items + emit progress for them
        const cm = createConfusionMatrix()
        let completed = 0
        for (let i = 0; i < fullItems.length; i++) {
          const item = fullItems[i]
          if (!item) continue
          recordPrediction(cm, item.goldLabel, item.predictedLabel)
          completed++
          const total = sumConfusionMatrix(cm)
          const correct = correctFromConfusionMatrix(cm)
          const invalid = cm.invalid
          const summarySoFar = {
            modelId,
            confusion: cm,
            total,
            correct,
            invalid,
            accuracy: total === 0 ? 0 : correct / total,
            invalidRate: total === 0 ? 0 : invalid / total,
          }
          await onProgress({
            type: "modelItem",
            modelId,
            index: i,
            completed,
            totalExamples: examples.length,
            item,
            summarySoFar,
          })
        }

        // Evaluate only missing rows
        const missingExamples = missing.map((m) => m.ex)
        await evaluateModelExamples(
          {
            openrouterApiKey: apiKey,
            modelId,
            examples: missingExamples,
            concurrency: args.concurrency,
          },
          async (item, localIdx) => {
            const { idx, exHash } = missing[localIdx]
            item.cached = false
            item.exampleHash = exHash
            fullItems[idx] = item
            recordPrediction(cm, item.goldLabel, item.predictedLabel)
            completed++

            const total = sumConfusionMatrix(cm)
            const correct = correctFromConfusionMatrix(cm)
            const invalid = cm.invalid
            const summarySoFar = {
              modelId,
              confusion: cm,
              total,
              correct,
              invalid,
              accuracy: total === 0 ? 0 : correct / total,
              invalidRate: total === 0 ? 0 : invalid / total,
            }
            await onProgress({
              type: "modelItem",
              modelId,
              index: idx,
              completed,
              totalExamples: examples.length,
              item,
              summarySoFar,
            })
          },
        )

        // Update cache with all items (cached + new)
        for (let i = 0; i < examples.length; i++) {
          const ex = examples[i]
          const exId = exampleIdToString(ex.id)
          const exHash = fullItems[i]?.exampleHash ?? (await computeExampleHash(ex))
          const item = fullItems[i]
          if (!item) continue
          const entry: CacheEntry = {
            v: 1,
            datasetPath: args.filePath,
            modelId,
            exampleId: exId,
            exampleHash: exHash,
            item: { ...item, cached: false },
            cachedAtIso: new Date().toISOString(),
          }
          cacheMap.set(exId, entry)
        }
        await saveModelCache({ cachePath, entries: cacheMap })

        // Finalize model summary
        const total = sumConfusionMatrix(cm)
        const correct = correctFromConfusionMatrix(cm)
        const invalid = cm.invalid
        const summary = {
          modelId,
          items: fullItems,
          confusion: cm,
          total,
          correct,
          invalid,
          accuracy: total === 0 ? 0 : correct / total,
          invalidRate: total === 0 ? 0 : invalid / total,
        }
        await onProgress({ type: "modelDone", modelId, summary })
        summaries.push(summary)
      }

      // Write markdown report
      const md = renderMarkdownReport(
        {
          runId,
          timestampIso,
          filePath: args.filePath,
          limit: examples.length,
          models: args.models,
          concurrency: args.concurrency,
        },
        summaries,
      )
      await Bun.write(outMdPath, md)

      if (cancelled) return
      setState((s: AppState) => ({ ...s, done: true }))
    }

    run().catch((e) => {
      if (cancelled) return
      setState((s: AppState) => ({
        ...s,
        done: true,
        error: e instanceof Error ? e.message : String(e),
      }))
    })

    return () => {
      cancelled = true
    }
  }, [args])

  const models = args.models

  return (
    <box flexDirection="column" padding={1}>
      <text>Checkmate FactBench — OpenRouter validation</text>
      <text>
        file: {args.filePath} | limit: {args.limit} | concurrency: {args.concurrency}
      </text>
      <text>models: {models.join(", ")}</text>
      <text>labels: {FEVER_LABELS.join(", ")}</text>
      <text>---</text>

      {state.error ? (
        <text>ERROR: {state.error}</text>
      ) : !state.started ? (
        <text>Starting…</text>
      ) : (
        <>
          <text>
            current: {state.currentModel ?? "-"} ({state.currentModelDone}/{state.examplesTotal})
          </text>
          <text>outputs: {state.outMdPath ?? "-"} (raw: {state.outDir ?? "-"}/raw/)</text>
          <text>---</text>

          {models.map((m: string) => {
            const s = state.summaries[m]
            if (!s) return <text key={m}>{m}: pending…</text>
            const accPct = (s.accuracy * 100).toFixed(1)
            const invPct = (s.invalidRate * 100).toFixed(1)
            return (
              <text key={m}>
                {m}: acc {accPct}% ({s.correct}/{s.total}) | invalid {invPct}%
              </text>
            )
          })}

          {state.done ? <text>Done.</text> : <text>Running…</text>}
        </>
      )}
    </box>
  )
}

const renderer = await createCliRenderer()
createRoot(renderer).render(<App />)