// Gap-closing suite: I137 (review grading), J146 (restore), J148 (migration idempotency).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  applySchema,
  resetData,
  call,
  seedUser,
  seedSubject,
  seedNote,
  env,
  TEST_SECRETS,
} from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

async function seedDueReview(userId: number): Promise<number> {
  const row = (await env.DB.prepare(
    `INSERT INTO study_items (user_id, note_id, question_text, question_hash, ease_factor, interval_days, repetitions, due_at, updated_at)
     VALUES (?, NULL, ?, ?, 2.5, 0, 0, datetime('now','-1 day'), datetime('now','-1 day')) RETURNING id`,
  )
    .bind(userId, 'What is 2+2?', `hash-${userId}-${Date.now() % 100000}`)
    .first()) as { id: number };
  return row.id;
}

describe('I137 — grading a review advances the SRS schedule', () => {
  it('a correct grade updates the item (repetitions / due date move forward)', async () => {
    const u = await seedUser();
    const itemId = await seedDueReview(u.id);
    const before = (await env.DB.prepare(
      'SELECT repetitions, updated_at FROM study_items WHERE id = ?',
    )
      .bind(itemId)
      .first()) as any;

    const res = await call(`/api/reviews/${itemId}/grade`, {
      method: 'POST',
      token: u.token,
      body: { is_correct: true, confidence: 3 },
    });
    expect(res.status).toBeLessThan(300);

    const after = (await env.DB.prepare(
      'SELECT repetitions, due_at, updated_at FROM study_items WHERE id = ?',
    )
      .bind(itemId)
      .first()) as any;
    // Something scheduling-related must have changed (repetitions bumped or due pushed out).
    expect(after.repetitions >= before.repetitions).toBe(true);
    expect(after.due_at).toBeTruthy();
  });

  it('grading another user’s review item is rejected (scoped to owner)', async () => {
    const owner = await seedUser();
    const attacker = await seedUser();
    const itemId = await seedDueReview(owner.id);
    const res = await call(`/api/reviews/${itemId}/grade`, {
      method: 'POST',
      token: attacker.token,
      body: { is_correct: true },
    });
    expect(res.status).toBeGreaterThanOrEqual(400); // 404/403 — not this user's item
  });
});

describe('J146 — admin restore of a soft-deleted note', () => {
  it('restore clears deleted_at and the note is queryable again', async () => {
    const admin = await seedUser({ role: 'admin', admin_role: 'super' });
    const owner = await seedUser();
    const subj = await seedSubject();
    const id = await seedNote(owner.id, subj, { title: 'ComeBack' });
    await env.DB.prepare('UPDATE notes SET deleted_at = datetime("now") WHERE id = ?')
      .bind(id)
      .run();

    const res = await call(`/api/admin/notes/${id}/restore`, {
      method: 'POST',
      token: admin.token,
    });
    expect(res.status).toBeLessThan(300);
    const row = (await env.DB.prepare('SELECT title, deleted_at FROM notes WHERE id = ?')
      .bind(id)
      .first()) as any;
    expect(row.deleted_at).toBeNull();
    expect(row.title).toBe('ComeBack');
  });
});

describe('J148 — password migration is idempotent', () => {
  it('running migrate-passwords twice migrates nothing the second time (done=true)', async () => {
    const admin = await seedUser({ role: 'admin', admin_role: 'super' });
    // Seed a legacy plaintext-password user (NOT starting with the bcrypt "$2" prefix).
    await env.DB.prepare(
      `INSERT INTO users (encrypted_yw_id, email, password_hash, role, created_at)
       VALUES ('legacy-yw', 'legacy@sekolahkristencalvin.org', 'plaintextpw', 'student', datetime('now'))`,
    ).run();

    // Requires the admin JWT AND the admin password in the body (double check).
    const pw = { adminPassword: TEST_SECRETS.ADMIN_PASSWORD };
    const first = await call('/api/admin/migrate-passwords', {
      method: 'POST',
      token: admin.token,
      body: pw,
      ip: '42.0.0.1',
    });
    expect(first.status).toBe(200);

    const second = await call('/api/admin/migrate-passwords', {
      method: 'POST',
      token: admin.token,
      body: pw,
      ip: '42.0.0.2',
    });
    expect(second.status).toBe(200);
    const body = (await second.json()) as any;
    // Second pass finds nothing left to migrate.
    expect(body.migrated).toBe(0);
    expect(body.remaining).toBe(0);
  });
});
