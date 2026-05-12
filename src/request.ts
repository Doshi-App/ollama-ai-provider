import type {
  LanguageModelV3CallOptions,
  SharedV3Warning,
} from '@ai-sdk/provider';
import { extractTextContent } from './content';
import { buildJsonInstructionBlock } from './json-instruction';

export interface BuildRequestBodyResult {
  body: Record<string, unknown>;
  /** True when the consumer asked for JSON mode via `Output.object()` etc. */
  isJsonMode: boolean;
  warnings: SharedV3Warning[];
}

/**
 * Converts AI SDK V3 call options into the body for `POST /api/chat`.
 *
 * Responsibilities:
 *   - Flatten the V3 prompt into Ollama's `{ role, content }` messages.
 *   - When JSON mode is on, render the schema as a human-readable instruction
 *     and append it to the system prompt.
 *   - When JSON mode is on, also send the raw JSON Schema as Ollama's native
 *     `format` field (server-side grammar constraint).
 *   - Collect warnings for any content the prompt contained that Ollama can't
 *     accept (image / file / tool-call parts, tool-result messages).
 */
export function buildRequestBody(
  modelId: string,
  options: LanguageModelV3CallOptions,
  { stream }: { stream: boolean },
): BuildRequestBodyResult {
  const { responseFormat, prompt } = options;
  const warnings: SharedV3Warning[] = [];

  let systemPrompt: string | undefined;
  const messages: Array<{ role: string; content: string }> = [];

  for (const message of prompt) {
    const { text, warnings: w } = extractTextContent(message.content);
    warnings.push(...w);
    if (message.role === 'system') {
      systemPrompt = text;
    } else if (message.role === 'user') {
      messages.push({ role: 'user', content: text });
    } else if (message.role === 'assistant') {
      messages.push({ role: 'assistant', content: text });
    } else if (message.role === 'tool') {
      warnings.push({
        type: 'unsupported',
        feature: 'tool-result-message',
        details: 'Ollama /api/chat does not support tool result messages; dropping.',
      });
    }
  }

  const isJsonMode =
    responseFormat?.type === 'json' && responseFormat.schema != null;

  if (isJsonMode && responseFormat?.type === 'json' && responseFormat.schema) {
    const block = buildJsonInstructionBlock(responseFormat.schema);
    systemPrompt = systemPrompt ? `${systemPrompt}\n\n${block}` : block;
  }

  const finalMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const body: Record<string, unknown> = {
    model: modelId,
    messages: finalMessages,
    stream,
  };

  if (isJsonMode && responseFormat?.type === 'json' && responseFormat.schema) {
    body.format = responseFormat.schema;
  }

  return { body, isJsonMode, warnings };
}
