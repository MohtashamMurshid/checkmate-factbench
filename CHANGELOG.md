# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-12-12

### Improved

- **Enhanced Type Safety**: Removed all `any` types and added proper TypeScript types throughout the codebase
- **Better Error Handling**: Added comprehensive input validation and more descriptive error messages
- **Improved Documentation**: Added JSDoc comments to all public functions and types
- **Robust Validation**: Added validation for all function parameters with clear error messages
- **Better Cache Handling**: Improved cache loading with better error handling for invalid entries
- **Enhanced JSONL Parsing**: Added line-by-line error reporting for malformed JSON in dataset files
- **Usage Tracking**: Improved type safety for token usage tracking from API responses

### Fixed

- Fixed type safety issues with usage metadata extraction
- Improved error messages to include line numbers and context
- Better handling of edge cases in argument parsing

### Technical Improvements

- All functions now include parameter validation
- Better separation of concerns with improved function documentation
- More consistent error handling patterns across the codebase
- Improved type definitions for better IDE support and developer experience

## [0.1.0] - 2025-12-12

### Added

- Initial release of Checkmate FactBench CLI tool
- FEVER dataset evaluation framework for benchmarking LLMs on factual accuracy
- Command-line interface with support for multiple OpenRouter models
- Real-time terminal UI showing evaluation progress and metrics
- Smart caching system to avoid re-evaluating the same examples across runs
- Markdown report generation with confusion matrices and accuracy metrics
- Raw JSONL output files for detailed analysis
- Configurable concurrency for parallel evaluation
- Support for evaluating multiple models in a single run
- Label normalization for robust handling of various label formats
- Progress tracking with detailed statistics (accuracy, invalid rate, confusion matrices)
- Default model configuration with 5 popular free models:
  - `meta-llama/llama-3.3-70b-instruct:free`
  - `nousresearch/hermes-3-llama-3.1-405b:free`
  - `google/gemini-2.0-flash-exp:free`
  - `google/gemma-3-12b-it:free`
  - `mistralai/mistral-small-3.1-24b-instruct:free`

### CLI Features

- `--file` option to specify JSONL dataset file path
- `--limit` option to control number of examples per model
- `--models` option to specify comma-separated list of model IDs
- `--out` option to specify custom output markdown report path
- `--concurrency` option to configure concurrent requests per model
- Automatic timestamped output directories (`runs/<timestamp>/`)
- Environment variable support for `OPENROUTER_API_KEY`

### Library Exports

- `evaluateModels` - Main evaluation function
- `evaluateModelExamples` - Evaluate examples for a single model
- `normalizePredictedLabel` - Label normalization utility
- `createConfusionMatrix` - Confusion matrix creation
- `recordPrediction` - Record predictions in confusion matrix
- `sumConfusionMatrix` - Calculate total predictions
- `correctFromConfusionMatrix` - Calculate correct predictions
- Type definitions for `FeverExample`, `ModelEvalSummary`, `RunConfig`, `RunProgressEvent`, etc.

### Technical Details

- Built with Bun runtime
- Uses OpenTUI/React for terminal UI
- TypeScript with full type definitions
- ESM and CommonJS builds included
- MIT License

[0.2.0]: https://github.com/MohtashamMurshid/checkmate-factbench/releases/tag/v0.2.0
[0.1.0]: https://github.com/MohtashamMurshid/checkmate-factbench/releases/tag/v0.1.0

