// Chat removal — regression guard (Paperloop Phase 4).
// The chat cluster (routes/chat.ts handler + ChatPage + /api/chat/* routing) was
// DELETED when Notarium refocused on the personal study loop. These former
// endpoints must stay gone. The guard authenticates as a real user on purpose:
// a valid JWT proves the 404 comes from the route being ABSENT (unmatched path
// → the router's final `jsonResponse({ error: 'Not found' }, 404)`), not from an
// auth gate (401) or a surviving handler (200/500). If any of these flips to a
// non-404, chat has silently returned to the router and this file fails loudly.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

describe('Chat removal regression guard (Paperloop Phase 4)', () => {
  it('POST /api/chat/sessions is gone (404) even for a valid authed user', async () => {
    const u = await seedUser();
    const res = await call('/api/chat/sessions', {
      method: 'POST',
      token: u.token,
      body: { title: 'should not exist' },
    });
    expect(res.status, 'create-chat-session route must be removed from routing').toBe(404);
  });

  it('GET /api/chat/sessions is gone (404) even for a valid authed user', async () => {
    const u = await seedUser();
    const res = await call('/api/chat/sessions', { token: u.token });
    expect(res.status, 'list-chat-sessions route must be removed from routing').toBe(404);
  });

  it('POST /api/chat/sessions/:id/ai-response is gone (404) so it cannot drain the AI budget', async () => {
    const u = await seedUser();
    const res = await call('/api/chat/sessions/1/ai-response', {
      method: 'POST',
      token: u.token,
      body: { message: 'hello' },
    });
    expect(res.status, 'paid chat AI-response route must be removed from routing').toBe(404);
  });
});
