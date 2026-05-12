import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
  SharedV3Headers,
} from '@ai-sdk/provider';
import { combineHeaders } from '@ai-sdk/provider-utils';
import { jsonRepairText } from './json-repair';
import { buildRequestBody } from './request';
import {
  buildUsage,
  mapOllamaFinishReason,
  parseOllamaResponse,
} from './response';
import { buildV3StreamFromOllama } from './stream';

export interface OllamaLanguageModelOptions {
  modelId: string;
  baseURL: string;
  apiKey?: string;
  headers?: SharedV3Headers;
  fetch?: typeof fetch;
}

export class OllamaLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';
  readonly provider = 'ollama';
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  private readonly baseURL: string;
  private readonly apiKey?: string;
  private readonly headers?: SharedV3Headers;
  private readonly fetch: typeof fetch;

  constructor(options: OllamaLanguageModelOptions) {
    this.modelId = options.modelId;
    this.baseURL = options.baseURL;
    this.apiKey = options.apiKey;
    this.headers = options.headers;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const { body, isJsonMode, warnings } = buildRequestBody(
      this.modelId,
      options,
      { stream: false },
    );

    const response = await this.callApi(body, options);
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
      usage: buildUsage(
        ollamaResponse.prompt_eval_count,
        ollamaResponse.eval_count,
      ),
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const { body, isJsonMode, warnings } = buildRequestBody(
      this.modelId,
      options,
      { stream: true },
    );

    const response = await this.callApi(body, options);
    const stream = buildV3StreamFromOllama({
      reader: response.body!.getReader(),
      isJsonMode,
      warnings,
    });
    return { stream };
  }

  private async callApi(
    body: unknown,
    options: LanguageModelV3CallOptions,
  ): Promise<Response> {
    const response = await this.fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: this.buildHeaders(options.headers),
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }
    return response;
  }

  private buildHeaders(
    callHeaders: Record<string, string | undefined> | undefined,
  ): SharedV3Headers {
    const base: SharedV3Headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) base.Authorization = `Bearer ${this.apiKey}`;
    return combineHeaders(
      base,
      this.headers ?? {},
      callHeaders ?? {},
    ) as SharedV3Headers;
  }
}
