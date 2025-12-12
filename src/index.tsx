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
import { DEFAULT_MODELS, MODEL_ALIASES, MODEL_DISPLAY_NAMES } from "./config/models"
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

// ANSI color codes for hacker terminal aesthetic
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  brightGreen: "\x1b[92m",
  cyan: "\x1b[36m",
  brightCyan: "\x1b[96m",
  yellow: "\x1b[33m",
  brightYellow: "\x1b[93m",
  red: "\x1b[31m",
  brightRed: "\x1b[91m",
  magenta: "\x1b[35m",
  brightMagenta: "\x1b[95m",
  blue: "\x1b[34m",
  brightBlue: "\x1b[94m",
  white: "\x1b[37m",
  brightWhite: "\x1b[97m",
}

const ANSI_REGEX = /\x1b\[[0-9;]*m/g

// Box drawing characters
const box = {
  tl: "┌",
  tr: "┐",
  bl: "└",
  br: "┘",
  h: "─",
  v: "│",
  t: "┬",
  b: "┴",
  l: "├",
  r: "┤",
  c: "┼",
}

function style(text: string, ...colorCodes: string[]): string {
  return colorCodes.join("") + text + colors.reset
}

function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, "")
}

function truncateAnsi(str: string, maxWidth: number): string {
  if (maxWidth <= 0) return ""
  let visible = 0
  let result = ""
  let i = 0
  let truncated = false
  let hasActiveStyle = false

  while (i < str.length && visible < maxWidth) {
    const char = str[i]
    if (char === "\x1b") {
      const end = str.indexOf("m", i)
      if (end === -1) break
      const seq = str.slice(i, end + 1)
      result += seq
      if (seq === colors.reset) {
        hasActiveStyle = false
      } else if (!seq.endsWith("[0m")) {
        hasActiveStyle = true
      }
      i = end + 1
      continue
    }
    result += char
    visible++
    i++
  }

  if (i < str.length) {
    truncated = true
  }

  if (hasActiveStyle || truncated) {
    result += colors.reset
  }

  return result
}

function boxLine(width: number, left: string, middle: string, right: string): string {
  return left + middle.repeat(Math.max(0, width - 2)) + right
}

function pad(str: string, width: number, align: "left" | "right" = "left"): string {
  const truncated = truncateAnsi(str, width)
  const len = stripAnsi(truncated).length
  const padLen = Math.max(0, width - len)
  return align === "left" ? truncated + " ".repeat(padLen) : " ".repeat(padLen) + truncated
}

function humanizeModelId(modelId: string): string {
  const afterSlash = modelId.includes("/") ? modelId.split("/").pop() ?? modelId : modelId
  const beforeColon = afterSlash.includes(":") ? afterSlash.split(":")[0] ?? afterSlash : afterSlash
  return beforeColon
    .split("-")
    .filter(Boolean)
    .map((segment) =>
      /^[0-9.]+$/.test(segment) ? segment : segment.charAt(0).toUpperCase() + segment.slice(1),
    )
    .join(" ")
}

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
  const modelLabels = useMemo(() => {
    const map = new Map<string, string>()
    args.models.forEach((model, idx) => {
      const alias = MODEL_ALIASES[model] ?? `M${String(idx + 1).padStart(2, "0")}`
      map.set(model, alias)
    })
    return map
  }, [args.models])

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

  const models = args.models
  const width = Math.max(80, Math.min(120, process.stdout?.columns ?? 80))
  const makeRow = (content: string) => box.v + pad(content, width - 2) + box.v
  const aliasFor = (model: string) => modelLabels.get(model) ?? model
  const displayNameFor = (model: string) =>
    MODEL_DISPLAY_NAMES[model] ?? humanizeModelId(model)

  const header = [
    boxLine(width, box.tl, box.h, box.tr),
    box.v + pad(style(" CHECKMATE FACTBENCH ", colors.brightCyan, colors.bright), width - 2) + box.v,
    box.v + pad(style(" OpenRouter Validation System ", colors.cyan), width - 2) + box.v,
    boxLine(width, box.l, box.h, box.r),
  ].join("\n")

  const footer = boxLine(width, box.bl, box.h, box.br)

  return (
    <box flexDirection="column" padding={1}>
      <text>{header}</text>
      <text>{makeRow("")}</text>
      <text>{makeRow(`${style("FILE:", colors.brightGreen)} ${args.filePath}`)}</text>
      <text>{makeRow(`${style("LIMIT:", colors.brightGreen)} ${args.limit}`)}</text>
      <text>{makeRow(`${style("CONCURRENCY:", colors.brightGreen)} ${args.concurrency}`)}</text>
      <text>{makeRow(`${style("LABELS:", colors.brightYellow)} ${FEVER_LABELS.join(", ")}`)}</text>
      <text>{boxLine(width, box.l, box.h, box.r)}</text>
      <text>{makeRow(style("MODELS:", colors.brightCyan))}</text>
      {models.map((m) => (
        <text key={`legend-${m}`}>
          {makeRow(
            `  ${style(aliasFor(m), colors.brightCyan)} ${style("→", colors.dim)} ${style(
              displayNameFor(m),
              colors.white,
            )}`,
          )}
        </text>
      ))}
      <text>{boxLine(width, box.l, box.h, box.r)}</text>

      {state.error ? (
        <>
          <text>{makeRow(`${style("✗ ERROR:", colors.brightRed, colors.bright)} ${state.error}`)}</text>
          <text>{footer}</text>
        </>
      ) : !state.started ? (
        <>
          <text>{makeRow(style("▶ INITIALIZING...", colors.brightYellow))}</text>
          <text>{footer}</text>
        </>
      ) : (
        <>
          <text>
            {makeRow(
              `${style("CURRENT:", colors.brightCyan)} ${
                state.currentModel != null
                  ? `${style(aliasFor(state.currentModel), colors.brightCyan)} ${style(
                      "→",
                      colors.dim,
                    )} ${style(displayNameFor(state.currentModel), colors.white)}`
                  : "-"
              } ${style("│", colors.dim)} ${style("PROGRESS:", colors.brightGreen)} ${
                state.currentModelDone
              }/${state.examplesTotal}`,
            )}
          </text>
          <text>{makeRow(`${style("OUTPUT:", colors.brightMagenta)} ${state.outMdPath ?? "-"}`)}</text>
          <text>{makeRow(`${style("RAW:", colors.dim)} ${state.outDir ?? "-"}/raw/`)}</text>
          <text>{boxLine(width, box.l, box.h, box.r)}</text>

          {models.map((m: string) => {
            const s = state.summaries[m]
            if (!s) {
              return (
                <text key={m}>
                  {makeRow(
                    `${style("○", colors.yellow)} ${style(aliasFor(m), colors.brightCyan)} ${style(
                      displayNameFor(m),
                      colors.white,
                    )} ${style("│", colors.dim)} ${style("PENDING...", colors.dim)}`,
                  )}
                </text>
              )
            }
            const accPct = (s.accuracy * 100).toFixed(1)
            const invPct = (s.invalidRate * 100).toFixed(1)
            const accColor =
              s.accuracy >= 0.7
                ? colors.brightGreen
                : s.accuracy >= 0.5
                  ? colors.brightYellow
                  : colors.brightRed
            const invColor =
              s.invalidRate > 0.1
                ? colors.brightRed
                : s.invalidRate > 0.05
                  ? colors.brightYellow
                  : colors.brightGreen
            const statusIcon = s.accuracy >= 0.7 ? "✓" : s.accuracy >= 0.5 ? "◐" : "✗"

            return (
              <text key={m}>
                {makeRow(
                  `${style(statusIcon, accColor)} ${style(aliasFor(m), colors.brightCyan)} ${style(
                    displayNameFor(m),
                    colors.white,
                  )} ${style("│", colors.dim)} ${style("ACC:", colors.brightCyan)} ${style(
                    accPct + "%",
                    accColor,
                  )} ${style(
                    `(${s.correct}/${s.total})`,
                    colors.dim,
                  )} ${style("│", colors.dim)} ${style("INVALID:", colors.brightMagenta)} ${style(
                    invPct + "%",
                    invColor,
                  )}`,
                )}
              </text>
            )
          })}

          <text>{boxLine(width, box.l, box.h, box.r)}</text>
          <text>
            {makeRow(
              state.done
                ? `${style("✓ COMPLETE", colors.brightGreen, colors.bright)} ${style(
                    "— All models evaluated successfully",
                    colors.dim,
                  )}`
                : `${style("▶ RUNNING", colors.brightYellow)} ${style("— Processing models...", colors.dim)}`,
            )}
          </text>
          <text>{footer}</text>
        </>
      )}
    </box>
  )
}

const renderer = await createCliRenderer()
createRoot(renderer).render(<App />)