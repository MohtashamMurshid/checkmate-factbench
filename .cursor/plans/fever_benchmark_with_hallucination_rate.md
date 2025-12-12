# FEVER Benchmark System with OpenTUI and Hallucination Rate

## Architecture Overview

The system will have three interfaces:

1. **OpenTUI Frontend** - Interactive terminal UI for running benchmarks and viewing results
2. **CLI Tool** - Command-line interface for automated benchmarking
3. **Library API** - Programmatic access for integration into other projects

All three interfaces share the same core components: dataset loader, model client, evaluator, and benchmark runner.

## Project Structure

```
checkmate-factbench/
├── src/
│   ├── core/
│   │   ├── types.ts              # TypeScript types for FEVER data, results, etc.
│   │   ├── dataset.ts            # FEVER dataset loader and evidence extractor
│   │   ├── prompts.ts            # Prompt templates for label + evidence evaluation
│   │   ├── modelClient.ts        # Vercel AI SDK wrapper with retry/timeout logic
│   │   ├── evaluator.ts          # Label accuracy, evidence F1, FEVER score, hallucination rate
│   │   ├── benchmark.ts          # Core benchmark runner logic
│   │   └── constants.ts          # Default model list and configuration constants
│   ├── cli/
│   │   └── index.ts               # CLI entry point and argument parsing
│   ├── tui/
│   │   ├── index.tsx              # OpenTUI app entry point
│   │   ├── components/
│   │   │   ├── BenchmarkView.tsx # Main benchmark running interface
│   │   │   ├── ResultsView.tsx   # Results display with metrics
│   │   │   ├── ModelSelector.tsx # Model selection dropdown
│   │   │   └── ProgressBar.tsx   # Progress indicator
│   │   └── hooks/
│   │       └── useBenchmark.ts   # Benchmark state management hook
│   └── index.ts                   # Library API exports
├── val/                           # Dataset storage (existing)
│   └── train.jsonl                # FEVER training dataset (145,450 samples)
├── data/                          # Optional: Wikipedia dump storage
│   └── wikipedia/
│       └── wiki-pages/            # Wikipedia pages JSON files
├── reports/                       # Generated benchmark reports (gitignored)
├── package.json
├── tsconfig.json
└── README.md
```

## Implementation Details

### 1. Core Types (`src/core/types.ts`)

Define TypeScript interfaces for:

- `FEVERRawEntry` - Raw JSONL entry: `id`, `verifiable`, `label`, `claim`, `evidence`
- `FEVEREvidence` - Evidence structure: `[page_id, line_id, page_name, line_index]` or `null` for NOT ENOUGH INFO
- `FEVERClaim` - Normalized claim with: `id`, `claim`, `label` ("SUPPORTS" | "REFUTES" | "NOT ENOUGH INFO"), `evidence` (nested arrays), extracted evidence sentences
- `ModelResponse` - Parsed JSON response: `label` ("SUPPORTS" | "REFUTES" | "NOT ENOUGH INFO"), `evidence` (string array)
- `EvaluationResult` - Label correct, evidence matches, F1 scores, hallucination count per sample
- `BenchmarkResult` - Aggregated metrics, per-sample results, metadata
- `BenchmarkConfig` - Provider, model ID, dataset path, max samples, API key, Wikipedia dump path, etc.
- `ModelProvider` - "openrouter" | "openai" | "anthropic"
- `WikipediaPage` - Page structure: `id`, `title`, `lines` (array of sentences)

### 1.5. Constants (`src/core/constants.ts`)

Define default configuration constants:

- `DEFAULT_MODELS` - Array of default OpenRouter model IDs to benchmark:
  ```typescript
  export const DEFAULT_MODELS = [
    "google/gemini-2.5-flash-preview-09-2025",
    "mistralai/devstral-2512:free",
    "nex-agi/deepseek-v3.1-nex-n1:free",
    "amazon/nova-2-lite-v1:free",
    "arcee-ai/trinity-mini:free",
    "openai/gpt-oss-20b:free",
    "qwen/qwen3-coder:free",
    "moonshotai/kimi-k2:free"
  ] as const;
  ```
- `DEFAULT_PROVIDER` - "openrouter"
- `DEFAULT_DATASET_PATH` - "val/train.jsonl"
- Model display names mapping (human-readable names for UI)

### 2. Dataset Loader (`src/core/dataset.ts`)

**FEVER Dataset Format (from `val/train.jsonl`):**

- JSONL format with fields:
  - `id`: Unique identifier (number)
  - `verifiable`: "VERIFIABLE" | "NOT VERIFIABLE"
  - `label`: "SUPPORTS" | "REFUTES" | "NOT ENOUGH INFO"
  - `claim`: The claim string to evaluate
  - `evidence`: Triple-nested array structure `[[[page_id, line_id, page_name, line_index], ...]]`
    - For NOT ENOUGH INFO: `[[[page_id, null, null, null]]]`
    - Multiple evidence sets can exist (outer array)

**Implementation:**

- `loadFEVERDataset(path: string)` - Load JSONL from `val/train.jsonl`, parse entries line by line
- `normalizeFEVEREntry(raw: FEVERRawEntry)` - Convert to `FEVERClaim` format
- `extractEvidenceSentences(evidence: FEVEREvidence[][][])` - Extract page names and line indices
- `loadWikipediaDump(path: string)` - Load and index Wikipedia pages from JSON files
- `getWikipediaPage(pageName: string, wikiDump: WikiDump): WikipediaPage | null` - Retrieve a specific Wikipedia page
- `getEvidencePages(claim: FEVERClaim, wikiDump: WikiDump): WikipediaPage[]` - Get all Wikipedia pages referenced in evidence
- Handle `null` values in evidence gracefully (NOT ENOUGH INFO cases)

**Wikipedia Dump Format:**
- JSON files with structure: `{id, title, lines: string[]}`
- Each file represents one Wikipedia page
- Lines array contains the sentences from that page

### 3. Prompt Templates (`src/core/prompts.ts`)

**Label + Evidence Prompt Structure:**

- System instruction explaining FEVER task with three labels: "SUPPORTS", "REFUTES", "NOT ENOUGH INFO"
- Claim to evaluate
- Optional: Provided Wikipedia context (for document-augmented mode)
- Strict JSON output requirement with exact format:
  ```json
  {
    "label": "SUPPORTS | REFUTES | NOT ENOUGH INFO",
    "evidence": ["evidence sentence 1", "evidence sentence 2"]
  }
  ```
- 0-shot, 3-shot, or 5-shot examples (configurable)
- For NOT ENOUGH INFO cases, evidence array should be empty or contain explanation

**Key Features:**

- Prevent verbose responses (emphasize JSON-only output)
- Handle invalid JSON with retry logic
- Normalize label format (handle "NOT ENOUGH INFO" vs "NOT_ENOUGH_INFO" variations)
- Support few-shot examples for better accuracy
- Template variables: `{claim}`, `{evidence}`, `{examples}`

### 4. Model Client (`src/core/modelClient.ts`)

**Vercel AI SDK Integration:**

- Wrapper around `ai` package supporting multiple providers
- Provider support:
  - **OpenRouter** - Unified API for 100+ models (recommended, single API key)
  - **OpenAI** - Direct OpenAI API access
  - **Anthropic** - Direct Anthropic API access
- Dynamic model selection with provider abstraction
- Retry logic with exponential backoff
- Timeout handling (default 30s)
- JSON parsing with validation
- Rate limit handling
- Cost estimation tracking

**Key Functions:**

- `createModelClient(apiKey: string, provider: "openrouter" | "openai" | "anthropic")`
- `queryModel(prompt: string, config: ModelConfig): Promise<ModelResponse>`
- `parseJSONResponse(text: string): ModelResponse | null`
- Handle streaming vs non-streaming responses
- OpenRouter integration using `@openrouter/ai-sdk-provider` for seamless model access

### 5. Evaluator (`src/core/evaluator.ts`)

**Label Accuracy:**

- Normalize labels before comparison (handle "NOT ENOUGH INFO" vs "NOT_ENOUGH_INFO")
- Simple exact match: `normalizeLabel(predictedLabel) === normalizeLabel(groundTruthLabel)`
- Labels: "SUPPORTS", "REFUTES", "NOT ENOUGH INFO"

**Evidence F1 Score:**

- Precision: `|predicted ∩ groundTruth| / |predicted|`
- Recall: `|predicted ∩ groundTruth| / |groundTruth|`
- F1: `2 * (precision * recall) / (precision + recall)`
- Text matching: Normalize (lowercase, trim) and compare sentences
- Handle empty evidence arrays

**FEVER Score:**

- Sample is correct if: `labelCorrect && evidenceRecall > 0`
- Joint metric requiring both label and at least one evidence match

**Hallucination Rate (NEW):**

- **Definition**: Percentage of predicted evidence sentences that do not appear anywhere in the Wikipedia evidence pages
- **Calculation per sample**:
  1. Get all Wikipedia pages referenced in ground truth evidence: `evidencePages = getEvidencePages(groundTruth, wikiDump)`
  2. Extract all sentences from these pages: `allEvidenceSentences = flatten(evidencePages.map(p => p.lines))`
  3. For each predicted evidence sentence:
     - Normalize the sentence (lowercase, trim, remove punctuation variations)
     - Check if it appears in `allEvidenceSentences` (fuzzy matching or exact match)
     - If not found, count as hallucinated
  4. Hallucination count = number of predicted sentences not found in evidence pages
  5. Hallucination rate per sample = `hallucinationCount / predictedEvidence.length`
- **Aggregate metric**:
  - Total hallucinated sentences across all samples
  - Total predicted sentences across all samples
  - Overall hallucination rate = `totalHallucinated / totalPredicted`
- **Edge cases**:
  - If predicted evidence is empty, hallucination rate is 0 (no hallucinations)
  - If Wikipedia dump is not available, skip hallucination calculation (optional metric)
  - Handle NOT ENOUGH INFO cases (no ground truth evidence pages)

**Implementation:**

- `evaluateSample(predicted: ModelResponse, groundTruth: FEVERClaim, wikiDump?: WikiDump): EvaluationResult`
  - Returns: `{ labelCorrect, evidenceMatches, precision, recall, f1, feverScore, hallucinationCount, hallucinationRate }`
- `calculateHallucinationRate(predictedEvidence: string[], evidencePages: WikipediaPage[]): number`
  - Normalize and match predicted sentences against evidence pages
  - Return count and rate of hallucinations
- `calculateMetrics(results: EvaluationResult[]): BenchmarkMetrics`
  - Aggregate all metrics including hallucination rate

**Text Matching Strategy for Hallucination Detection:**

- Normalize both predicted and evidence sentences:
  - Convert to lowercase
  - Trim whitespace
  - Remove extra spaces
  - Optionally: remove punctuation or normalize punctuation
- Use fuzzy matching (Levenshtein distance) for near-matches with threshold (e.g., 90% similarity)
- Or use exact substring matching for stricter detection
- Consider sentence boundaries (don't match partial sentences)

### 6. Benchmark Runner (`src/core/benchmark.ts`)

**Core Logic:**

- Load dataset and Wikipedia dump (optional but recommended for hallucination rate)
- Support single model or batch model benchmarking
- For each model:
  - Initialize model client
  - Loop through samples:
    - Generate prompt
    - Query model
    - Parse response
    - Evaluate against ground truth:
      - Label accuracy
      - Evidence F1
      - FEVER score
      - **Hallucination rate** (if Wikipedia dump available)
    - Log progress
  - Aggregate metrics per model
  - Generate JSON report per model
  - Support checkpoint/resume (save progress periodically)
- Generate comparative report if multiple models benchmarked

**Report Format:**

Single model report:
```json
{
  "model": "google/gemini-2.5-flash-preview-09-2025",
  "provider": "openrouter",
  "timestamp": "2024-01-01T00:00:00Z",
  "dataset": "val/train.jsonl",
  "totalSamples": 1000,
  "metrics": {
    "labelAccuracy": 0.85,
    "evidencePrecision": 0.78,
    "evidenceRecall": 0.82,
    "evidenceF1": 0.80,
    "feverScore": 0.75,
    "hallucinationRate": 0.15,
    "hallucinationCount": 150,
    "totalPredictedSentences": 1000
  },
  "latency": {
    "average": 1.2,
    "p50": 1.1,
    "p95": 2.3,
    "p99": 3.5
  },
  "samples": [
    {
      "id": 75397,
      "claim": "...",
      "predicted": { "label": "SUPPORTS", "evidence": [...] },
      "groundTruth": { "label": "SUPPORTS", "evidence": [...] },
      "evaluation": {
        "labelCorrect": true,
        "evidenceF1": 0.85,
        "feverScore": 1.0,
        "hallucinationCount": 0,
        "hallucinationRate": 0.0
      }
    }
  ]
}
```

Comparative report (multiple models):
```json
{
  "timestamp": "2024-01-01T00:00:00Z",
  "dataset": "val/train.jsonl",
  "totalSamples": 1000,
  "models": [
    {
      "model": "google/gemini-2.5-flash-preview-09-2025",
      "metrics": { "labelAccuracy": 0.85, "feverScore": 0.75, "hallucinationRate": 0.15, ... }
    },
    {
      "model": "mistralai/devstral-2512:free",
      "metrics": { "labelAccuracy": 0.82, "feverScore": 0.72, "hallucinationRate": 0.18, ... }
    }
  ],
  "comparison": {
    "bestLabelAccuracy": "google/gemini-2.5-flash-preview-09-2025",
    "bestFEVERScore": "google/gemini-2.5-flash-preview-09-2025",
    "lowestHallucinationRate": "google/gemini-2.5-flash-preview-09-2025"
  }
}
```

### 7. OpenTUI Frontend (`src/tui/`)

**Main Components:**

**BenchmarkView.tsx:**

- Model selector dropdown (with default models pre-populated)
- Multi-model selection checkbox/list
- Dataset selector
- Wikipedia dump path input (optional, for hallucination rate)
- Sample count input
- Start/Pause/Resume buttons
- Real-time progress bar (per model if multiple selected)
- Current sample display (claim, predicted, ground truth)
- Model comparison view (if multiple models running)

**ResultsView.tsx:**

- Metrics dashboard:
  - Label accuracy
  - Evidence F1
  - FEVER score
  - **Hallucination rate** (highlighted if high)
- Latency statistics
- Sample-by-sample breakdown (scrollable list)
  - Show hallucination indicator per sample
- Export to JSON button
- Color-coded results:
  - Green = correct
  - Red = incorrect
  - Yellow = correct label but hallucinations detected

**ModelSelector.tsx:**

- Provider selection dropdown (OpenRouter, OpenAI, Anthropic)
- Model selector dropdown with default models (all via OpenRouter):
  1. `google/gemini-2.5-flash-preview-09-2025`
  2. `mistralai/devstral-2512:free`
  3. `nex-agi/deepseek-v3.1-nex-n1:free`
  4. `amazon/nova-2-lite-v1:free`
  5. `arcee-ai/trinity-mini:free`
  6. `openai/gpt-oss-20b:free`
  7. `qwen/qwen3-coder:free`
  8. `moonshotai/kimi-k2:free`
- Custom model input option (for OpenRouter model IDs)
- Multi-model selection option (benchmark multiple models in sequence)
- API key input (masked) - single key for OpenRouter, provider-specific for others
- Model info display (context length, pricing if available)

**State Management:**

- React hooks for benchmark state
- Real-time updates via event emitters or polling
- Handle async benchmark execution without blocking UI

### 8. CLI Interface (`src/cli/index.ts`)

**Commands:**

- Single model benchmark:
  - `bun run cli benchmark --provider openrouter --model google/gemini-2.5-flash-preview-09-2025 --dataset val/train.jsonl --samples 100 --wiki-dump data/wikipedia`
  - `bun run cli benchmark --provider openrouter --model mistralai/devstral-2512:free --dataset val/train.jsonl --samples 100`
- Multiple models benchmark (sequential):
  - `bun run cli benchmark --models google/gemini-2.5-flash-preview-09-2025,mistralai/devstral-2512:free,nex-agi/deepseek-v3.1-nex-n1:free --dataset val/train.jsonl --samples 100`
- Resume from checkpoint:
  - `bun run cli benchmark --resume checkpoint.json`
- Launch TUI:
  - `bun run cli tui` - Launch OpenTUI interface
- Default dataset path: `val/train.jsonl`
- Default provider: `openrouter` (if OPENROUTER_API_KEY is set)
- `--wiki-dump` flag: Optional path to Wikipedia dump (required for hallucination rate calculation)
- `--models` flag: Comma-separated list of model IDs for batch benchmarking

**Features:**

- Argument parsing (commander.js or similar)
- Progress indicators
- JSON output for automation
- Checkpoint support
- Warning if Wikipedia dump not provided but hallucination rate requested

### 9. Library API (`src/index.ts`)

**Exports:**

- `runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResult>`
- `loadDataset(path: string): Promise<FEVERClaim[]>`
- `loadWikipediaDump(path: string): Promise<WikiDump>`
- `evaluateSample(predicted, groundTruth, wikiDump?): EvaluationResult`
- `calculateHallucinationRate(predictedEvidence, evidencePages): number`
- `createModelClient(...): ModelClient`
- Types exported for TypeScript users

## Dependencies

**package.json additions:**

- `ai` - Vercel AI SDK
- `@openrouter/ai-sdk-provider` - OpenRouter provider for Vercel AI SDK
- `openai` - OpenAI SDK (for direct OpenAI access)
- `@opentui/core` - OpenTUI core
- `@opentui/react` - OpenTUI React reconciler
- `commander` - CLI argument parsing
- `chalk` - Terminal colors (for CLI)
- `fuse.js` or `string-similarity` - Optional: For fuzzy string matching in hallucination detection

## Configuration

**Environment Variables:**

- `OPENROUTER_API_KEY` - OpenRouter API key (recommended - provides access to 100+ models)
- `OPENAI_API_KEY` - OpenAI API key (optional, for direct OpenAI access)
- `ANTHROPIC_API_KEY` - Anthropic API key (optional, for direct Anthropic access)
- `DATASET_PATH` - Optional override for dataset location (default: `val/train.jsonl`)
- `WIKIPEDIA_DUMP_PATH` - Optional path to Wikipedia dump directory

**Note:** OpenRouter is recommended as it provides unified access to multiple model providers through a single API key and endpoint.

**Config File (optional):**

- `benchmark.config.json` - Default models, dataset paths, Wikipedia dump path, etc.
  ```json
  {
    "defaultModels": [
      "google/gemini-2.5-flash-preview-09-2025",
      "mistralai/devstral-2512:free",
      "nex-agi/deepseek-v3.1-nex-n1:free",
      "amazon/nova-2-lite-v1:free",
      "arcee-ai/trinity-mini:free",
      "openai/gpt-oss-20b:free",
      "qwen/qwen3-coder:free",
      "moonshotai/kimi-k2:free"
    ],
    "defaultProvider": "openrouter",
    "defaultDataset": "val/train.jsonl",
    "wikipediaDumpPath": "data/wikipedia"
  }
  ```

## Testing Strategy

- Unit tests for evaluator logic (especially hallucination detection)
- Integration tests for model client (mock responses)
- Test dataset loading with sample data
- Test prompt generation
- Test Wikipedia dump loading and page retrieval
- Test hallucination rate calculation with various scenarios:
  - Exact matches
  - Near matches (fuzzy)
  - Complete hallucinations
  - Empty evidence cases
- Test OpenTUI components in isolation

## Documentation

- README with setup instructions
- Manual dataset download instructions
- Wikipedia dump download instructions (for hallucination rate)
- API documentation for library usage
- Examples for CLI and library API
- Explanation of hallucination rate metric
- Screenshots/GIFs of OpenTUI interface

## Hallucination Rate Implementation Details

### Algorithm:

1. **Load Wikipedia Dump** (if provided):
   - Index all Wikipedia pages by page name/title
   - Store page content (lines array) for quick lookup

2. **For each evaluation sample**:
   - Extract ground truth evidence pages from `claim.evidence`
   - Load all referenced Wikipedia pages
   - Collect all sentences from these pages into a set: `evidenceSentences`
   - For each predicted evidence sentence:
     - Normalize: lowercase, trim, remove extra spaces
     - Check if normalized sentence exists in `evidenceSentences`
     - If not found (exact match), try fuzzy matching
     - If still not found, mark as hallucinated
   - Calculate: `hallucinationRate = hallucinatedCount / predictedCount`

3. **Aggregate across all samples**:
   - Sum all hallucinated sentences
   - Sum all predicted sentences
   - Overall rate = `totalHallucinated / totalPredicted`

### Fuzzy Matching Options:

- **Levenshtein distance**: Calculate edit distance, threshold at 90% similarity
- **Substring matching**: Check if predicted sentence contains/contained in evidence sentences
- **Word overlap**: Check if significant word overlap exists (e.g., >80% words match)

### Performance Considerations:

- Pre-index Wikipedia pages for O(1) lookup
- Cache normalized evidence sentences
- Batch process multiple samples
- Make hallucination calculation optional if Wikipedia dump not available

