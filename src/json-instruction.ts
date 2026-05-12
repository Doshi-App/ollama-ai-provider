import type { JSONSchema7 } from '@ai-sdk/provider';
import { jsonSchemaToInstruction } from './json-schema-renderer';

/**
 * Wraps a schema-derived shape with directives appended to the system prompt
 * whenever a consumer calls `Output.object({ schema })`. The directives:
 *
 *   1. Restate the JSON-mode contract (Ollama's `format` already enforces this
 *      server-side, but the reminder helps).
 *   2. Tell reasoning-heavy models (gpt-oss, qwen3-thinking, etc.) NOT to emit
 *      the JSON inside their internal `<think>` / `message.thinking` block.
 *      Without this, those models occasionally consume the entire output-token
 *      budget on reasoning and return `content: ''`.
 *   3. Discourage prose and markdown fences around the JSON.
 *
 * Lives alongside the provider (not inside `json-schema-renderer`) because
 * these are Ollama-specific behaviors; the renderer stays pure.
 */
export function buildJsonInstructionBlock(schema: JSONSchema7): string {
  const shape = jsonSchemaToInstruction(schema);
  return [
    'Respond with a JSON object that matches the schema below.',
    'Put the JSON in your reply content — not in <think>, reasoning, or any analysis block.',
    'Return only the JSON object, no prose, no markdown fences.',
    '',
    shape,
  ].join('\n');
}
