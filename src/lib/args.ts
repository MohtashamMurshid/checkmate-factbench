import { Command } from "commander"
import { DEFAULT_MODELS } from "../config/models"

/**
 * Parses command-line arguments and validates them.
 * @param argv - Command-line arguments array.
 * @returns Parsed and validated arguments.
 * @throws Error if arguments are invalid.
 */
export function parseArgs(argv: string[]) {
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

