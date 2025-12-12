/**
 * Default OpenRouter model IDs used when the CLI flag `--models` is not provided.
 * Update this list to change the default models for the whole app.
 *
 * Each entry also contains a short alias that can be used in CLI output.
 */
const MODEL_CONFIG = [
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    alias: "LL70B",
    display: "Llama 3.3 70B Instruct (Free)",
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-405b:free",
    alias: "HERMES",
    display: "Hermes 3 Llama 3.1 405B (Free)",
  },
  {
    id: "google/gemini-2.0-flash-exp:free",
    alias: "GEMINI-FLASH",
    display: "Gemini 2.0 Flash Experimental",
  },
  {
    id: "google/gemma-3-12b-it:free",
    alias: "GEMMA12B",
    display: "Gemma 3 12B Instruct (Free)",
  },
  {
    id: "mistralai/mistral-small-3.1-24b-instruct:free",
    alias: "MISTRAL-S",
    display: "Mistral Small 3.1 24B Instruct",
  },
] as const

export const DEFAULT_MODELS = MODEL_CONFIG.map((entry) => entry.id)

export const MODEL_ALIASES = MODEL_CONFIG.reduce<Record<string, string>>((acc, entry) => {
  acc[entry.id] = entry.alias
  return acc
}, {})

export const MODEL_DISPLAY_NAMES = MODEL_CONFIG.reduce<Record<string, string>>((acc, entry) => {
  acc[entry.id] = entry.display
  return acc
}, {})
