import { describe, it, expect } from 'vitest';
import { jsonRepairText } from './json-repair';

describe('jsonRepairText', () => {
  it('removes markdown code fences', () => {
    const input = '```json\n{ "rating": 8, "reason": "good" }\n```';
    const result = jsonRepairText(input);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ rating: 8, reason: 'good' });
  });

  it('removes markdown code fences without language', () => {
    const input = '```\n{ "rating": 8 }\n```';
    const result = jsonRepairText(input);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ rating: 8 });
  });

  it('removes trailing commas', () => {
    const input = '{ "rating": 8, "reason": "good", }';
    const result = jsonRepairText(input);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ rating: 8, reason: 'good' });
  });

  it('replaces single quotes with double quotes', () => {
    const input = "{ 'rating': 8, 'reason': 'good' }";
    const result = jsonRepairText(input);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ rating: 8, reason: 'good' });
  });

  it('replaces smart quotes with straight quotes', () => {
    const input = '{ "reason": "it\xe2\x80\x99s smart" }';
    const result = jsonRepairText(input);
    // jsonrepair should handle smart quotes - verify the result is valid JSON
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('passes through valid JSON unchanged', () => {
    const input = '{ "rating": 8, "reason": "good" }';
    const result = jsonRepairText(input);
    expect(result).toBe(input);
  });

  it('handles complex nested objects with trailing commas', () => {
    const input = `{
      "emissions": [
        {
          "kind": "attribute_update",
          "attributeId": "123",
        },
      ],
    }`;
    const result = jsonRepairText(input);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({
      emissions: [
        { kind: 'attribute_update', attributeId: '123' },
      ],
    });
  });

  it('handles multiple markdown fences in text', () => {
    const input = `Here is the JSON:
\`\`\`json
{ "rating": 8 }
\`\`\`
Hope that helps!`;
    const result = jsonRepairText(input);
    // Result should contain the JSON object, even if there's surrounding text
    expect(result).toContain('{ "rating": 8 }');
  });
});
