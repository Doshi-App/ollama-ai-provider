import type {
  LanguageModelV3,
  SharedV3Headers,
} from '@ai-sdk/provider';
import { OllamaLanguageModel } from './language-model';

export interface OllamaProviderSettings {
  /**
   * Base URL for the Ollama HTTP API. Defaults to Ollama Cloud
   * (`https://ollama.com`). Override to point at a self-hosted instance.
   */
  baseURL?: string;
  /**
   * API key for Ollama Cloud. Sent as `Authorization: Bearer <key>`.
   * Not required when calling a local Ollama daemon.
   */
  apiKey?: string;
  /** Extra headers merged into every request. */
  headers?: SharedV3Headers;
  /** Custom fetch implementation (for testing, proxying, telemetry). */
  fetch?: typeof fetch;
}

/**
 * Function-style provider: call it with a model id to get a `LanguageModelV3`
 * compatible with `generateText` / `streamText` from the `ai` package.
 *
 *     const result = await generateText({
 *       model: ollama('gpt-oss:20b-cloud'),
 *       output: Output.object({ schema }),
 *       prompt: '...',
 *     });
 */
export interface OllamaProvider {
  (modelId: string): LanguageModelV3;
}

export function createOllama(
  options: OllamaProviderSettings = {},
): OllamaProvider {
  const baseURL = options.baseURL ?? 'https://ollama.com';
  const apiKey = options.apiKey;
  const headers = options.headers;
  const fetchImpl = options.fetch ?? globalThis.fetch;

  return (modelId: string) =>
    new OllamaLanguageModel({
      modelId,
      baseURL,
      apiKey,
      headers,
      fetch: fetchImpl,
    });
}

/**
 * Default singleton, configured from environment:
 *   OLLAMA_BASE_URL — optional, defaults to https://ollama.com
 *   OLLAMA_API_KEY  — required for Ollama Cloud
 */
export const ollama: OllamaProvider = createOllama({
  baseURL: process.env.OLLAMA_BASE_URL,
  apiKey: process.env.OLLAMA_API_KEY,
});
