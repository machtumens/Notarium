import { describe, it, expect } from 'vitest';
import { llmFetch } from '../llm';

describe('llmFetch failover', () => {
  it('moves past a quota-blocked Gemini key to the next one, then stops', async () => {
    const seen: string[] = [];
    const fetcher = (async (_url: string, init: RequestInit) => {
      const key = String((init.headers as Record<string, string>).Authorization);
      seen.push(key);
      return new Response('{}', { status: key.endsWith('k1') ? 429 : 200 });
    }) as unknown as typeof fetch;
    const env = { GEMINI_API_KEY: 'k1', GEMINI_API_KEY_2: 'k2', DEEPSEEK_API_KEY: 'd' } as any;
    const res = await llmFetch(
      env,
      { body: JSON.stringify({ model: 'x', max_tokens: 10 }) },
      fetcher,
    );
    expect(res.status).toBe(200);
    expect(seen).toEqual(['Bearer k1', 'Bearer k2']);
  });

  it('reports the first provider failure, not the last, when all fail', async () => {
    const fetcher = (async (url: string) =>
      new Response('{}', {
        status: url.includes('deepseek') ? 402 : 429,
      })) as unknown as typeof fetch;
    const env = { GEMINI_API_KEY: 'k1', DEEPSEEK_API_KEY: 'd' } as any;
    const res = await llmFetch(env, { body: JSON.stringify({ model: 'x' }) }, fetcher);
    expect(res.status).toBe(429);
  });

  it('falls back to DeepSeek with its own model when every Gemini key fails', async () => {
    let lastBody: any = null;
    const fetcher = (async (url: string, init: RequestInit) => {
      lastBody = JSON.parse(String(init.body));
      return new Response('{}', { status: url.includes('deepseek') ? 200 : 503 });
    }) as unknown as typeof fetch;
    const env = { GEMINI_API_KEY: 'k1', DEEPSEEK_API_KEY: 'd' } as any;
    const res = await llmFetch(env, { body: JSON.stringify({ model: 'x' }) }, fetcher);
    expect(res.status).toBe(200);
    expect(lastBody.model).toBe('deepseek-chat');
    expect(lastBody.reasoning_effort).toBeUndefined();
  });
});
