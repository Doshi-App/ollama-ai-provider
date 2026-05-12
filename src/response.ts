import type {
  LanguageModelV3FinishReason,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import type { OllamaChatResponse } from './types';

export function parseOllamaResponse(data: unknown): OllamaChatResponse {
  const obj = data as Record<string, unknown>;
  const message = obj?.message as Record<string, unknown> | undefined;
  const content = message?.content;

  if (typeof content !== 'string') {
    throw new Error('Invalid Ollama response: message.content must be a string');
  }

  return {
    model: String(obj?.model ?? ''),
    message: {
      role: String(message?.role ?? 'assistant'),
      content,
      thinking:
        typeof message?.thinking === 'string' ? message.thinking : undefined,
    },
    done: Boolean(obj?.done),
    done_reason:
      typeof obj?.done_reason === 'string' ? obj.done_reason : undefined,
    prompt_eval_count:
      typeof obj?.prompt_eval_count === 'number'
        ? obj.prompt_eval_count
        : undefined,
    eval_count:
      typeof obj?.eval_count === 'number' ? obj.eval_count : undefined,
  };
}

export function mapOllamaFinishReason(
  reason: string | undefined,
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

export function buildUsage(
  promptEval: number | undefined,
  outputEval: number | undefined,
): LanguageModelV3Usage {
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
