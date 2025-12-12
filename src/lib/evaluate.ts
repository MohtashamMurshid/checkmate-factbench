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
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
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

/**
 * Builds a prompt for evaluating a factual claim using FEVER-style labels.
 * @param claim - The claim to evaluate.
 * @returns The formatted prompt string.
 */
function buildPrompt(claim: string): string {
  if (!claim || typeof claim !== "string" || !claim.trim()) {
    throw new Error("Claim must be a non-empty string")
  }
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

/**
 * Computes evaluation summary statistics from a confusion matrix.
 * @param modelId - The model identifier.
 * @param cm - The confusion matrix.
 * @returns Summary statistics including accuracy and invalid rate.
 */
function computeSummaryFromConfusion(modelId: string, cm: ConfusionMatrix) {
  const total = sumConfusionMatrix(cm)
  const correct = correctFromConfusionMatrix(cm)
  const invalid = cm.invalid
  const accuracy = total === 0 ? 0 : correct / total
  const invalidRate = total === 0 ? 0 : invalid / total
  return { modelId, confusion: cm, total, correct, invalid, accuracy, invalidRate }
}

/**
 * Evaluates a single example using the specified model.
 * @param openrouterApiKey - The OpenRouter API key.
 * @param modelId - The model identifier.
 * @param ex - The FEVER example to evaluate.
 * @returns Evaluation result with predicted label and metadata.
 */
export async function evaluateExample(
  openrouterApiKey: string,
  modelId: string,
  ex: FeverExample,
): Promise<ModelEvalItem> {
  if (!openrouterApiKey || typeof openrouterApiKey !== "string") {
    throw new Error("OpenRouter API key must be a non-empty string")
  }
  if (!modelId || typeof modelId !== "string") {
    throw new Error("Model ID must be a non-empty string")
  }

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
    
    // Extract usage information safely
    const usage = result.usage
      ? {
          promptTokens: (result.usage as { promptTokens?: number }).promptTokens,
          completionTokens: (result.usage as { completionTokens?: number }).completionTokens,
          totalTokens: (result.usage as { totalTokens?: number }).totalTokens,
        }
      : undefined

    return {
      datasetId: ex.id,
      claim: ex.claim,
      goldLabel: ex.label,
      predictedLabel,
      rawText,
      ok: predictedLabel === ex.label,
      latencyMs,
      usage,
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

/**
 * Executes tasks in parallel with a concurrency limit.
 * @param concurrency - Maximum number of concurrent tasks.
 * @param tasks - Array of task functions to execute.
 * @param onItem - Callback invoked when each task completes.
 * @returns Array of results in the same order as tasks.
 */
async function promisePool<T>(
  concurrency: number,
  tasks: Array<() => Promise<T>>,
  onItem: (value: T, index: number) => void,
): Promise<T[]> {
  if (concurrency < 1) {
    throw new Error("Concurrency must be at least 1")
  }
  if (!Array.isArray(tasks)) {
    throw new Error("Tasks must be an array")
  }

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

/**
 * Evaluates multiple examples for a single model with concurrency control.
 * @param params - Evaluation parameters.
 * @param params.openrouterApiKey - The OpenRouter API key.
 * @param params.modelId - The model identifier.
 * @param params.examples - Array of examples to evaluate.
 * @param params.concurrency - Maximum concurrent requests.
 * @param onItem - Optional callback invoked when each example completes.
 * @returns Array of evaluation results.
 */
export async function evaluateModelExamples(
  params: {
    openrouterApiKey: string
    modelId: string
    examples: FeverExample[]
    concurrency: number
  },
  onItem?: (item: ModelEvalItem, index: number) => void,
): Promise<ModelEvalItem[]> {
  if (!Array.isArray(params.examples) || params.examples.length === 0) {
    throw new Error("Examples must be a non-empty array")
  }
  if (params.concurrency < 1) {
    throw new Error("Concurrency must be at least 1")
  }

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

/**
 * Evaluates multiple models on a set of examples.
 * @param cfg - Run configuration.
 * @param examples - Array of examples to evaluate.
 * @param onProgress - Optional callback for progress events.
 * @returns Array of evaluation summaries, one per model.
 */
export async function evaluateModels(
  cfg: RunConfig,
  examples: FeverExample[],
  onProgress?: (ev: RunProgressEvent) => void,
): Promise<ModelEvalSummary[]> {
  if (!cfg.models || cfg.models.length === 0) {
    throw new Error("At least one model must be specified")
  }
  if (!Array.isArray(examples) || examples.length === 0) {
    throw new Error("At least one example must be provided")
  }
  if (cfg.concurrency < 1) {
    throw new Error("Concurrency must be at least 1")
  }

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


