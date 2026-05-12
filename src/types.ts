/**
 * Internal type definitions for the shape of Ollama's `/api/chat` HTTP payload.
 *
 * Mirrors the format documented at
 * https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion
 * plus the `thinking` field that reasoning-capable Cloud models (e.g.
 * `gpt-oss:20b-cloud`) include alongside `content`.
 */

export interface OllamaChatResponse {
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

export interface OllamaStreamChunk {
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
