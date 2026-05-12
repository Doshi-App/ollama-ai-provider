import { jsonrepair } from 'jsonrepair';

export function jsonRepairText(text: string): string {
  let repaired = text;
  
  repaired = removeMarkdownFences(repaired);
  
  try {
    repaired = jsonrepair(repaired);
  } catch {
    // jsonrepair may fail for severely malformed JSON
    // Try basic cleanup as fallback
    repaired = basicJsonCleanup(repaired);
  }
  
  return repaired;
}

function removeMarkdownFences(text: string): string {
  // Remove opening fence with optional language specifier (including newlines)
  text = text.replace(/```(?:json|javascript|js)?\s*\n?/gi, '');
  
  // Remove closing fence (including preceding newline)
  text = text.replace(/\n?```\s*/gi, '');
  
  return text.trim();
}

function basicJsonCleanup(text: string): string {
  let cleaned = text;
  
  // Replace single quotes with double quotes (simple cases)
  cleaned = cleaned.replace(/'/g, '"');
  
  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  
  // Ensure it starts with { or [
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    return match[0];
  }
  
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return arrayMatch[0];
  }
  
  return cleaned;
}
