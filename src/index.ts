export { createOllama, type OllamaProvider, type OllamaProviderSettings } from './ollama-provider';
export { jsonSchemaToInstruction, type JsonSchemaToInstructionOptions } from './json-schema-to-instruction';
export { jsonRepairText } from './json-repair';

// Default singleton instance
import { createOllama } from './ollama-provider';

export const ollama = createOllama({
  baseURL: process.env.OLLAMA_BASE_URL,
  apiKey: process.env.OLLAMA_API_KEY,
});
