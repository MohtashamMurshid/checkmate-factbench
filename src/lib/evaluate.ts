import { generateText } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import {
  createConfusionMatrix,
  correctFromConfusionMatrix,
  recordPrediction,
  sumConfusionMatrix,
  type ConfusionMatrix,
  type FeverLabel,
  type PredictedLabel,
  normalizePredictedLabel,
} from "./labels"

export type FeverExample = {
  id: number | string
  claim: string
  label: FeverLabel
  verifiable?: string
}

export type ModelEvalItem = {
  datasetId: number | string
  exampleHash?: string
  claim: string
  goldLabel: FeverLabel
  predictedLabel: PredictedLabel
  rawText: string
  ok: boolean
  latencyMs: number
  cached?: boolean
  error?: string
  usage?: unknown
}

export type ModelEvalSummary = {
  modelId: string
  items: ModelEvalItem[]
  confusion: ConfusionMatrix
  correct: number
  total: number
  invalid: number
  accuracy: number
  invalidRate: number
}

export type RunConfig = {
  openrouterApiKey: string
  models: string[]
  concurrency: number
}

export type RunProgressEvent =
  | {
      type: "modelStart"
      modelId: string
      totalExamples: number
    }
  | {
      type: "modelItem"
      modelId: string
      index: number
      completed: number
      totalExamples: number
      item: ModelEvalItem
      summarySoFar: Omit<ModelEvalSummary, "items">
    }
  | {
      type: "modelDone"
      modelId: string
      summary: ModelEvalSummary
    }

function buildPrompt(claim: string): string {
  return [
    "You are evaluating factual claims using FEVER-style labels.",
    "Given a claim, output ONLY ONE of these exact labels:",
    "- SUPPORTS",
    "- REFUTES",
    '- NOT ENOUGH INFO',
    "",
    "Claim:",
    claim,
    "",
    "Label:",
  ].join("\n")
}

function computeSummaryFromConfusion(modelId: string, cm: ConfusionMatrix) {
  const total = sumConfusionMatrix(cm)
  const correct = correctFromConfusionMatrix(cm)
  const invalid = cm.invalid
  const accuracy = total === 0 ? 0 : correct / total
  const invalidRate = total === 0 ? 0 : invalid / total
  return { modelId, confusion: cm, total, correct, invalid, accuracy, invalidRate }
}

export async function evaluateExample(
  openrouterApiKey: string,
  modelId: string,
  ex: FeverExample,
): Promise<ModelEvalItem> {
  const openrouter = createOpenRouter({ apiKey: openrouterApiKey })
  const start = performance.now()
  try {
    const result = await generateText({
      model: openrouter.chat(modelId),
      prompt: buildPrompt(ex.claim),
    })
    const rawText = result.text ?? ""
    const predictedLabel = normalizePredictedLabel(rawText)
    const latencyMs = performance.now() - start
    return {
      datasetId: ex.id,
      claim: ex.claim,
      goldLabel: ex.label,
      predictedLabel,
      rawText,
      ok: predictedLabel === ex.label,
      latencyMs,
      usage: (result as any).usage ?? (result as any).providerMetadata,
    }
  } catch (err) {
    const latencyMs = performance.now() - start
    return {
      datasetId: ex.id,
      claim: ex.claim,
      goldLabel: ex.label,
      predictedLabel: "INVALID",
      rawText: "",
      ok: false,
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function promisePool<T>(
  concurrency: number,
  tasks: Array<() => Promise<T>>,
  onItem: (value: T, index: number) => void,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let next = 0

  async function worker() {
    while (true) {
      const i = next++
      if (i >= tasks.length) return
      const v = await tasks[i]()
      results[i] = v
      onItem(v, i)
    }
  }

  const c = Math.max(1, Math.min(concurrency, tasks.length))
  await Promise.all(Array.from({ length: c }, () => worker()))
  return results
}

export async function evaluateModelExamples(
  params: {
    openrouterApiKey: string
    modelId: string
    examples: FeverExample[]
    concurrency: number
  },
  onItem?: (item: ModelEvalItem, index: number) => void,
): Promise<ModelEvalItem[]> {
  const tasks = params.examples.map(
    (ex) => () => evaluateExample(params.openrouterApiKey, params.modelId, ex),
  )
  const items: ModelEvalItem[] = []
  await promisePool(params.concurrency, tasks, (item, idx) => {
    items[idx] = item
    onItem?.(item, idx)
  })
  return items
}

export async function evaluateModels(
  cfg: RunConfig,
  examples: FeverExample[],
  onProgress?: (ev: RunProgressEvent) => void,
): Promise<ModelEvalSummary[]> {
  const summaries: ModelEvalSummary[] = []

  for (const modelId of cfg.models) {
    onProgress?.({ type: "modelStart", modelId, totalExamples: examples.length })

    const cm = createConfusionMatrix()
    let completed = 0

    const items: ModelEvalItem[] = []
    await evaluateModelExamples(
      {
        openrouterApiKey: cfg.openrouterApiKey,
        modelId,
        examples,
        concurrency: cfg.concurrency,
      },
      (item, idx) => {
      items[idx] = item
      recordPrediction(cm, item.goldLabel, item.predictedLabel)
      const summarySoFar = computeSummaryFromConfusion(modelId, cm)
      completed++
      onProgress?.({
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

    const summary = {
      ...computeSummaryFromConfusion(modelId, cm),
      items,
    }
    onProgress?.({ type: "modelDone", modelId, summary })
    summaries.push(summary)
  }

  return summaries
}


