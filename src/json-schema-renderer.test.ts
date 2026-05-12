import { describe, it, expect } from 'vitest';
import { jsonSchemaToInstruction } from './json-schema-renderer';

describe('jsonSchemaToInstruction', () => {
  it('generates simple object instruction with primitives', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        rating: { type: 'number' as const, minimum: 0, maximum: 10 },
        reason: { type: 'string' as const },
      },
      required: ['rating', 'reason'],
      additionalProperties: false,
    };

    const result = jsonSchemaToInstruction(schema);

    expect(result).toContain('rating');
    expect(result).toContain('number');
    expect(result).toContain('reason');
    expect(result).toContain('string');
  });

  it('includes descriptions from schema', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        rating: {
          type: 'number' as const,
          minimum: 0,
          maximum: 10,
          description: 'Quality score from 0 to 10',
        },
        reason: {
          type: 'string' as const,
          description: 'Explanation for the rating',
        },
      },
      required: ['rating', 'reason'],
    };

    const result = jsonSchemaToInstruction(schema);

    expect(result).toContain('Quality score from 0 to 10');
    expect(result).toContain('Explanation for the rating');
  });

  it('handles arrays with object items', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        emissions: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              kind: { type: 'string' as const },
              attributeId: { type: 'string' as const },
            },
            required: ['kind', 'attributeId'],
          },
        },
      },
      required: ['emissions'],
    };

    const result = jsonSchemaToInstruction(schema);

    expect(result).toContain('emissions');
    expect(result).toMatch(/\[/);
    expect(result).toContain('kind');
    expect(result).toContain('attributeId');
  });

  it('handles enums (anyOf with const values)', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        kind: {
          anyOf: [
            { const: 'attribute_update' },
            { const: 'goal_records' },
            { const: 'literacy_contribution' },
          ],
        },
      },
      required: ['kind'],
    };

    const result = jsonSchemaToInstruction(schema);

    expect(result).toContain('attribute_update');
    expect(result).toContain('goal_records');
    expect(result).toContain('literacy_contribution');
    expect(result).toContain('|');
  });

  it('handles nested objects', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        rubric: {
          type: 'object' as const,
          properties: {
            criteria: { type: 'string' as const },
            score: { type: 'number' as const },
          },
          required: ['criteria', 'score'],
        },
      },
      required: ['rubric'],
    };

    const result = jsonSchemaToInstruction(schema);

    expect(result).toContain('rubric');
    expect(result).toContain('criteria');
    expect(result).toContain('score');
  });

  it('handles optional fields', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        required: { type: 'string' as const },
        optional: { type: 'string' as const },
      },
      required: ['required'],
    };

    const result = jsonSchemaToInstruction(schema);

    expect(result).toContain('required');
    expect(result).toContain('optional');
  });

  it('handles string with enum constraints', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        type: {
          anyOf: [
            { const: 'text' },
            { const: 'choice' },
            { const: 'multi_choice' },
            { const: 'bool' },
          ],
        },
      },
      required: ['type'],
    };

    const result = jsonSchemaToInstruction(schema);

    expect(result).toContain('text');
    expect(result).toContain('choice');
    expect(result).toContain('multi_choice');
    expect(result).toContain('bool');
  });

  it('handles complex nested schema like DraftEmissions', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        emissions: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              kind: {
                anyOf: [
                  { const: 'attribute_update' },
                  { const: 'goal_records' },
                  { const: 'literacy_contribution' },
                ],
              },
              attributeId: { type: 'string' as const },
              responseMapping: {
                type: 'object' as const,
                properties: {
                  value: { type: 'string' as const },
                },
                required: ['value'],
              },
            },
            required: ['kind', 'attributeId', 'responseMapping'],
          },
        },
      },
      required: ['emissions'],
    };

    const result = jsonSchemaToInstruction(schema);

    expect(result).toContain('emissions');
    expect(result).toContain('kind');
    expect(result).toContain('attributeId');
    expect(result).toContain('responseMapping');
    expect(result).toContain('attribute_update');
  });

  it('handles oneOf discriminated unions', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        slide: {
          oneOf: [
            {
              type: 'object' as const,
              properties: {
                type: { const: 'text' },
                content: { type: 'string' as const },
              },
              required: ['type', 'content'],
            },
            {
              type: 'object' as const,
              properties: {
                type: { const: 'choice' },
                question: { type: 'string' as const },
                choices: {
                  type: 'array' as const,
                  items: { type: 'string' as const },
                },
              },
              required: ['type', 'question', 'choices'],
            },
          ],
        },
      },
      required: ['slide'],
    };

    const result = jsonSchemaToInstruction(schema);

    expect(result).toContain('slide');
    expect(result).toContain('text');
    expect(result).toContain('choice');
  });

  it('handles number with min/max', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        score: {
          type: 'number' as const,
          minimum: 0,
          maximum: 100,
        },
      },
      required: ['score'],
    };

    const result = jsonSchemaToInstruction(schema);

    expect(result).toContain('score');
    expect(result).toContain('0');
    expect(result).toContain('100');
  });

  it('handles boolean fields', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        isActive: { type: 'boolean' as const },
      },
      required: ['isActive'],
    };

    const result = jsonSchemaToInstruction(schema);

    expect(result).toContain('isActive');
    expect(result).toContain('boolean');
  });

  it('renders a Doshi-style scenario emission schema as a stable snapshot', () => {
    // Mirrors the shape Zod produces for the draftEmissions schema described in
    // the PRD (line 267+). This snapshot is the contract between the package and
    // the Doshi server's manually written *_JSON_INSTRUCTION constants — if it
    // regresses, the auto-injected instruction will diverge from prod prompts.
    const schema = {
      type: 'object' as const,
      properties: {
        emissions: {
          type: 'array' as const,
          description: 'Pick exactly the kinds that fit the question',
          items: {
            type: 'object' as const,
            properties: {
              kind: {
                type: 'string' as const,
                enum: ['attribute_update', 'goal_records', 'literacy_contribution'],
              },
              attributeId: {
                type: 'string' as const,
                description: 'one of the allowed attribute ids',
              },
              responseMapping: {
                type: 'object' as const,
                properties: {
                  value: { type: 'string' as const },
                },
                required: ['value'],
              },
            },
            required: ['kind', 'attributeId', 'responseMapping'],
          },
        },
      },
      required: ['emissions'],
    };

    expect(jsonSchemaToInstruction(schema)).toMatchInlineSnapshot(`
      "{
        // Pick exactly the kinds that fit the question
        "emissions": [
          {
            "kind": "attribute_update" | "goal_records" | "literacy_contribution",
            // one of the allowed attribute ids
            "attributeId": <string>,
            "responseMapping": {
              "value": <string>,
            },
          },
          // ...
        ],
      }"
    `);
  });

  it('renders array-with-description without duplicating the description', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        emissions: {
          type: 'array' as const,
          description: 'Pick exactly the kinds that fit the question',
          items: {
            type: 'object' as const,
            properties: {
              kind: { type: 'string' as const, enum: ['attribute_update', 'goal_records'] },
            },
            required: ['kind'],
          },
        },
      },
      required: ['emissions'],
    };

    const result = jsonSchemaToInstruction(schema);

    // The description should appear exactly once
    const matches = result.match(/Pick exactly the kinds that fit the question/g) ?? [];
    expect(matches.length).toBe(1);

    // The item shape should be properly indented inside the array
    expect(result).toContain('"emissions":');
    expect(result).toContain('"kind":');
    expect(result).toContain('"attribute_update"');
    // No bare "[ // array" line followed by an unindented object
    expect(result).not.toMatch(/^\[/m);
  });

  it('renders default values inline so the model knows what is optional', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        retries: {
          type: 'integer' as const,
          default: 3,
        },
        verbose: {
          type: 'boolean' as const,
          default: false,
        },
      },
    };

    const result = jsonSchemaToInstruction(schema);

    expect(result).toContain('default: 3');
    expect(result).toContain('default: false');
  });

  it('renders string enum (the shape Zod\'s z.enum produces) as union of literals', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string' as const,
          enum: ['success', 'warning', 'error'],
        },
      },
      required: ['status'],
    };

    const result = jsonSchemaToInstruction(schema);

    expect(result).toContain('"success"');
    expect(result).toContain('"warning"');
    expect(result).toContain('"error"');
    expect(result).toContain('|');
  });
});
