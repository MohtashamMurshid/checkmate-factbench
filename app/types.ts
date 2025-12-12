export type RunInfo = {
  id: string
  timestamp: string
  markdownPath: string
  rawDir: string
}

export type RunData = {
  runId: string
  timestamp: string
  filePath: string
  limit: number
  concurrency: number
  models: string[]
  summaries: ModelSummary[]
}

export type ModelSummary = {
  modelId: string
  accuracy: number
  invalidRate: number
  correct: number
  total: number
  invalid: number
  confusion: ConfusionMatrix
  items: ModelEvalItem[]
}

export type ConfusionMatrix = {
  SUPPORTS: Record<string, number>
  REFUTES: Record<string, number>
  'NOT ENOUGH INFO': Record<string, number>
  invalid: number
}

export type ModelEvalItem = {
  datasetId: number | string
  claim: string
  goldLabel: string
  predictedLabel: string
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

