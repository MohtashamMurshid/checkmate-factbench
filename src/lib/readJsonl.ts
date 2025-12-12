/**
 * Reads a JSONL file line by line, yielding parsed JSON objects.
 * @param filePath - Path to the JSONL file.
 * @param limit - Optional maximum number of lines to read.
 * @yields Parsed JSON objects from each line.
 * @throws Error if the file doesn't exist or contains invalid JSON.
 */
export async function* readJsonlFile<T = unknown>(
  filePath: string,
  limit?: number,
): AsyncGenerator<T, void, void> {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("File path must be a non-empty string")
  }
  if (limit !== undefined && (limit < 0 || !Number.isInteger(limit))) {
    throw new Error("Limit must be a non-negative integer")
  }

  const file = Bun.file(filePath)
  if (!(await file.exists())) {
    throw new Error(`JSONL file not found: ${filePath}`)
  }

  const text = await file.text()
  const lines = text.split(/\r?\n/)

  let yielded = 0
  for (let i = 0; i < lines.length; i++) {
    if (limit != null && yielded >= limit) break
    const trimmed = lines[i].trim()
    if (!trimmed) continue
    
    try {
      yield JSON.parse(trimmed) as T
      yielded++
    } catch (err) {
      throw new Error(
        `Invalid JSON on line ${i + 1} of ${filePath}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
}


