import type { Env } from '../lib/env';
import type { User } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { getOrCreateUser } from '../lib/auth';
import { chatWithGemini } from './ai';

// Returns the caller iff they own the session, otherwise null.
// ponytail: single ownership gate reused by every session route — closes the IDOR.
async function getSessionOwner(
  sessionId: string,
  request: Request,
  env: Env,
): Promise<User | null> {
  const user = await getOrCreateUser(request, env);
  const session = await env.DB.prepare('SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?')
    .bind(sessionId, user.id)
    .first();
  return session ? user : null;
}

export async function createChatSession(request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);
  const body = (await request.json()) as any;

  const session = await env.DB.prepare(
    `
    INSERT INTO chat_sessions (user_id, subject, topic)
    VALUES (?, ?, ?)
    RETURNING *
  `,
  )
    .bind(user.id, body.subject, body.topic)
    .first();

  return jsonResponse({ session });
}

export async function getChatSessions(request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);

  const { results } = await env.DB.prepare(
    `
    SELECT * FROM chat_sessions
    WHERE user_id = ?
    ORDER BY updated_at DESC
    LIMIT 20
  `,
  )
    .bind(user.id)
    .all();

  return jsonResponse({ sessions: results });
}

export async function getChatMessages(sessionId: string, request: Request, env: Env) {
  const owner = await getSessionOwner(sessionId, request, env);
  if (!owner) return jsonResponse({ error: 'Not found' }, 404, env);

  const { results } = await env.DB.prepare(
    `
    SELECT * FROM chat_messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `,
  )
    .bind(sessionId)
    .all();

  return jsonResponse({ messages: results });
}

export async function addChatMessage(sessionId: string, request: Request, env: Env) {
  const owner = await getSessionOwner(sessionId, request, env);
  if (!owner) return jsonResponse({ error: 'Not found' }, 404, env);

  const body = (await request.json()) as any;

  const message = await env.DB.prepare(
    `
    INSERT INTO chat_messages (session_id, role, content)
    VALUES (?, ?, ?)
    RETURNING *
  `,
  )
    // role is forced to 'user' — never trust a client-supplied role (prevents
    // injecting fake system/assistant turns into the AI context).
    .bind(sessionId, 'user', body.content)
    .first();

  await env.DB.prepare('UPDATE chat_sessions SET updated_at = datetime("now") WHERE id = ?')
    .bind(sessionId)
    .run();

  return jsonResponse({ message });
}

export async function getAIResponse(sessionId: string, request: Request, env: Env) {
  try {
    const user = await getSessionOwner(sessionId, request, env);
    if (!user) return jsonResponse({ error: 'Not found' }, 404, env);

    const body = (await request.json()) as any;
    const { message, subject } = body;

    if (!message) {
      return jsonResponse({ error: 'Message is required' }, 400);
    }

    await env.DB.prepare(
      `
      INSERT INTO chat_messages (session_id, role, content)
      VALUES (?, ?, ?)
    `,
    )
      .bind(sessionId, 'user', message)
      .run();

    const session = await env.DB.prepare('SELECT subject, topic FROM chat_sessions WHERE id = ?')
      .bind(sessionId)
      .first();

    const chatSubject = subject || (session as any)?.subject || 'General';

    const aiResponse = await chatWithGemini(sessionId, message, chatSubject, user.id, request, env);

    return jsonResponse({ response: aiResponse });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}
