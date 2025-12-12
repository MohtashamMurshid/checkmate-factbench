export {
  FEVER_LABELS,
  type FeverLabel,
  type PredictedLabel,
  normalizePredictedLabel,
  createConfusionMatrix,
  recordPrediction,
  sumConfusionMatrix,
  correctFromConfusionMatrix,
} from "./src/lib/labels"

export {
  evaluateModels,
  type FeverExample,
  type ModelEvalItem,
  type ModelEvalSummary,
  type RunConfig,
  type RunProgressEvent,
} from "./src/lib/evaluate"


