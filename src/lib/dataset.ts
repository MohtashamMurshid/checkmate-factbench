import { readJsonlFile } from "./readJsonl"
import { FEVER_LABELS, isFeverLabel } from "./labels"
import type { FeverExample } from "./evaluate"

/**
 * Loads and validates examples from a JSONL file.
 * @param filePath - Path to the JSONL dataset file.
 * @param limit - Maximum number of examples to load.
 * @returns Array of validated FEVER examples.
 * @throws Error if the file is invalid or examples are malformed.
 */
export async function loadExamples(filePath: string, limit: number): Promise<FeverExample[]> {
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

