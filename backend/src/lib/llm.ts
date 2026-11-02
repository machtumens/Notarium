import type { Env } from './env';

/**
 * One chat-completions call with failover. Tries each Gemini key in order (GEMINI_API_KEY,
 * GEMINI_API_KEY_2, GEMINI_API_KEY_3), then DeepSeek. Every provider speaks the OpenAI
 * chat-completions shape, so callers keep parsing `choices[0].message.content` as before.
 *
 * A key moves on to the next on any non-2xx (429 quota, 401 revoked, 5xx outage) or network error.
 * Free-tier quota is per Google Cloud project, so keys only add headroom when each comes from a
 * different project.
 */
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
// ponytail: thinking tokens count against max_tokens on Gemini; a flat headroom keeps answers from
// being cut off. Raise it if long quizzes come back truncated.
const GEMINI_THINKING_HEADROOM = 1024;

type Provider = { url: string; key: string; model: string; gemini: boolean };

export function llmProviders(env: Env): Provider[] {
  const model = env.GEMINI_MODEL || 'gemini-3.8-flash';
  const gemini = [env.GEMINI_API_KEY, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3]
    .filter((k): k is string => !!k)
    .map((key) => ({ url: GEMINI_URL, key, model, gemini: true }));
  const deepseek = env.DEEPSEEK_API_KEY
    ? [{ url: DEEPSEEK_URL, key: env.DEEPSEEK_API_KEY, model: 'deepseek-chat', gemini: false }]
    : [];
  return [...gemini, ...deepseek];
}

export const hasLlm = (env: Env) => llmProviders(env).length > 0;

/** Same call shape as `fetch(url, init)`: `init.body` is the JSON chat body; its `model` is replaced. */
export async function llmFetch(
  env: Env,
  init: { method?: string; headers?: Record<string, string>; body: string },
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const providers = llmProviders(env);
  if (providers.length === 0) throw new Error('AI service not configured');
  const base = JSON.parse(init.body) as Record<string, unknown>;
  let last: Response | null = null;
  let lastError: unknown = null;
  for (const p of providers) {
    const body: Record<string, unknown> = { ...base, model: p.model };
    if (p.gemini) {
      body.reasoning_effort = 'low';
      if (typeof body.max_tokens === 'number') body.max_tokens += GEMINI_THINKING_HEADROOM;
    }
    try {
      const res = await fetcher(p.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
        body: JSON.stringify(body),
      });
      if (res.ok) return res;
      last = res;
    } catch (e) {
      lastError = e;
    }
  }
  if (last) return last;
  throw lastError instanceof Error ? lastError : new Error('AI provider unreachable');
}
