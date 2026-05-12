# @doshi/ollama-ai-provider

Ollama provider for the [Vercel AI SDK](https://sdk.vercel.ai) (v6) with
automatic JSON-instruction injection and response repair.

Use it anywhere you'd use `@ai-sdk/openai`, `@ai-sdk/anthropic`, or
`@ai-sdk/google` — same `generateText` / `streamText` API, including
`Output.object({ schema })` for typed structured output.

```ts
import { generateText, Output } from 'ai';
import { ollama } from '@doshi/ollama-ai-provider';
import { z } from 'zod';
import { zodSchema } from '@ai-sdk/provider-utils';

const Rating = zodSchema(
  z.object({
    rating: z.number().min(0).max(10).describe('Quality score'),
    reason: z.string().describe('Why this rating'),
  }),
);

const { output } = await generateText({
  model: ollama('gpt-oss:20b-cloud'),
  output: Output.object({ schema: Rating }),
  system: 'You are a content evaluator.',
  prompt: 'Rate this content: "Hello world".',
});

console.log(output); // { rating: 2, reason: '...' }
```

## Install

```sh
pnpm add @doshi/ollama-ai-provider ai
# or
npm install @doshi/ollama-ai-provider ai
```

## Why this exists

Ollama Cloud honors a JSON Schema via its native `format` field, but
reasoning-heavy models (gpt-oss, qwen3-thinking) still benefit from being told
**what shape to produce** and **where to put it** in plain English. Otherwise
they sometimes consume the entire output-token budget on internal "thinking"
and return empty content.

This package handles that automatically. Every time you use
`Output.object({ schema })`, the provider:

1. Renders your JSON Schema as a compact, readable instruction (including
   `.describe()` annotations, enum unions, ranges, defaults).
2. Appends it to the system prompt along with directives telling the model to
   put the JSON in its **reply content**, not in `<think>` / reasoning.
3. Sends the raw schema as Ollama's `format` field for server-side grammar
   constraints.
4. Repairs the response with [`jsonrepair`](https://github.com/josdejong/jsonrepair)
   before the SDK parses it (strips markdown fences, fixes trailing commas,
   etc.).

Result: `generateText({ output: Output.object(...) }).output` returns a parsed
object, reliably, with the same call signature you'd use for OpenAI.

## Configuration

```ts
import { createOllama } from '@doshi/ollama-ai-provider';

const ollama = createOllama({
  baseURL: 'https://ollama.com',     // default
  apiKey: process.env.OLLAMA_API_KEY, // required for Ollama Cloud
  headers: { 'X-Trace-Id': '...' },   // optional, merged into every request
  fetch: customFetch,                 // optional, for testing or proxying
});
```

The default singleton `ollama` reads `OLLAMA_BASE_URL` and `OLLAMA_API_KEY`
from `process.env`.

## API

```ts
// Factory
createOllama(options?: OllamaProviderSettings): OllamaProvider

// Default singleton
ollama: OllamaProvider

// The schema → human-readable instruction renderer (exported for tests)
jsonSchemaToInstruction(schema: JSONSchema7, options?): string

// The JSON repair wrapper (exported for tests)
jsonRepairText(text: string): string
```

`OllamaProvider` is callable: `ollama('model-id')` returns a `LanguageModelV3`
suitable for any AI SDK v6 helper (`generateText`, `streamText`,
`generateObject`, agents, etc.).

## Streaming

`streamText` works as in any other provider. Reasoning models'
`message.thinking` deltas are surfaced as AI SDK reasoning parts, so:

```ts
const result = streamText({ model: ollama('gpt-oss:20b-cloud'), prompt });
for await (const chunk of result.fullStream) {
  if (chunk.type === 'reasoning-delta') /* … */;
  if (chunk.type === 'text-delta')      /* … */;
}
console.log(await result.reasoningText); // model's chain-of-thought
console.log(await result.text);          // model's reply
```

In JSON mode (`output: Output.object(...)`), content deltas are buffered until
completion so the final text can be `jsonrepair`'d in one pass — necessary
because partial structured-output streams can't be repaired piecewise. Plain
streaming (no `output:`) is unbuffered.

## What's NOT supported

- **Image / file content parts in prompts** — Ollama `/api/chat` is text-only.
  Surfaces as a warning rather than silently dropping.
- **Tool calls** — the base AI SDK tool-call shape isn't wired through to
  Ollama's `tools` field yet.
- **Embeddings / reranking / speech** — text completion only for now.

## Development

```sh
pnpm install
pnpm test          # unit + integration + packaging e2e
pnpm typecheck
pnpm build         # emits dist/ (ESM + CJS + .d.ts)
pnpm smoke         # against real Ollama Cloud, needs OLLAMA_API_KEY
```

## License

MIT
