/**
 * Smoke test against real Ollama Cloud.
 *
 * Mirrors the canonical AI SDK v6 consumer pattern so a passing run proves
 * the package is a drop-in replacement for other providers (OpenAI, Anthropic,
 * etc.) at this surface area.
 *
 * Requires OLLAMA_API_KEY in env (or .env).
 */
import { config } from 'dotenv';
config();

import { generateText, streamText, Output } from 'ai';
import { jsonSchema } from '@ai-sdk/provider-utils';
import { createOllama, jsonSchemaToInstruction } from '../src';

const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;

if (!OLLAMA_API_KEY) {
  console.error('OLLAMA_API_KEY environment variable is required.');
  console.error('Usage: OLLAMA_API_KEY=your-key pnpm smoke');
  process.exit(1);
}

const ollama = createOllama({ apiKey: OLLAMA_API_KEY });

const RatingSchema = jsonSchema<{ rating: number; reason: string }>({
  type: 'object',
  properties: {
    rating: {
      type: 'number',
      minimum: 0,
      maximum: 10,
      description: 'Quality score from 0 to 10',
    },
    reason: {
      type: 'string',
      description: 'Explanation for the rating',
    },
  },
  required: ['rating', 'reason'],
  additionalProperties: false,
});

const StatusSchema = jsonSchema<{
  status: 'success' | 'warning' | 'error';
  confidence: number;
  message: string;
}>({
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['success', 'warning', 'error'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    message: { type: 'string' },
  },
  required: ['status', 'confidence', 'message'],
});

async function testInstruction() {
  console.log('\n[1/4] jsonSchemaToInstruction');
  console.log(
    jsonSchemaToInstruction({
      type: 'object',
      properties: {
        rating: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description: 'Quality score from 0 to 10',
        },
        reason: { type: 'string', description: 'Explanation' },
      },
      required: ['rating', 'reason'],
    }),
  );
}

async function testPlainGenerate() {
  console.log('\n[2/4] generateText (plain)');
  const { text } = await generateText({
    model: ollama('gpt-oss:20b-cloud'),
    prompt: 'Say "Hello from Ollama!" in exactly 3 words.',
    maxOutputTokens: 20,
  });
  console.log('text:', text);
}

async function testStructured() {
  console.log('\n[3/4] generateText + Output.object() (the PRD pattern)');
  const result = await generateText({
    model: ollama('gpt-oss:20b-cloud'),
    output: Output.object({ schema: RatingSchema }),
    system: 'You are a strict content evaluator.',
    prompt: 'Rate this content on quality: "Hello world".',
    maxOutputTokens: 1000,
  });
  console.log('result.text:', result.text);
  console.log('result.finishReason:', result.finishReason);
  console.log('result.output:', result.output);
  if (typeof result.output.rating !== 'number') {
    throw new Error('result.output.rating is not a number');
  }
}

async function testStreaming() {
  console.log('\n[4/4] streamText + Output.object()');
  const result = streamText({
    model: ollama('gpt-oss:20b-cloud'),
    output: Output.object({ schema: StatusSchema }),
    prompt:
      'Analyze the phrase "Hello world" and return your verdict. Return status, confidence (0-1), and a short message.',
    maxOutputTokens: 1000,
  });
  let chars = 0;
  for await (const _delta of result.textStream) chars++;
  console.log('chunks received:', chars);
  console.log('result.text:', await result.text);
  console.log('result.output:', await result.output);
}

async function main() {
  console.log('Smoke test for @doshi/ollama');
  console.log('API Key:', OLLAMA_API_KEY!.slice(0, 8) + '...');
  await testInstruction();
  await testPlainGenerate();
  await testStructured();
  await testStreaming();
  console.log('\nAll smoke tests passed.');
}

main().catch((err) => {
  console.error('\nSmoke tests FAILED:', err);
  process.exit(1);
});
