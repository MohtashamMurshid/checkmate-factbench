# Checkmate FactBench Results Viewer

A React web application to visualize evaluation results from Checkmate FactBench runs.

## Features

- 📊 View all evaluation runs in a sidebar
- 📈 See summary statistics for each model
- 🔍 Explore confusion matrices
- 📝 View detailed individual results
- 🎨 Clean, modern UI

## Usage

Start the viewer server:

```bash
bun run viewer
```

Then open your browser to `http://localhost:3000`

The viewer will automatically:
- Scan the `runs/` directory for evaluation results
- Parse markdown reports and JSONL data files
- Display results in an interactive web interface

## How It Works

The viewer reads data from:
- `runs/<run-id>.md` - Markdown reports with summary statistics
- `runs/<run-id>/raw/*.jsonl` - Detailed evaluation results per model

## Development

The viewer is a separate React app that doesn't affect the main package. It's excluded from npm publishing via `.npmignore`.

