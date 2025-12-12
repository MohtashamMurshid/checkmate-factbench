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

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}

export function safeSlug(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_")
}

export async function ensureDir(path: string) {
  await mkdir(path, { recursive: true })
}

export async function writeJsonl(path: string, rows: unknown[]) {
  const content = rows.map((r) => JSON.stringify(r)).join("\n") + "\n"
  await Bun.write(path, content)
}

function confusionTable(cm: Record<FeverLabel, Record<FeverLabel, number>>): string {
  const header = `| gold\\\\pred | ${FEVER_LABELS.join(" | ")} |\n|---|${FEVER_LABELS.map(() => "---").join("|")}|`
  const rows = FEVER_LABELS.map((g) => {
    const vals = FEVER_LABELS.map((p) => String(cm[g][p]))
    return `| ${g} | ${vals.join(" | ")} |`
  }).join("\n")
  return `${header}\n${rows}`
}

export function renderMarkdownReport(meta: RunReportMeta, summaries: ModelEvalSummary[]): string {
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


