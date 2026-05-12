import type { SharedV3Warning } from '@ai-sdk/provider';

/**
 * Flattens an AI SDK V3 message-content value (string OR array of typed parts)
 * into the plain string that Ollama's `/api/chat` accepts.
 *
 * Reasoning parts on the way IN are dropped silently (the model produces them,
 * not the prompt). Image, file, tool-call, and other rich parts that Ollama
 * cannot represent surface as `unsupported` warnings rather than disappearing.
 */
export function extractTextContent(content: unknown): {
  text: string;
  warnings: SharedV3Warning[];
} {
  if (typeof content === 'string') return { text: content, warnings: [] };
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
      // Reasoning is provider-output, not provider-input. Silently drop.
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
