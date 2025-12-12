import { useState, useEffect } from "react"
import type { ModelEvalSummary, RunProgressEvent } from "../lib/evaluate"
import { evaluateModelExamples } from "../lib/evaluate"
import { ensureDir, renderMarkdownReport, safeSlug, writeJsonl } from "../lib/report"
import {
  correctFromConfusionMatrix,
  createConfusionMatrix,
  recordPrediction,
  sumConfusionMatrix,
} from "../lib/labels"
import {
  cacheHitToItem,
  computeExampleHash,
  exampleIdToString,
  getDatasetCacheId,
  getModelCachePath,
  loadModelCache,
  saveModelCache,
  type CacheEntry,
} from "../lib/cache"
import { loadExamples } from "../lib/dataset"
import type { FeverExample } from "../lib/evaluate"

export type AppState = {
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

export interface UseEvaluationRunArgs {
  filePath: string
  limit: number
  models: string[]
  out?: string
  concurrency: number
}
/**
 * Evaluates a model on a dataset and returns the state of the evaluation.
 * @param args - The arguments for the evaluation.
 * @returns The state of the evaluation.
 */
export function useEvaluationRun(args: UseEvaluationRunArgs) {
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
        const fullItems: Array<import("../lib/evaluate").ModelEvalItem> = new Array(
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
        if (missingExamples.length > 0) {
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
        }

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

  return state
}

