import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { safeSlug } from "./report"
import { sha256Hex } from "./hash"
import type { FeverExample, ModelEvalItem } from "./evaluate"

export type CacheEntry = {
  v: 1
  datasetPath: string
  modelId: string
  exampleId: string
  exampleHash: string
  item: ModelEvalItem
  cachedAtIso: string
}

export async function getDatasetCacheId(datasetPath: string): Promise<string> {
  // Use absolute path to avoid duplicate caches when invoked from different CWDs.
  const abs = path.isAbsolute(datasetPath)
    ? datasetPath
    : path.join(process.cwd(), datasetPath)
  return sha256Hex(abs)
}

export async function computeExampleHash(ex: FeverExample): Promise<string> {
  return sha256Hex(JSON.stringify({ id: ex.id, claim: ex.claim, label: ex.label }))
}

export async function getModelCachePath(params: {
  cacheRoot: string
  datasetCacheId: string
  modelId: string
}) {
  const dir = path.join(params.cacheRoot, "factbench", params.datasetCacheId)
  await mkdir(dir, { recursive: true })
  return path.join(dir, `${safeSlug(params.modelId)}.jsonl`)
}

export async function loadModelCache(params: {
  cachePath: string
}): Promise<Map<string, CacheEntry>> {
  const map = new Map<string, CacheEntry>()
  try {
    const buf = await readFile(params.cachePath)
    const text = buf.toString("utf8")
    const lines = text.split(/\r?\n/)
    for (const line of lines) {
      const t = line.trim()
      if (!t) continue
      const entry = JSON.parse(t) as CacheEntry
      if (!entry || entry.v !== 1) continue
      if (!entry.exampleId) continue
      map.set(entry.exampleId, entry)
    }
  } catch {
    // Cache miss / file missing is fine.
  }
  return map
}

export async function saveModelCache(params: {
  cachePath: string
  entries: Map<string, CacheEntry>
}) {
  const rows = Array.from(params.entries.values()).map((e) => JSON.stringify(e))
  const content = rows.join("\n") + (rows.length ? "\n" : "")
  await writeFile(params.cachePath, content, "utf8")
}

export function exampleIdToString(id: number | string): string {
  return typeof id === "number" ? String(id) : id
}

export function cacheHitToItem(hit: CacheEntry): ModelEvalItem {
  return {
    ...hit.item,
    cached: true,
    exampleHash: hit.exampleHash,
    latencyMs: 0,
  }
}


