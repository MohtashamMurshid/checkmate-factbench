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

/**
 * Generates a cache ID for a dataset based on its absolute path.
 * Uses absolute path to avoid duplicate caches when invoked from different CWDs.
 * @param datasetPath - Path to the dataset file.
 * @returns SHA-256 hash of the absolute path.
 */
export async function getDatasetCacheId(datasetPath: string): Promise<string> {
  if (!datasetPath || typeof datasetPath !== "string") {
    throw new Error("Dataset path must be a non-empty string")
  }
  const abs = path.isAbsolute(datasetPath)
    ? datasetPath
    : path.join(process.cwd(), datasetPath)
  return sha256Hex(abs)
}

/**
 * Computes a hash for an example based on its ID, claim, and label.
 * Used for cache invalidation when example content changes.
 * @param ex - The FEVER example to hash.
 * @returns SHA-256 hash of the example's key fields.
 */
export async function computeExampleHash(ex: FeverExample): Promise<string> {
  if (!ex || typeof ex !== "object") {
    throw new Error("Example must be a valid object")
  }
  if (!ex.claim || typeof ex.claim !== "string") {
    throw new Error("Example must have a valid claim string")
  }
  return sha256Hex(JSON.stringify({ id: ex.id, claim: ex.claim, label: ex.label }))
}

/**
 * Gets the cache file path for a specific model and dataset combination.
 * Creates the directory if it doesn't exist.
 * @param params - Cache path parameters.
 * @param params.cacheRoot - Root directory for caches.
 * @param params.datasetCacheId - Hash ID of the dataset.
 * @param params.modelId - Model identifier.
 * @returns Absolute path to the cache file.
 */
export async function getModelCachePath(params: {
  cacheRoot: string
  datasetCacheId: string
  modelId: string
}) {
  if (!params.cacheRoot || !params.datasetCacheId || !params.modelId) {
    throw new Error("All cache path parameters must be provided")
  }
  const dir = path.join(params.cacheRoot, "factbench", params.datasetCacheId)
  await mkdir(dir, { recursive: true })
  return path.join(dir, `${safeSlug(params.modelId)}.jsonl`)
}

/**
 * Loads cached evaluation results from a JSONL file.
 * @param params - Cache loading parameters.
 * @param params.cachePath - Path to the cache file.
 * @returns Map of example IDs to cache entries.
 */
export async function loadModelCache(params: {
  cachePath: string
}): Promise<Map<string, CacheEntry>> {
  if (!params.cachePath || typeof params.cachePath !== "string") {
    throw new Error("Cache path must be a non-empty string")
  }

  const map = new Map<string, CacheEntry>()
  try {
    const buf = await readFile(params.cachePath)
    const text = buf.toString("utf8")
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim()
      if (!t) continue
      try {
        const entry = JSON.parse(t) as CacheEntry
        if (!entry || entry.v !== 1) continue
        if (!entry.exampleId) continue
        map.set(entry.exampleId, entry)
      } catch (err) {
        // Skip invalid cache entries but continue processing
        console.warn(`Skipping invalid cache entry on line ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  } catch (err) {
    // Cache miss / file missing is fine - return empty map
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err
    }
  }
  return map
}

/**
 * Saves evaluation results to a cache file in JSONL format.
 * @param params - Cache saving parameters.
 * @param params.cachePath - Path to save the cache file.
 * @param params.entries - Map of cache entries to save.
 */
export async function saveModelCache(params: {
  cachePath: string
  entries: Map<string, CacheEntry>
}) {
  if (!params.cachePath || typeof params.cachePath !== "string") {
    throw new Error("Cache path must be a non-empty string")
  }
  if (!(params.entries instanceof Map)) {
    throw new Error("Entries must be a Map")
  }

  const rows = Array.from(params.entries.values()).map((e) => JSON.stringify(e))
  const content = rows.join("\n") + (rows.length ? "\n" : "")
  await writeFile(params.cachePath, content, "utf8")
}

/**
 * Converts an example ID to a string representation.
 * @param id - The example ID (number or string).
 * @returns String representation of the ID.
 */
export function exampleIdToString(id: number | string): string {
  if (id === null || id === undefined) {
    throw new Error("Example ID cannot be null or undefined")
  }
  return typeof id === "number" ? String(id) : id
}

/**
 * Converts a cache entry to a ModelEvalItem.
 * @param hit - The cache entry to convert.
 * @returns ModelEvalItem with cached flag set to true.
 */
export function cacheHitToItem(hit: CacheEntry): ModelEvalItem {
  if (!hit || !hit.item) {
    throw new Error("Cache entry must have a valid item")
  }
  return {
    ...hit.item,
    cached: true,
    exampleHash: hit.exampleHash,
    latencyMs: 0,
  }
}


