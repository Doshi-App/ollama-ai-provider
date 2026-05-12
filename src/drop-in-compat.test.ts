/**
 * Drop-in compatibility tests.
 *
 * These verify that consumers can swap `@ai-sdk/openai` (or any other AI SDK v6
 * provider) for `@doshi/ollama-ai-provider` and get identical observable behavior, using the
 * canonical AI SDK v6 patterns:
 *
 *   const { output } = await generateText({
 *     model: ollama('gpt-oss:20b-cloud'),
 *     output: Output.object({ schema }),
 *     ...
 *   });
 *
 * If a test here fails, the package is NOT a drop-in replacement.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { generateText, Output, streamText } from 'ai';
import { jsonSchema } from '@ai-sdk/provider-utils';
import { createOllama } from './provider';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const RatingSchema = jsonSchema<{ rating: number; reason: string }>({
  type: 'object',
  properties: {
    rating: { type: 'number', minimum: 0, maximum: 10, description: 'Quality score' },
    reason: { type: 'string', description: 'Why this rating' },
  },
  required: ['rating', 'reason'],
  additionalProperties: false,
});

describe('generateText + Output.object()', () => {
  it('returns the parsed object via result.output', async () => {
    server.use(
      http.post('https://ollama.com/api/chat', () =>
        HttpResponse.json({
          model: 'gpt-oss:20b-cloud',
          message: { role: 'assistant', content: '{"rating":8,"reason":"good"}' },
          done: true,
          done_reason: 'stop',
        }),
      ),
    );

    const ollama = createOllama({ apiKey: 'test-key' });

    const result = await generateText({
      model: ollama('gpt-oss:20b-cloud'),
      output: Output.object({ schema: RatingSchema }),
      prompt: 'Rate this.',
    });

    expect(result.output).toEqual({ rating: 8, reason: 'good' });
  });

  it('surfaces finishReason on the result', async () => {
    server.use(
      http.post('https://ollama.com/api/chat', () =>
        HttpResponse.json({
          model: 'm',
          message: { role: 'assistant', content: '{"rating":1,"reason":"x"}' },
          done: true,
          done_reason: 'stop',
        }),
      ),
    );

    const ollama = createOllama({ apiKey: 'k' });

    const result = await generateText({
      model: ollama('m'),
      output: Output.object({ schema: RatingSchema }),
      prompt: 'x',
    });

    expect(result.finishReason).toBe('stop');
  });

  it('auto-injects schema-derived instruction into the system prompt', async () => {
    let body: any;
    server.use(
      http.post('https://ollama.com/api/chat', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          model: 'm',
          message: { role: 'assistant', content: '{"rating":5,"reason":"ok"}' },
          done: true,
          done_reason: 'stop',
        });
      }),
    );

    const ollama = createOllama({ apiKey: 'k' });

    await generateText({
      model: ollama('m'),
      output: Output.object({ schema: RatingSchema }),
      system: 'You are an evaluator.',
      prompt: 'rate',
    });

    const sys = body.messages.find((m: any) => m.role === 'system');
    expect(sys).toBeDefined();
    expect(sys.content).toContain('You are an evaluator.');
    // schema field names appear
    expect(sys.content).toContain('rating');
    expect(sys.content).toContain('reason');
    // schema .describe() annotations appear
    expect(sys.content).toContain('Quality score');
    expect(sys.content).toContain('Why this rating');
  });

  it('instructs the model to emit JSON in the response, not in reasoning', async () => {
    let body: any;
    server.use(
      http.post('https://ollama.com/api/chat', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          model: 'm',
          message: { role: 'assistant', content: '{"rating":5,"reason":"ok"}' },
          done: true,
          done_reason: 'stop',
        });
      }),
    );

    const ollama = createOllama({ apiKey: 'k' });
    await generateText({
      model: ollama('m'),
      output: Output.object({ schema: RatingSchema }),
      prompt: 'rate',
    });

    const sys = body.messages.find((m: any) => m.role === 'system');
    // The instruction must steer reasoning-heavy models (gpt-oss, qwen3-thinking)
    // away from emitting the JSON inside their <think> / message.thinking block.
    expect(sys.content.toLowerCase()).toMatch(/respond.*json|return.*json|output.*json/);
    expect(sys.content.toLowerCase()).toMatch(/reasoning|thinking|<think>/);
  });

  it('sends the JSON Schema as Ollama native format field', async () => {
    let body: any;
    server.use(
      http.post('https://ollama.com/api/chat', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          model: 'm',
          message: { role: 'assistant', content: '{"rating":5,"reason":"ok"}' },
          done: true,
          done_reason: 'stop',
        });
      }),
    );

    const ollama = createOllama({ apiKey: 'k' });
    await generateText({
      model: ollama('m'),
      output: Output.object({ schema: RatingSchema }),
      prompt: 'rate',
    });

    expect(body.format).toMatchObject({
      type: 'object',
      properties: expect.objectContaining({
        rating: expect.any(Object),
        reason: expect.any(Object),
      }),
      required: expect.arrayContaining(['rating', 'reason']),
    });
  });

  it('jsonrepair fixes markdown-fenced response before parsing', async () => {
    server.use(
      http.post('https://ollama.com/api/chat', () =>
        HttpResponse.json({
          model: 'm',
          message: {
            role: 'assistant',
            content: '```json\n{"rating":8,"reason":"good"}\n```',
          },
          done: true,
          done_reason: 'stop',
        }),
      ),
    );

    const ollama = createOllama({ apiKey: 'k' });
    const result = await generateText({
      model: ollama('m'),
      output: Output.object({ schema: RatingSchema }),
      prompt: 'rate',
    });

    expect(result.output).toEqual({ rating: 8, reason: 'good' });
  });

  it('jsonrepair fixes trailing commas before parsing', async () => {
    server.use(
      http.post('https://ollama.com/api/chat', () =>
        HttpResponse.json({
          model: 'm',
          message: {
            role: 'assistant',
            content: '{"rating":8,"reason":"good",}',
          },
          done: true,
          done_reason: 'stop',
        }),
      ),
    );

    const ollama = createOllama({ apiKey: 'k' });
    const result = await generateText({
      model: ollama('m'),
      output: Output.object({ schema: RatingSchema }),
      prompt: 'rate',
    });

    expect(result.output).toEqual({ rating: 8, reason: 'good' });
  });
});

describe('generateText without structured output', () => {
  it('returns plain text and does not send a format field', async () => {
    let body: any;
    server.use(
      http.post('https://ollama.com/api/chat', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          model: 'm',
          message: { role: 'assistant', content: 'Hello!' },
          done: true,
          done_reason: 'stop',
        });
      }),
    );

    const ollama = createOllama({ apiKey: 'k' });
    const result = await generateText({
      model: ollama('m'),
      prompt: 'Say hi',
    });

    expect(result.text).toBe('Hello!');
    expect(body.format).toBeUndefined();
  });
});

function ndjsonResponse(chunks: unknown[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'));
      }
      controller.close();
    },
  });
  return new HttpResponse(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

describe('streamText basics', () => {
  it('yields deltas through textStream and accumulates into .text', async () => {
    server.use(
      http.post('https://ollama.com/api/chat', () =>
        ndjsonResponse([
          { model: 'm', message: { role: 'assistant', content: 'Hello' }, done: false },
          { model: 'm', message: { role: 'assistant', content: ' ' }, done: false },
          { model: 'm', message: { role: 'assistant', content: 'World' }, done: false },
          { model: 'm', message: { role: 'assistant', content: '!' }, done: true, done_reason: 'stop' },
        ]),
      ),
    );

    const ollama = createOllama({ apiKey: 'k' });
    const result = streamText({ model: ollama('m'), prompt: 'hi' });

    const deltas: string[] = [];
    for await (const delta of result.textStream) deltas.push(delta);

    expect(deltas.join('')).toBe('Hello World!');
    expect(await result.text).toBe('Hello World!');
    expect(await result.finishReason).toBe('stop');
  });

  it('streamText with Output.object() resolves to the parsed object', async () => {
    server.use(
      http.post('https://ollama.com/api/chat', () =>
        ndjsonResponse([
          { model: 'm', message: { content: '```json\n{"rating":' }, done: false },
          { model: 'm', message: { content: '7,"reason":' }, done: false },
          { model: 'm', message: { content: '"meh"}\n```' }, done: true, done_reason: 'stop' },
        ]),
      ),
    );

    const ollama = createOllama({ apiKey: 'k' });
    const result = streamText({
      model: ollama('m'),
      output: Output.object({ schema: RatingSchema }),
      prompt: 'rate',
    });

    // drain
    for await (const _ of result.textStream) {
      /* consume */
    }

    expect(await result.output).toEqual({ rating: 7, reason: 'meh' });
  });
});

describe('Reasoning (Ollama message.thinking)', () => {
  it('surfaces message.thinking as reasoning content on generateText result', async () => {
    server.use(
      http.post('https://ollama.com/api/chat', () =>
        HttpResponse.json({
          model: 'm',
          message: {
            role: 'assistant',
            thinking: 'The user wants a rating. Hello is simple, score it low.',
            content: '{"rating":1,"reason":"trivial"}',
          },
          done: true,
          done_reason: 'stop',
        }),
      ),
    );

    const ollama = createOllama({ apiKey: 'k' });
    const result = await generateText({
      model: ollama('m'),
      output: Output.object({ schema: RatingSchema }),
      prompt: 'Rate Hello',
    });

    expect(result.output).toEqual({ rating: 1, reason: 'trivial' });
    expect(result.reasoningText).toContain('The user wants a rating');
  });

  it('streams message.thinking deltas as reasoning parts', async () => {
    server.use(
      http.post('https://ollama.com/api/chat', () =>
        ndjsonResponse([
          { model: 'm', message: { thinking: 'Let me ' }, done: false },
          { model: 'm', message: { thinking: 'think about this.' }, done: false },
          { model: 'm', message: { content: '{"rating":' }, done: false },
          { model: 'm', message: { content: '1,"reason":"x"}' }, done: true, done_reason: 'stop' },
        ]),
      ),
    );

    const ollama = createOllama({ apiKey: 'k' });
    const result = streamText({
      model: ollama('m'),
      output: Output.object({ schema: RatingSchema }),
      prompt: 'rate',
    });

    // drain
    for await (const _ of result.textStream) {
      /* consume */
    }

    expect(await result.reasoningText).toBe('Let me think about this.');
    expect(await result.output).toEqual({ rating: 1, reason: 'x' });
  });
});

describe('Provider warns rather than silently dropping unsupported content', () => {
  it('emits a warning when the prompt includes image parts', async () => {
    server.use(
      http.post('https://ollama.com/api/chat', () =>
        HttpResponse.json({
          model: 'm',
          message: { role: 'assistant', content: 'ok' },
          done: true,
          done_reason: 'stop',
        }),
      ),
    );

    const ollama = createOllama({ apiKey: 'k' });

    const result = await generateText({
      model: ollama('m'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe this' },
            { type: 'image', image: new Uint8Array([1, 2, 3]) },
          ],
        },
      ],
    });

    expect(
      result.warnings?.some((w) => /image|unsupported/i.test(JSON.stringify(w))),
    ).toBe(true);
  });
});
