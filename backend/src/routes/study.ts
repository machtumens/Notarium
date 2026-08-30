import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { getUserFromToken } from '../lib/auth';
import { checkRateLimit } from '../lib/ratelimit';
import { localDate, addLocalDays, startOfLocalDay, resolveZone, isoUtc } from '../lib/time';

const POINTS_CORRECT = 10;
const POINTS_CONFIDENCE_BONUS = 5;

function hashQuestion(text: string): string {
  let h = 5381;
  const s = text.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function toQuality(isCorrect: boolean, confidence?: number | null): number {
  if (!isCorrect) return 2;
  if (confidence === 3) return 5;
  if (confidence === 2) return 4;
  return 3;
}

interface Sm2State {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
}

interface Sm2Result {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  due_at: string;
}

/**
 * SM-2, with due dates anchored to the START of a local day rather than to an
 * instant offset from the review.
 *
 * `zone` is REQUIRED, not defaulted. Every call site has a real user whose zone
 * is known, and a silent default is exactly how a scheduler ends up quietly
 * running on the wrong calendar.
 */
export function computeSm2(
  prev: Sm2State,
  quality: number,
  zone: string,
  now: Date = new Date(),
): Sm2Result {
  const { interval_days: prevInterval } = prev;
  let { ease_factor: ease, repetitions } = prev;

  let interval: number;
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(prevInterval * ease);
  }

  ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ease < 1.3) ease = 1.3;

  // SM-2 intervals are counted in DAYS, so the basis is the local calendar day
  // of the review — not the clock time of it. Offsetting from the instant made
  // "due tomorrow" mean "due at this hour tomorrow", so the Today count climbed
  // through the evening and a student studying at a fixed hour drifted later
  // every cycle. Anchoring to local midnight makes the count stable all day.
  const dueDay = addLocalDays(localDate(zone, now), interval);

  return {
    ease_factor: ease,
    interval_days: interval,
    repetitions,
    due_at: isoUtc(startOfLocalDay(zone, dueDay)),
  };
}

/**
 * The zone to compute this user's day boundaries in.
 *
 * A separate lookup because `getUserFromToken` returns the JWT payload, not the
 * row, and the zone must NOT live in the token: tokens last 24h, so a student
 * who fixes their zone in Settings would keep getting the old one until it
 * expired. One primary-key SELECT next to the ~7 this endpoint already runs.
 */
async function userZone(env: Env, userId: number): Promise<string> {
  const row = (await env.DB.prepare(`SELECT timezone FROM users WHERE id = ?`)
    .bind(userId)
    .first()) as { timezone?: string | null } | null;
  return resolveZone(row?.timezone);
}

async function updateStreak(env: Env, userId: number, zone: string): Promise<number> {
  const today = localDate(zone);
  const user = (await env.DB.prepare(
    `SELECT current_streak, longest_streak, last_study_date FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first()) as any;

  let current = user?.current_streak ?? 0;
  const longest = user?.longest_streak ?? 0;
  const last = user?.last_study_date ?? null;

  if (last === today) {
    return current;
  }

  // Calendar arithmetic on the date string, NOT "the instant 24h ago". A DST
  // day is 23 or 25 hours long, so a fixed 24h step can land back on today
  // (breaking a live streak) or skip a day. Asia/Jakarta has no DST, but the
  // per-user override exists precisely so a student abroad can set a zone that
  // does.
  const yesterday = addLocalDays(today, -1);
  if (last === yesterday) {
    current = current + 1;
  } else {
    current = 1;
  }
  const newLongest = Math.max(longest, current);

  await env.DB.prepare(
    `UPDATE users SET current_streak = ?, longest_streak = ?, last_study_date = ? WHERE id = ?`,
  )
    .bind(current, newLongest, today, userId)
    .run();

  return current;
}

async function awardPoints(env: Env, userId: number, points: number): Promise<number> {
  await env.DB.prepare(`UPDATE users SET learning_points = learning_points + ? WHERE id = ?`)
    .bind(points, userId)
    .run();
  const row = (await env.DB.prepare(`SELECT learning_points FROM users WHERE id = ?`)
    .bind(userId)
    .first()) as any;
  return row?.learning_points ?? 0;
}

async function upsertStudyItem(
  env: Env,
  userId: number,
  noteId: number | null,
  questionText: string,
  questionHash: string,
  isCorrect: boolean,
  confidence: number | null | undefined,
  zone: string,
): Promise<string> {
  // Dedup key is (user, note, question) — NOT (user, question). The same wording
  // asked from two different notes is two different cards. `IS` (not `=`) so a
  // null note_id matches a null note_id; `= NULL` is never true in SQLite and
  // would re-INSERT a fresh row on every note-less attempt.
  const existing = (await env.DB.prepare(
    `SELECT ease_factor, interval_days, repetitions FROM study_items WHERE user_id = ? AND note_id IS ? AND question_hash = ?`,
  )
    .bind(userId, noteId, questionHash)
    .first()) as any;

  const prev: Sm2State = existing
    ? {
        ease_factor: existing.ease_factor ?? 2.5,
        interval_days: existing.interval_days ?? 0,
        repetitions: existing.repetitions ?? 0,
      }
    : { ease_factor: 2.5, interval_days: 0, repetitions: 0 };

  const quality = toQuality(isCorrect, confidence);
  const next = computeSm2(prev, quality, zone);
  const now = isoUtc();

  if (existing) {
    await env.DB.prepare(
      `UPDATE study_items
         SET ease_factor = ?, interval_days = ?, repetitions = ?, due_at = ?, updated_at = ?
       WHERE user_id = ? AND note_id IS ? AND question_hash = ?`,
    )
      .bind(
        next.ease_factor,
        next.interval_days,
        next.repetitions,
        next.due_at,
        now,
        userId,
        noteId,
        questionHash,
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO study_items
         (user_id, note_id, question_text, question_hash, ease_factor, interval_days, repetitions, due_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        userId,
        noteId,
        questionText,
        questionHash,
        next.ease_factor,
        next.interval_days,
        next.repetitions,
        next.due_at,
        now,
        now,
      )
      .run();
  }

  return next.due_at;
}

export async function logQuizAttempt(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const allowed = await checkRateLimit(ip, `quiz:${user.id}`, env);
    if (!allowed) return jsonResponse({ error: 'Too many requests' }, 429, env);

    const body = (await request.json()) as any;
    const noteId: number | null = body.note_id != null ? Number(body.note_id) : null;
    const questionText: string = body.question_text;
    const isCorrect = !!body.is_correct;
    const confidence: number | null = body.confidence != null ? Number(body.confidence) : null;

    if (!questionText || typeof questionText !== 'string') {
      return jsonResponse({ error: 'question_text is required' }, 400, env);
    }

    if (questionText.length > 2000) {
      return jsonResponse({ error: 'question_text too long' }, 400, env);
    }

    // IDOR guard: existence alone is not enough — the caller must OWN the note,
    // or any client can bind its SRS cards and quiz_attempts to someone else's
    // note id. Mirrors the author_id === user.id / 403 convention in notes.ts.
    if (noteId !== null) {
      if (!Number.isFinite(noteId) || noteId <= 0) {
        return jsonResponse({ error: 'Invalid note_id' }, 400, env);
      }
      const noteOwner = (await env.DB.prepare('SELECT author_id FROM notes WHERE id = ?')
        .bind(noteId)
        .first()) as any;
      if (!noteOwner) {
        return jsonResponse({ error: 'Note not found' }, 404, env);
      }
      if (noteOwner.author_id !== user.id) {
        return jsonResponse(
          { error: 'Unauthorized - You can only study your own notes' },
          403,
          env,
        );
      }
    }

    const questionHash = hashQuestion(questionText);

    await env.DB.prepare(
      `INSERT INTO quiz_attempts (user_id, note_id, question_text, question_hash, is_correct, confidence)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(user.id, noteId, questionText, questionHash, isCorrect ? 1 : 0, confidence)
      .run();

    // user -> school default -> UTC. Day boundaries for BOTH the streak and the
    // next due date are computed here, so they can never disagree.
    const zone = await userZone(env, user.id);

    const dueAt = await upsertStudyItem(
      env,
      user.id,
      noteId,
      questionText,
      questionHash,
      isCorrect,
      confidence,
      zone,
    );

    const currentStreak = await updateStreak(env, user.id, zone);

    let learningPoints: number;
    if (isCorrect) {
      const points = POINTS_CORRECT + (confidence === 3 ? POINTS_CONFIDENCE_BONUS : 0);
      learningPoints = await awardPoints(env, user.id, points);
    } else {
      const row = (await env.DB.prepare(`SELECT learning_points FROM users WHERE id = ?`)
        .bind(user.id)
        .first()) as any;
      learningPoints = row?.learning_points ?? 0;
    }

    return jsonResponse(
      {
        success: true,
        due_at: dueAt,
        current_streak: currentStreak,
        learning_points: learningPoints,
      },
      200,
      env,
    );
  } catch (error: any) {
    console.error('logQuizAttempt error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500, env);
  }
}

export async function getDueReviews(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

    const now = isoUtc();
    const { results } = await env.DB.prepare(
      `SELECT id, note_id, question_text, question_hash, ease_factor, interval_days, repetitions, due_at, created_at, updated_at
         FROM study_items
        WHERE user_id = ? AND (due_at IS NULL OR due_at <= ?)
        ORDER BY due_at
        LIMIT 50`,
    )
      .bind(user.id, now)
      .all();

    const items = results || [];
    return jsonResponse({ items, due_count: items.length }, 200, env);
  } catch (error: any) {
    console.error('getDueReviews error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500, env);
  }
}

export async function gradeReview(itemId: string, request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

    const numericId = parseInt(itemId, 10);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return jsonResponse({ error: 'Invalid item ID' }, 400, env);
    }

    const body = (await request.json()) as any;
    const isCorrect = !!body.is_correct;
    const confidence: number | null = body.confidence != null ? Number(body.confidence) : null;

    const item = (await env.DB.prepare(
      `SELECT id, note_id, question_text, question_hash FROM study_items WHERE id = ? AND user_id = ?`,
    )
      .bind(itemId, user.id)
      .first()) as any;

    if (!item) {
      return jsonResponse({ error: 'Review item not found' }, 404, env);
    }

    await env.DB.prepare(
      `INSERT INTO quiz_attempts (user_id, note_id, question_text, question_hash, is_correct, confidence)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        user.id,
        item.note_id ?? null,
        item.question_text,
        item.question_hash,
        isCorrect ? 1 : 0,
        confidence,
      )
      .run();

    const zone = await userZone(env, user.id);

    const dueAt = await upsertStudyItem(
      env,
      user.id,
      item.note_id ?? null,
      item.question_text,
      item.question_hash,
      isCorrect,
      confidence,
      zone,
    );

    const currentStreak = await updateStreak(env, user.id, zone);

    let learningPoints: number;
    if (isCorrect) {
      const points = POINTS_CORRECT + (confidence === 3 ? POINTS_CONFIDENCE_BONUS : 0);
      learningPoints = await awardPoints(env, user.id, points);
    } else {
      const row = (await env.DB.prepare(`SELECT learning_points FROM users WHERE id = ?`)
        .bind(user.id)
        .first()) as any;
      learningPoints = row?.learning_points ?? 0;
    }

    return jsonResponse(
      {
        due_at: dueAt,
        current_streak: currentStreak,
        learning_points: learningPoints,
      },
      200,
      env,
    );
  } catch (error: any) {
    console.error('gradeReview error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500, env);
  }
}

export async function gradeRecall(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const allowed = await checkRateLimit(ip, `recall:${user.id}`, env);
    if (!allowed) return jsonResponse({ error: 'Too many requests' }, 429, env);

    const body = (await request.json()) as any;
    const noteContent: string = body.note_content;
    const recallText: string = body.recall_text;

    if (!noteContent || !recallText) {
      return jsonResponse({ error: 'note_content and recall_text are required' }, 400, env);
    }

    if (typeof noteContent !== 'string' || typeof recallText !== 'string') {
      return jsonResponse({ error: 'note_content and recall_text must be strings' }, 400, env);
    }

    if (noteContent.length > 8000 || recallText.length > 8000) {
      return jsonResponse({ error: 'Input too long' }, 400, env);
    }

    const deepseekApiKey = env.DEEPSEEK_API_KEY;
    if (!deepseekApiKey) {
      return jsonResponse({ error: 'AI service not configured' }, 500, env);
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: `You are grading a student's free-recall (active recall) attempt against their study note.
Compare what the student wrote to the source note and grade how completely and accurately they recalled the material.

Return ONLY a JSON object with this exact structure (no extra text):
{
  "score": <integer 0-100>,
  "feedback": "<2-4 sentences of constructive feedback>",
  "missed_points": ["<key point the student missed>", "..."]
}

Write "feedback" and "missed_points" in Indonesian (Bahasa Indonesia).

SOURCE NOTE:
${noteContent.substring(0, 4000)}

STUDENT'S RECALL:
${recallText.substring(0, 4000)}`,
          },
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
    });

    const data = (await response.json()) as any;

    if (!response.ok || !data.choices || data.choices.length === 0) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }

    const responseText = data.choices[0].message.content;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid recall grading format');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const result = {
      score: typeof parsed.score === 'number' ? parsed.score : 0,
      feedback: typeof parsed.feedback === 'string' ? parsed.feedback : '',
      missed_points: Array.isArray(parsed.missed_points) ? parsed.missed_points : [],
    };

    return jsonResponse(result, 200, env);
  } catch (error: any) {
    console.error('gradeRecall error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500, env);
  }
}

export async function getStudyStats(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

    const stats = (await env.DB.prepare(
      `SELECT current_streak, longest_streak, learning_points FROM users WHERE id = ?`,
    )
      .bind(user.id)
      .first()) as any;

    const now = isoUtc();
    const dueRow = (await env.DB.prepare(
      `SELECT COUNT(*) as due_count FROM study_items
        WHERE user_id = ? AND (due_at IS NULL OR due_at <= ?)`,
    )
      .bind(user.id, now)
      .first()) as any;

    return jsonResponse(
      {
        current_streak: stats?.current_streak ?? 0,
        longest_streak: stats?.longest_streak ?? 0,
        learning_points: stats?.learning_points ?? 0,
        due_count: dueRow?.due_count ?? 0,
      },
      200,
      env,
    );
  } catch (error: any) {
    console.error('getStudyStats error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500, env);
  }
}
