export const FEVER_LABELS = ["SUPPORTS", "REFUTES", "NOT ENOUGH INFO"] as const
export type FeverLabel = (typeof FEVER_LABELS)[number]

export type PredictedLabel = FeverLabel | "INVALID"

/**
 * Checks if a given value is a valid FEVER label.
 * @param x - The value to check.
 * @returns True if the value is a valid FEVER label, false otherwise.
 */

export function isFeverLabel(x: unknown): x is FeverLabel {
  return (
    typeof x === "string" &&
    (x === "SUPPORTS" || x === "REFUTES" || x === "NOT ENOUGH INFO")
  )
}

/**
 * Normalizes a predicted label to a valid FEVER label.
 * @param raw - The raw label to normalize.
 * @returns The normalized label.
 */
export function normalizePredictedLabel(raw: string): PredictedLabel {
  const t = raw.trim()
  if (isFeverLabel(t)) return t

  const u = t.toUpperCase()
  if (u === "NEI" || u === "NOT_ENOUGH_INFO" || u === "NOTENOUGHINFO")
    return "NOT ENOUGH INFO"
  if (u.includes("NOT ENOUGH INFO") || u.includes("NOT_ENOUGH_INFO"))
    return "NOT ENOUGH INFO"
  if (u.includes("SUPPORTS")) return "SUPPORTS"
  if (u.includes("REFUTES")) return "REFUTES"

  // Common FEVER variants
  if (u.includes("SUPPORTED")) return "SUPPORTS"
  if (u.includes("REFUTED")) return "REFUTES"

  return "INVALID"
}

/**
 * A confusion matrix for FEVER labels.
 * @param raw - The raw label to normalize.
 * @returns A confusion matrix for FEVER labels.
 */
export type ConfusionMatrix = Record<FeverLabel, Record<FeverLabel, number>> & {
  invalid: number
}

/**
 * Creates a new confusion matrix.
 * @returns A new confusion matrix.
 */
export function createConfusionMatrix(): ConfusionMatrix {
  return {
    SUPPORTS: { SUPPORTS: 0, REFUTES: 0, "NOT ENOUGH INFO": 0 },
    REFUTES: { SUPPORTS: 0, REFUTES: 0, "NOT ENOUGH INFO": 0 },
    "NOT ENOUGH INFO": { SUPPORTS: 0, REFUTES: 0, "NOT ENOUGH INFO": 0 },
    invalid: 0,
  }
}

/**
 * Records a prediction in a confusion matrix.
 * @param cm - The confusion matrix to record the prediction in.
 * @param gold - The gold label.
 * @param pred - The predicted label.
 */
export function recordPrediction(
  cm: ConfusionMatrix,
  gold: FeverLabel,
  pred: PredictedLabel,
) {
  if (pred === "INVALID") {
    cm.invalid++
    return
  }
  cm[gold][pred]++
}

/**
 * Sums the values in a confusion matrix.
 * @param cm - The confusion matrix to sum the values of.
 * @returns The sum of the values in the confusion matrix.
 */
export function sumConfusionMatrix(cm: ConfusionMatrix): number {
  let total = cm.invalid
  for (const g of FEVER_LABELS) {
    for (const p of FEVER_LABELS) total += cm[g][p]
  }
  return total
}

/**
 * Calculates the number of correct predictions from a confusion matrix.
 * @param cm - The confusion matrix to calculate the number of correct predictions from.
 * @returns The number of correct predictions.
 */
export function correctFromConfusionMatrix(cm: ConfusionMatrix): number {
  return (
    cm.SUPPORTS.SUPPORTS +
    cm.REFUTES.REFUTES +
    cm["NOT ENOUGH INFO"]["NOT ENOUGH INFO"]
  )
}


