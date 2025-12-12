# Checkmate FactBench

A CLI tool for benchmarking LLMs on factual accuracy using the FEVER dataset. Evaluate how well language models can classify claims as **SUPPORTS**, **REFUTES**, or **NOT ENOUGH INFO**.

## Features

- 🎯 **FEVER Dataset Evaluation**: Benchmark multiple LLMs on factual claim verification
- 📊 **Real-time Progress**: Live terminal UI showing evaluation progress and metrics
- 💾 **Smart Caching**: Avoids re-evaluating the same examples across runs
- 📈 **Detailed Reports**: Generates markdown reports with confusion matrices and accuracy metrics
- ⚡ **Concurrent Evaluation**: Configurable concurrency for faster evaluation
- 🔄 **Multiple Models**: Evaluate multiple models in a single run

## Installation

```bash
npm install -g checkmate-factbench
```

or

```bash
bun add -g checkmate-factbench
```

## Quick Start

1. **Set your OpenRouter API key:**

```bash
export OPENROUTER_API_KEY=your_api_key_here
```

Get your API key from [openrouter.ai](https://openrouter.ai)

2. **Prepare your dataset:**

Your dataset should be a JSONL file where each line is a JSON object with:
- `id`: Unique identifier
- `claim`: The claim to evaluate
- `label`: One of `"SUPPORTS"`, `"REFUTES"`, or `"NOT ENOUGH INFO"`
- `verifiable`: (optional) `"VERIFIABLE"` or `"NOT VERIFIABLE"`

Example (`val/train.jsonl`):
```jsonl
{"id": 1, "claim": "Barack Obama was born in Hawaii.", "label": "SUPPORTS", "verifiable": "VERIFIABLE"}
{"id": 2, "claim": "The moon is made of cheese.", "label": "REFUTES", "verifiable": "VERIFIABLE"}
{"id": 3, "claim": "Some unknown fact about X.", "label": "NOT ENOUGH INFO", "verifiable": "NOT VERIFIABLE"}
```

3. **Run the evaluation:**

```bash
checkmate-factbench --file val/train.jsonl --limit 10
```

## Usage

```bash
checkmate-factbench [options]
```

### Options

- `--file <path>` - Path to JSONL dataset file (default: `val/train.jsonl`)
- `--limit <n>` - Number of examples to evaluate per model (default: `10`)
- `--models <csv>` - Comma-separated OpenRouter model IDs (default: see below)
- `--out <path>` - Output markdown report path (optional, defaults to `runs/<timestamp>.md`)
- `--concurrency <n>` - Number of concurrent requests per model (default: `2`)

### Default Models

If `--models` is not specified, the following models are evaluated:

- `meta-llama/llama-3.3-70b-instruct:free`
- `nousresearch/hermes-3-llama-3.1-405b:free`
- `google/gemini-2.0-flash-exp:free`
- `google/gemma-3-12b-it:free`
- `mistralai/mistral-small-3.1-24b-instruct:free`

### Examples

**Evaluate 50 examples with default models:**
```bash
checkmate-factbench --file val/train.jsonl --limit 50
```

**Evaluate specific models:**
```bash
checkmate-factbench --file val/train.jsonl --models "google/gemini-2.0-flash-exp:free,meta-llama/llama-3.3-70b-instruct:free" --limit 20
```

**Custom output path and higher concurrency:**
```bash
checkmate-factbench --file val/train.jsonl --limit 100 --out results.md --concurrency 5
```

## Output

The CLI generates:

1. **Markdown Report** (`runs/<timestamp>.md` or custom `--out` path):
   - Summary statistics for each model
   - Confusion matrices
   - Accuracy and invalid rate metrics
   - Per-model breakdowns

2. **Raw Results** (`runs/<timestamp>/raw/`):
   - JSONL files for each model with detailed evaluation results
   - Each file contains all predictions, latencies, and metadata

3. **Cache** (`.cache/`):
   - Cached results to avoid re-evaluating the same examples
   - Speeds up subsequent runs with overlapping datasets

## Live UI

During evaluation, you'll see a live terminal UI showing:

- Current model being evaluated
- Progress (completed/total examples)
- Real-time accuracy for each model
- Output file paths
- Summary statistics as they're computed

Example output:
```
Checkmate FactBench — OpenRouter validation
file: val/train.jsonl | limit: 10 | concurrency: 2
models: google/gemini-2.0-flash-exp:free, meta-llama/llama-3.3-70b-instruct:free
labels: SUPPORTS, REFUTES, NOT ENOUGH INFO
---
current: google/gemini-2.0-flash-exp:free (7/10)
outputs: runs/2025-12-12T18-33-54-221Z.md (raw: runs/2025-12-12T18-33-54-221Z/raw/)
---
google/gemini-2.0-flash-exp:free: acc 80.0% (8/10) | invalid 0.0%
meta-llama/llama-3.3-70b-instruct:free: pending…
Running…
```

## Environment Variables

- `OPENROUTER_API_KEY` (required) - Your OpenRouter API key

## Development

To run from source:

```bash
# Install dependencies
bun install

# Run the CLI
OPENROUTER_API_KEY=your_key bun run dev -- --file val/train.jsonl --limit 10

# Build
bun run build
```

## Dataset Format

The JSONL file should contain one JSON object per line:

```typescript
{
  id: number | string;           // Unique identifier
  claim: string;                  // The claim to evaluate
  label: "SUPPORTS" | "REFUTES" | "NOT ENOUGH INFO";  // Gold label
  verifiable?: "VERIFIABLE" | "NOT VERIFIABLE";       // Optional
}
```

## How It Works

1. **Load Dataset**: Reads examples from the specified JSONL file
2. **Check Cache**: Looks for previously evaluated examples to avoid redundant API calls
3. **Evaluate Models**: For each model:
   - Evaluates cached examples (instant)
   - Evaluates new examples via OpenRouter API
   - Updates cache with new results
4. **Generate Reports**: Creates markdown report and saves raw JSONL results
5. **Display Results**: Shows live progress and final statistics

## License

MIT
