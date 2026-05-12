import type {
  JSONSchema7,
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  SharedV3Headers,
  SharedV3Warning,
} from '@ai-sdk/provider';
import { combineHeaders } from '@ai-sdk/provider-utils';
import { jsonSchemaToInstruction } from './json-schema-to-instruction';
import { jsonRepairText } from './json-repair';

export interface OllamaProviderSettings {
  baseURL?: string;
  apiKey?: string;
  headers?: SharedV3Headers;
  fetch?: typeof fetch;
}

export interface OllamaProvider {
  (modelId: string): LanguageModelV3;
}

interface OllamaChatResponse {
  model: string;
  message: {
    role: string;
    content: string;
    thinking?: string;
  };
  done: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaStreamChunk {
  model: string;
  message?: {
    role?: string;
    content?: string;
    thinking?: string;
  };
  done: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export function createOllama(options: OllamaProviderSettings = {}): OllamaProvider {
  const baseURL = options.baseURL ?? 'https://ollama.com';
  const apiKey = options.apiKey;
  const headers = options.headers;
  const fetchImpl = options.fetch ?? globalThis.fetch;

  const provider = (modelId: string) => {
    return new OllamaLanguageModel({
      modelId,
      baseURL,
      apiKey,
      headers,
      fetch: fetchImpl,
    });
  };

  return provider;
}

class OllamaLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';
  readonly provider = 'ollama';
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  private readonly baseURL: string;
  private readonly apiKey?: string;
  private readonly headers?: SharedV3Headers;
  private readonly fetch: typeof fetch;

  constructor(options: {
    modelId: string;
    baseURL: string;
    apiKey?: string;
    headers?: SharedV3Headers;
    fetch?: typeof fetch;
  }) {
    this.modelId = options.modelId;
    this.baseURL = options.baseURL;
    this.apiKey = options.apiKey;
    this.headers = options.headers;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  private getHeaders(options: {
    headers?: Record<string, string | undefined>;
  }) {
    const baseHeaders: SharedV3Headers = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      baseHeaders.Authorization = `Bearer ${this.apiKey}`;
    }

    return combineHeaders(
      baseHeaders,
      this.headers ?? {},
      options.headers ?? {},
    ) as SharedV3Headers;
  }

  private getEndpoint(path: string) {
    return `${this.baseURL}${path}`;
  }

  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const { body, isJsonMode, warnings } = this.buildRequestBody(options, { stream: false });

    const response = await this.fetch(this.getEndpoint('/api/chat'), {
      method: 'POST',
      headers: this.getHeaders({ headers: options.headers }),
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    const ollamaResponse = parseOllamaResponse(data);

    const text = isJsonMode
      ? jsonRepairText(ollamaResponse.message.content)
      : ollamaResponse.message.content;

    const content: LanguageModelV3GenerateResult['content'] = [];
    if (ollamaResponse.message.thinking) {
      content.push({ type: 'reasoning', text: ollamaResponse.message.thinking });
    }
    content.push({ type: 'text', text });

    return {
      content,
      finishReason: mapOllamaFinishReason(ollamaResponse.done_reason),
      usage: buildUsage(ollamaResponse.prompt_eval_count, ollamaResponse.eval_count),
      warnings,
    };
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const { body, isJsonMode, warnings } = this.buildRequestBody(options, { stream: true });

    const response = await this.fetch(this.getEndpoint('/api/chat'), {
      method: 'POST',
      headers: this.getHeaders({ headers: options.headers }),
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const textId = generateId();
    const reasoningId = generateId();

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      async start(controller) {
        controller.enqueue({ type: 'stream-start', warnings });

        let textStarted = false;
        let textEnded = false;
        let reasoningStarted = false;
        let buffered = '';
        let promptTokens: number | undefined;
        let completionTokens: number | undefined;
        let pending = '';

        const startTextIfNeeded = () => {
          if (!textStarted) {
            // Close out reasoning before text begins so consumers see the right
            // ordering (reasoning → answer).
            if (reasoningStarted) {
              controller.enqueue({ type: 'reasoning-end', id: reasoningId });
              reasoningStarted = false;
            }
            controller.enqueue({ type: 'text-start', id: textId });
            textStarted = true;
          }
        };
        const startReasoningIfNeeded = () => {
          if (!reasoningStarted && !textStarted) {
            controller.enqueue({ type: 'reasoning-start', id: reasoningId });
            reasoningStarted = true;
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            pending += decoder.decode(value, { stream: true });

            let newlineIdx: number;
            while ((newlineIdx = pending.indexOf('\n')) !== -1) {
              const line = pending.slice(0, newlineIdx).trim();
              pending = pending.slice(newlineIdx + 1);
              if (!line) continue;

              let chunk: OllamaStreamChunk;
              try {
                chunk = JSON.parse(line) as OllamaStreamChunk;
              } catch {
                continue;
              }

              if (typeof chunk.prompt_eval_count === 'number') {
                promptTokens = chunk.prompt_eval_count;
              }
              if (typeof chunk.eval_count === 'number') {
                completionTokens = chunk.eval_count;
              }

              const thinkingDelta = chunk.message?.thinking;
              if (thinkingDelta && !textStarted) {
                startReasoningIfNeeded();
                controller.enqueue({
                  type: 'reasoning-delta',
                  id: reasoningId,
                  delta: thinkingDelta,
                });
              }

              const delta = chunk.message?.content;
              if (delta) {
                if (isJsonMode) {
                  buffered += delta;
                } else {
                  startTextIfNeeded();
                  controller.enqueue({ type: 'text-delta', id: textId, delta });
                }
              }

              if (chunk.done) {
                if (isJsonMode && buffered.length > 0) {
                  const repaired = jsonRepairText(buffered);
                  startTextIfNeeded();
                  controller.enqueue({ type: 'text-delta', id: textId, delta: repaired });
                }
                if (reasoningStarted) {
                  controller.enqueue({ type: 'reasoning-end', id: reasoningId });
                  reasoningStarted = false;
                }
                if (textStarted && !textEnded) {
                  controller.enqueue({ type: 'text-end', id: textId });
                  textEnded = true;
                }
                controller.enqueue({
                  type: 'finish',
                  finishReason: mapOllamaFinishReason(chunk.done_reason),
                  usage: buildUsage(promptTokens, completionTokens),
                });
                controller.close();
                return;
              }
            }
          }
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });

    return { stream };
  }

  private buildRequestBody(
    options: LanguageModelV3CallOptions,
    { stream }: { stream: boolean },
  ): {
    body: Record<string, unknown>;
    isJsonMode: boolean;
    warnings: SharedV3Warning[];
  } {
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

    const isJsonMode = responseFormat?.type === 'json' && responseFormat.schema != null;

    if (isJsonMode && responseFormat?.type === 'json' && responseFormat.schema) {
      const jsonInstruction = buildJsonInstructionBlock(responseFormat.schema);
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n${jsonInstruction}`
        : jsonInstruction;
    }

    const finalMessages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    const body: Record<string, unknown> = {
      model: this.modelId,
      messages: finalMessages,
      stream,
    };

    if (isJsonMode && responseFormat?.type === 'json' && responseFormat.schema) {
      body.format = responseFormat.schema;
    }

    return { body, isJsonMode, warnings };
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function extractTextContent(content: unknown): {
  text: string;
  warnings: SharedV3Warning[];
} {
  if (typeof content === 'string') {
    return { text: content, warnings: [] };
  }
  if (!Array.isArray(content)) {
    return { text: String(content ?? ''), warnings: [] };
  }
  const warnings: SharedV3Warning[] = [];
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part !== 'object' || part === null || !('type' in part)) continue;
    const kind = (part as { type: string }).type;
    if (kind === 'text') {
      parts.push((part as { text: string }).text);
    } else if (kind === 'reasoning') {
      // Ollama does not split reasoning from content. Drop silently — reasoning
      // is inherently provider-specific and dropping it is the documented v6
      // behavior for providers that don't surface it.
    } else {
      warnings.push({
        type: 'unsupported',
        feature: `${kind}-content-part`,
        details: `Ollama /api/chat does not accept ${kind} parts; dropping.`,
      });
    }
  }
  return { text: parts.join(''), warnings };
}

/**
 * Wraps the schema-derived shape with directives that:
 *   1. Tell the model to respond with JSON (Ollama's `format` already enforces
 *      this server-side, but a reminder reduces "empty content" failures with
 *      reasoning-heavy models like gpt-oss that otherwise dump the answer into
 *      their internal `<thinking>` block).
 *   2. Show the expected shape.
 *
 * Kept here (not in json-schema-to-instruction) because it's a provider-level
 * concern about Ollama Cloud / OpenAI-style chat completion behavior; the
 * shape renderer stays pure.
 */
function buildJsonInstructionBlock(schema: JSONSchema7): string {
  const shape = jsonSchemaToInstruction(schema);
  return [
    'Respond with a JSON object that matches the schema below.',
    'Put the JSON in your reply content — not in <think>, reasoning, or any analysis block.',
    'Return only the JSON object, no prose, no markdown fences.',
    '',
    shape,
  ].join('\n');
}

function mapOllamaFinishReason(
  reason: string | undefined
): LanguageModelV3FinishReason {
  const unified: LanguageModelV3FinishReason['unified'] =
    reason === 'stop'
      ? 'stop'
      : reason === 'length'
        ? 'length'
        : reason === 'error'
          ? 'error'
          : 'other';
  return { unified, raw: reason };
}

function buildUsage(
  promptEval: number | undefined,
  outputEval: number | undefined,
) {
  return {
    inputTokens: {
      total: promptEval,
      noCache: promptEval,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: outputEval,
      text: outputEval,
      reasoning: undefined,
    },
  };
}

function parseOllamaResponse(data: unknown): OllamaChatResponse {
  const obj = data as Record<string, unknown>;
  const message = obj?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  
  if (typeof content !== 'string') {
    throw new Error('Invalid Ollama response: content must be a string');
  }
  
  return {
    model: String(obj?.model ?? ''),
    message: {
      role: String(message?.role ?? 'assistant'),
      content,
      thinking: typeof message?.thinking === 'string' ? message.thinking : undefined,
    },
    done: Boolean(obj?.done),
    done_reason: typeof obj?.done_reason === 'string' ? obj.done_reason : undefined,
    prompt_eval_count: typeof obj?.prompt_eval_count === 'number' ? obj.prompt_eval_count : undefined,
    eval_count: typeof obj?.eval_count === 'number' ? obj.eval_count : undefined,
  };
}
