import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { generateText } from 'ai';
import { createOllama } from './ollama-provider';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Provider configuration', () => {
  it('forwards apiKey as Authorization header and merges custom headers', async () => {
    let capturedHeaders: Headers | undefined;

    server.use(
      http.post('https://ollama.com/api/chat', ({ request }) => {
        capturedHeaders = request.headers;
        return HttpResponse.json({
          model: 'm',
          message: { role: 'assistant', content: 'ok' },
          done: true,
          done_reason: 'stop',
        });
      }),
    );

    const ollama = createOllama({
      apiKey: 'test-key',
      headers: { 'X-Custom-Header': 'custom-value' },
    });

    await generateText({ model: ollama('m'), prompt: 'Test' });

    expect(capturedHeaders?.get('Authorization')).toBe('Bearer test-key');
    expect(capturedHeaders?.get('X-Custom-Header')).toBe('custom-value');
  });

  it('targets a custom baseURL when configured', async () => {
    let url: string | undefined;

    server.use(
      http.post('https://custom-ollama.example.com/api/chat', ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          model: 'm',
          message: { role: 'assistant', content: 'ok' },
          done: true,
          done_reason: 'stop',
        });
      }),
    );

    const ollama = createOllama({
      baseURL: 'https://custom-ollama.example.com',
      apiKey: 'test-key',
    });

    await generateText({ model: ollama('m'), prompt: 'Test' });

    expect(url).toBe('https://custom-ollama.example.com/api/chat');
  });

  it('uses a custom fetch implementation when provided', async () => {
    let called = false;
    const customFetch: typeof fetch = async () => {
      called = true;
      return new Response(
        JSON.stringify({
          model: 'm',
          message: { role: 'assistant', content: 'ok' },
          done: true,
          done_reason: 'stop',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    };

    const ollama = createOllama({ apiKey: 'k', fetch: customFetch });
    const result = await generateText({ model: ollama('m'), prompt: 'hi' });

    expect(called).toBe(true);
    expect(result.text).toBe('ok');
  });
});
