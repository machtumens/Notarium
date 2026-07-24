// Provider-mocked journeys — the AI/OCR/3rd-party paths the key-absent suites
// can't reach. We temporarily enable the relevant env keys (so the Worker takes
// the provider branch) and stub globalThis.fetch to intercept the outbound call,
// returning canned provider responses. Keys + stub are torn down in afterEach so
// the key-absent H-ai suite (same worker process) stays valid.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { applySchema, resetData, call, seedUser, seedSubject, seedNote, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

// Keys we may set; always cleared after each test to avoid leakage.
const AI_KEYS = ['GOOGLE_CLOUD_VISION_API_KEY', 'DEEPSEEK_API_KEY', 'GEMINI_API_KEY'] as const;
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of AI_KEYS) delete (env as any)[k];
});

function enable(...keys: (typeof AI_KEYS)[number][]) {
  for (const k of keys) (env as any)[k] = `test-${k}`;
}

function jsonResp(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// A URL-routing fetch stub. Each provider's response (or a thrown error) is
// supplied per test; chained calls (OCR -> Vision then DeepSeek cleanup) are
// all handled by the one stub.
function stubProviders(routes: {
  vision?: () => Promise<Response> | Response;
  deepseek?: () => Promise<Response> | Response;
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('vision.googleapis.com'))
        return routes.vision ? routes.vision() : jsonResp({ responses: [{}] });
      if (u.includes('deepseek.com'))
        return routes.deepseek ? routes.deepseek() : jsonResp({ choices: [] });
      return new Response('UNMOCKED PROVIDER: ' + u, { status: 502 });
    }),
  );
}

const visionText = (text: string) => () =>
  jsonResp({ responses: [{ textAnnotations: [{ description: text }] }] });
const deepseekText = (content: string) => () => jsonResp({ choices: [{ message: { content } }] });

describe('Provider mocks: OCR (Google Vision)', () => {
  it('returns the extracted text when Vision succeeds', async () => {
    enable('GOOGLE_CLOUD_VISION_API_KEY');
    stubProviders({ vision: visionText('Photosynthesis converts light to energy.') });
    const u = await seedUser();
    const res = await call('/api/gemini/ocr', {
      method: 'POST',
      token: u.token,
      body: { imageBase64: 'data:image/png;base64,AAA' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.text).toContain('Photosynthesis');
  });

  it('degrades gracefully (5xx JSON, no crash) when Vision returns an error', async () => {
    enable('GOOGLE_CLOUD_VISION_API_KEY');
    stubProviders({ vision: () => jsonResp({ error: { message: 'quota exceeded' } }, 429) });
    const u = await seedUser();
    const res = await call('/api/gemini/ocr', {
      method: 'POST',
      token: u.token,
      body: { imageBase64: 'data:image/png;base64,AAA' },
    });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.headers.get('Content-Type') || '').toContain('application/json');
  });
});

describe('Provider mocks: auto-tags (DeepSeek)', () => {
  it('parses the model’s comma-separated tags', async () => {
    enable('DEEPSEEK_API_KEY');
    stubProviders({ deepseek: deepseekText('biologi, sel, mitosis') });
    const u = await seedUser();
    const res = await call('/api/gemini/auto-tags', {
      method: 'POST',
      token: u.token,
      body: { title: 'Bio', content: 'sel' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.tags).toEqual(expect.arrayContaining(['biologi', 'sel', 'mitosis']));
  });

  it('FINDING-adjacent resilience: a DeepSeek 5xx falls back to default tags (request still 200)', async () => {
    enable('DEEPSEEK_API_KEY');
    stubProviders({ deepseek: () => jsonResp({ error: { message: 'upstream down' } }, 503) });
    const u = await seedUser();
    const res = await call('/api/gemini/auto-tags', {
      method: 'POST',
      token: u.token,
      body: { title: 'Bio', content: 'sel' },
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(((await res.json()) as any).tags)).toBe(true);
  });
});

describe('Journey 8: AI provider failure during summarization leaves the note intact', () => {
  it('a rejected DeepSeek call errors gracefully and never mutates/drops the note', async () => {
    enable('DEEPSEEK_API_KEY');
    stubProviders({
      deepseek: () => {
        throw new Error('ECONNRESET');
      },
    });
    const u = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(u.id, subj, { title: 'Survivor', content: 'keep me' });

    const res = await call(`/api/notes/${noteId}/summary`, {
      method: 'POST',
      token: u.token,
      body: { content: 'keep me', title: 'Survivor' },
    });
    expect(res.status).toBeGreaterThanOrEqual(500); // graceful error, not a hang

    const row = (await env.DB.prepare('SELECT title, summary FROM notes WHERE id = ?')
      .bind(noteId)
      .first()) as any;
    expect(row).not.toBeNull();
    expect(row.title).toBe('Survivor');
    expect(row.summary ?? null).toBeNull(); // failed summary was not partially written
  });

  it('a successful DeepSeek summary is persisted onto the note', async () => {
    enable('DEEPSEEK_API_KEY');
    stubProviders({
      deepseek: deepseekText(
        'Mitosis splits one cell into two. Each daughter keeps the full genome.',
      ),
    });
    const u = await seedUser();
    const subj = await seedSubject();
    const noteId = await seedNote(u.id, subj, { title: 'Cells', content: 'mitosis' });

    const res = await call(`/api/notes/${noteId}/summary`, {
      method: 'POST',
      token: u.token,
      body: { content: 'mitosis details', title: 'Cells' },
    });
    expect(res.status).toBe(200);
    const row = (await env.DB.prepare('SELECT summary FROM notes WHERE id = ?')
      .bind(noteId)
      .first()) as any;
    expect(row.summary).toContain('Mitosis');
  });
});

describe('Journey 4: scanned image -> OCR -> auto-tags -> published note (multi-provider chain)', () => {
  it('runs OCR then tagging through mocked providers and publishes the resulting note', async () => {
    const u = await seedUser();

    // 1. OCR the scanned page. Vision only (no DeepSeek key) so performOCR returns
    //    the raw Vision text rather than routing it through the DeepSeek cleanup
    //    step — which would otherwise consume the same mock as the tag call.
    enable('GOOGLE_CLOUD_VISION_API_KEY');
    stubProviders({ vision: visionText('Newton second law: F equals m times a.') });
    const ocr = await call('/api/gemini/ocr', {
      method: 'POST',
      token: u.token,
      body: { imageBase64: 'data:image/png;base64,AAA' },
    });
    expect(ocr.status).toBe(200);
    const text = ((await ocr.json()) as any).text as string;
    expect(text).toContain('Newton');

    // 2. Auto-tag the extracted text (DeepSeek path).
    delete (env as any).GOOGLE_CLOUD_VISION_API_KEY;
    enable('DEEPSEEK_API_KEY');
    stubProviders({ deepseek: deepseekText('fisika, hukum-newton, gaya') });
    const tagsRes = await call('/api/gemini/auto-tags', {
      method: 'POST',
      token: u.token,
      body: { title: 'Physics', content: text },
    });
    expect(tagsRes.status).toBe(200);
    const tags = ((await tagsRes.json()) as any).tags as string[];
    expect(tags).toEqual(expect.arrayContaining(['fisika']));

    // 3. Persist + publish a note carrying the OCR text and tags.
    const subj = await seedSubject();
    const noteId = await seedNote(u.id, subj, { title: 'Physics', content: text, status: 'draft' });
    const publish = await call(`/api/notes/${noteId}/publish`, { method: 'POST', token: u.token });
    expect(publish.status).toBeLessThan(300);
    const row = (await env.DB.prepare('SELECT status, content FROM notes WHERE id = ?')
      .bind(noteId)
      .first()) as any;
    expect(row.status).toBe('published');
    expect(row.content).toContain('Newton');
  });
});
