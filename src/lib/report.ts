import { FEVER_LABELS, type FeverLabel } from "./labels"
import type { ModelEvalSummary } from "./evaluate"
import { mkdir } from "node:fs/promises"

export type RunReportMeta = {
  runId: string
  timestampIso: string
  filePath: string
  limit: number
  models: string[]
  concurrency: number
}

/**
 * Formats a number as a percentage string with one decimal place.
 * @param x - The number to format (should be between 0 and 1).
 * @returns Formatted percentage string.
 */
function pct(x: number): string {
  if (typeof x !== "number" || isNaN(x)) {
    return "0.0%"
  }
  return `${(x * 100).toFixed(1)}%`
}

/**
 * Converts a string to a filesystem-safe slug.
 * Replaces invalid characters with underscores.
 * @param s - The string to convert.
 * @returns Filesystem-safe slug.
 */
export function safeSlug(s: string): string {
  if (typeof s !== "string") {
    throw new Error("Input must be a string")
  }
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_")
}

/**
 * Ensures a directory exists, creating it recursively if necessary.
 * @param path - The directory path to ensure.
 */
export async function ensureDir(path: string) {
  if (!path || typeof path !== "string") {
    throw new Error("Path must be a non-empty string")
  }
  await mkdir(path, { recursive: true })
}

/**
 * Writes an array of objects to a JSONL file.
 * @param path - The file path to write to.
 * @param rows - Array of objects to serialize.
 */
export async function writeJsonl(path: string, rows: unknown[]) {
  if (!path || typeof path !== "string") {
    throw new Error("Path must be a non-empty string")
  }
  if (!Array.isArray(rows)) {
    throw new Error("Rows must be an array")
  }
  const content = rows.map((r) => JSON.stringify(r)).join("\n") + "\n"
  await Bun.write(path, content)
}

/**
 * Generates a markdown table representation of a confusion matrix.
 * @param cm - The confusion matrix to render.
 * @returns Markdown table string.
 */
function confusionTable(cm: Record<FeverLabel, Record<FeverLabel, number>>): string {
  const header = `| gold\\\\pred | ${FEVER_LABELS.join(" | ")} |\n|---|${FEVER_LABELS.map(() => "---").join("|")}|`
  const rows = FEVER_LABELS.map((g) => {
    const vals = FEVER_LABELS.map((p) => String(cm[g][p]))
    return `| ${g} | ${vals.join(" | ")} |`
  }).join("\n")
  return `${header}\n${rows}`
}

/**
 * Renders a markdown report from evaluation summaries.
 * @param meta - Metadata about the evaluation run.
 * @param summaries - Array of evaluation summaries, one per model.
 * @returns Markdown report string.
 */
export function renderMarkdownReport(meta: RunReportMeta, summaries: ModelEvalSummary[]): string {
  if (!Array.isArray(summaries)) {
    throw new Error("Summaries must be an array")
  }
  const lines: string[] = []
  lines.push(`# FactBench Run: ${meta.runId}`)
  lines.push("")
  lines.push("## Run config")
  lines.push("")
  lines.push(`- **timestamp**: ${meta.timestampIso}`)
  lines.push(`- **file**: \`${meta.filePath}\``)
  lines.push(`- **limit**: ${meta.limit}`)
  lines.push(`- **concurrency**: ${meta.concurrency}`)
  lines.push(`- **models**: ${meta.models.map((m) => `\`${m}\``).join(", ")}`)
  lines.push("")

  lines.push("## Summary")
  lines.push("")
  lines.push("| model | accuracy | invalid-rate | correct/total |")
  lines.push("|---|---:|---:|---:|")
  for (const s of summaries) {
    lines.push(
      `| \`${s.modelId}\` | ${pct(s.accuracy)} | ${pct(s.invalidRate)} | ${s.correct}/${s.total} |`,
    )
  }
  lines.push("")

  for (const s of summaries) {
    lines.push(`## Model: \`${s.modelId}\``)
    lines.push("")
    lines.push(`- **accuracy**: ${pct(s.accuracy)} (${s.correct}/${s.total})`)
    lines.push(`- **invalid-rate**: ${pct(s.invalidRate)} (${s.invalid}/${s.total})`)
    lines.push("")
    lines.push("### Confusion matrix")
    lines.push("")
    lines.push(confusionTable(s.confusion))
    lines.push("")
  }

  return lines.join("\n")
}


