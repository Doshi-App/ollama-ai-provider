# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of `@doshi/ollama` — Ollama provider for Vercel AI SDK v6.
- `createOllama()` factory and `ollama` singleton implementing `LanguageModelV3`.
- Automatic JSON-instruction injection when `Output.object({ schema })` is used:
  renders the schema as a human-readable instruction (with `.describe()`
  annotations, enum unions, numeric ranges, defaults) and appends it to the
  system prompt.
- Directives appended to the auto-injected instruction that steer
  reasoning-heavy models (`gpt-oss`, `qwen3-thinking`) away from emitting JSON
  inside their `message.thinking` block.
- `message.thinking` surfaced as AI SDK reasoning content, both in
  `generateText` (`result.reasoningText`) and in `streamText`
  (`reasoning-start` / `reasoning-delta` / `reasoning-end` parts).
- `jsonrepair` applied to model output before parsing — recovers from markdown
  fences, trailing commas, single quotes, smart quotes, and minor truncation.
- Full V3 stream protocol support: `stream-start`, `text-start`, `text-delta`,
  `text-end`, `finish` with `{ unified, raw }` finish reasons.
- Warnings for prompt content Ollama can't accept (image / file / tool-call
  parts, tool-result messages) instead of silently dropping.
- Dual ESM + CJS build with TypeScript declarations.
- 44 tests covering: unit (JSON repair, schema renderer), integration
  (drop-in compatibility against real AI SDK v6 patterns), end-to-end
  (package builds, packs, and installs into a fresh project as both ESM and
  CJS consumer).
