import type {
  LanguageModelV3StreamPart,
  SharedV3Warning,
} from '@ai-sdk/provider';
import { jsonRepairText } from './json-repair';
import { buildUsage, mapOllamaFinishReason } from './response';
import type { OllamaStreamChunk } from './types';

interface OllamaToV3StreamArgs {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  isJsonMode: boolean;
  warnings: SharedV3Warning[];
}

/**
 * Converts Ollama's NDJSON `/api/chat?stream=true` byte stream into an AI SDK
 * V3 `LanguageModelV3StreamPart` ReadableStream.
 *
 * Protocol emitted (in order):
 *   stream-start
 *   reasoning-start? → reasoning-delta* → reasoning-end?
 *   text-start → text-delta* → text-end
 *   finish
 *
 * JSON-mode quirk: in JSON mode we buffer all `content` deltas (rather than
 * streaming them) so we can run `jsonrepair` on the accumulated text before
 * emitting it. This costs progressive UX (one delta at the end), but
 * `Output.object().parsePartialOutput` already requires the full JSON to
 * resolve, so callers using structured output wait for completion regardless.
 */
export function buildV3StreamFromOllama({
  reader,
  isJsonMode,
  warnings,
}: OllamaToV3StreamArgs): ReadableStream<LanguageModelV3StreamPart> {
  const decoder = new TextDecoder();
  const textId = randomId();
  const reasoningId = randomId();

  return new ReadableStream<LanguageModelV3StreamPart>({
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
        if (textStarted) return;
        if (reasoningStarted) {
          controller.enqueue({ type: 'reasoning-end', id: reasoningId });
          reasoningStarted = false;
        }
        controller.enqueue({ type: 'text-start', id: textId });
        textStarted = true;
      };

      const startReasoningIfNeeded = () => {
        if (reasoningStarted || textStarted) return;
        controller.enqueue({ type: 'reasoning-start', id: reasoningId });
        reasoningStarted = true;
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });

          let nl: number;
          while ((nl = pending.indexOf('\n')) !== -1) {
            const line = pending.slice(0, nl).trim();
            pending = pending.slice(nl + 1);
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
                startTextIfNeeded();
                controller.enqueue({
                  type: 'text-delta',
                  id: textId,
                  delta: jsonRepairText(buffered),
                });
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
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 15);
}
