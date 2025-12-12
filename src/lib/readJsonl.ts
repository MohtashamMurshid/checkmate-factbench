export async function* readJsonlFile<T = unknown>(
  filePath: string,
  limit?: number,
): AsyncGenerator<T, void, void> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) {
    throw new Error(`JSONL file not found: ${filePath}`)
  }

  const text = await file.text()
  const lines = text.split(/\r?\n/)

  let yielded = 0
  for (const line of lines) {
    if (limit != null && yielded >= limit) break
    const trimmed = line.trim()
    if (!trimmed) continue
    yield JSON.parse(trimmed) as T
    yielded++
  }
}


