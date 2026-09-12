import type { Env } from './env';

// Bump this whenever initializeDatabase() changes (new table/column/seed).
// The request-path init runs at most once per version across all Worker
// isolates (gated by a KV flag) instead of on every cold isolate. Raising the
// number re-triggers a single idempotent init pass after the next deploy.
//
// THIS FUNCTION IS THE DEPLOY PATH, NOT backend/migrations/. Production has no
// d1_migrations table — `wrangler d1 migrations apply` has never been run
// against it — so anything that exists only as a migration file never reaches a
// deployed database. A new table, column, or trigger has to be added HERE as
// well as to schema.sql and migrations/, and all three kept in step.
export const SCHEMA_VERSION = 3;

// Columns whose table DEFAULT is still SQLite's `datetime('now')`, which yields
// "2026-08-31 11:48:10" — no `T`, no `Z`. A browser parses that as LOCAL time,
// so for a UTC+7 school it renders seven hours off, as a plausible wrong time
// rather than an error; and 'T' (0x54) sorts after ' ' (0x20), so mixed-format
// rows do not compare on the same date.
//
// SQLite cannot ALTER a column default — the only fix is rebuilding the table,
// which is a lot of risk across 18 live tables. An AFTER INSERT trigger
// normalises the value instead, with no schema surgery. Kept identical to
// migrations/0021_iso_timestamps_on_insert.sql.
const ISO_TIMESTAMP_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ['subjects', 'created_at'],
  ['notes', 'created_at'],
  ['notes', 'updated_at'],
  ['note_likes', 'created_at'],
  ['admin_note_likes', 'created_at'],
  ['chat_sessions', 'created_at'],
  ['chat_sessions', 'updated_at'],
  ['chat_messages', 'created_at'],
  ['refresh_tokens', 'created_at'],
  ['admin_activity_log', 'created_at'],
  ['usage_stats', 'created_at'],
  ['request_metrics', 'ts'],
  ['ai_usage', 'ts'],
  ['grade_classes', 'created_at'],
  ['grade_classes', 'updated_at'],
  ['notifications', 'created_at'],
  ['notification_reads', 'read_at'],
  ['test_sessions', 'created_at'],
  ['tutor_profiles', 'created_at'],
  ['tutor_profiles', 'updated_at'],
  ['tutor_availability', 'created_at'],
  ['tutor_sessions', 'created_at'],
  ['tutor_sessions', 'updated_at'],
  ['tutor_bookings', 'created_at'],
];

export async function initializeDatabase(env: Env) {
  try {
    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        encrypted_yw_id TEXT UNIQUE,
        display_name TEXT,
        email TEXT UNIQUE,
        password_hash TEXT,
        firebase_uid TEXT,
        photo_url TEXT,
        class TEXT,
        role TEXT DEFAULT 'student',
        notes_uploaded INTEGER DEFAULT 0,
        total_likes INTEGER DEFAULT 0,
        total_admin_upvotes INTEGER DEFAULT 0,
        suspended INTEGER DEFAULT 0,
        diamonds INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `,
    ).run();
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN notes_uploaded INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN total_likes INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(
        `ALTER TABLE users ADD COLUMN total_admin_upvotes INTEGER DEFAULT 0`,
      ).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN suspended INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'student'`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN description TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN diamonds INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN firebase_uid TEXT`).run();
    } catch (e) {}
    // NULLs are distinct in SQLite, so a unique index tolerates many not-yet-linked users.
    await env.DB.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)`,
    ).run();
    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        icon TEXT,
        note_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `,
    ).run();
    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author_id INTEGER,
        title TEXT,
        description TEXT,
        subject_id INTEGER,
        extracted_text TEXT,
        image_path TEXT,
        summary TEXT,
        content TEXT,
        tags TEXT,
        author_class TEXT,
        status TEXT DEFAULT 'published',
        visibility TEXT DEFAULT 'everyone',
        scheduled_publish_at TEXT,
        likes INTEGER DEFAULT 0,
        admin_upvotes INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        FOREIGN KEY (author_id) REFERENCES users(id),
        FOREIGN KEY (subject_id) REFERENCES subjects(id)
      )
    `,
    ).run();
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN subject_id INTEGER`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN description TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN extracted_text TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN image_path TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN summary TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN likes INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN admin_upvotes INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN content TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN tags TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN author_class TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN status TEXT DEFAULT 'published'`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN scheduled_publish_at TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN visibility TEXT DEFAULT 'everyone'`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN parent_note_id INTEGER`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN part_number INTEGER`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(
        `
        UPDATE notes
        SET status = 'published'
        WHERE status IS NULL OR status = '' OR status = 'undefined'
      `,
      ).run();

      await env.DB.prepare(
        `
        UPDATE notes
        SET visibility = 'everyone'
        WHERE visibility IS NULL OR visibility = '' OR visibility = 'undefined'
      `,
      ).run();
    } catch (e) {}
    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS admin_activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER,
        admin_email TEXT,
        action_type TEXT,
        target_type TEXT,
        target_id INTEGER,
        details TEXT,
        created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        FOREIGN KEY (admin_id) REFERENCES users(id)
      )
    `,
    ).run();
    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        subject TEXT,
        topic TEXT,
        created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `,
    ).run();
    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        role TEXT,
        content TEXT,
        created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
      )
    `,
    ).run();
    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS note_likes (
        note_id INTEGER,
        user_id INTEGER,
        created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        PRIMARY KEY (note_id, user_id),
        FOREIGN KEY (note_id) REFERENCES notes(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `,
    ).run();
    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS admin_note_likes (
        note_id INTEGER,
        admin_id INTEGER,
        created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        PRIMARY KEY (note_id, admin_id),
        FOREIGN KEY (note_id) REFERENCES notes(id),
        FOREIGN KEY (admin_id) REFERENCES users(id)
      )
    `,
    ).run();
    const defaultSubjects = [
      { name: 'Filsafat', icon: '🧠' },
      { name: 'Fisika', icon: '⚛️' },
      { name: 'Matematika', icon: '📐' },
      { name: 'Bahasa Indonesia', icon: '🗣️' },
      { name: 'Bahasa Inggris', icon: '🇬🇧' },
      { name: 'Sosiologi', icon: '👥' },
      { name: 'Sejarah Indonesia', icon: '📜' },
      { name: 'Geografi', icon: '🌍' },
      { name: 'Ekonomi', icon: '💹' },
      { name: 'Sains', icon: '🔬' },
      { name: 'PKN', icon: '🏛️' },
      { name: 'PAK', icon: '⛪' },
      { name: 'Biologi', icon: '🧬' },
      { name: 'Kimia', icon: '🧪' },
    ];

    for (const subject of defaultSubjects) {
      try {
        await env.DB.prepare('INSERT INTO subjects (name, icon) VALUES (?, ?)')
          .bind(subject.name, subject.icon)
          .run();
      } catch (e) {}
    }
    const validSubjectNames = defaultSubjects.map((s) => s.name);
    try {
      const placeholders = validSubjectNames.map(() => '?').join(',');
      await env.DB.prepare(`DELETE FROM subjects WHERE name NOT IN (${placeholders})`)
        .bind(...validSubjectNames)
        .run();
    } catch (e) {}
    try {
      await syncNoteCounts(env);
    } catch (e) {}

    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS grade_classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grade INTEGER NOT NULL CHECK(grade IN (10, 11, 12)),
        class_name TEXT NOT NULL,
        semester TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        UNIQUE(grade, class_name, semester)
      )
    `,
    ).run();

    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER,
        target_type TEXT NOT NULL,
        target_grade INTEGER,
        target_class TEXT,
        target_user_id INTEGER,
        notification_type TEXT NOT NULL DEFAULT 'announcement',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `,
    ).run();

    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS notification_reads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        read_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        UNIQUE(notification_id, user_id)
      )
    `,
    ).run();

    // OAuth tables. The Google OAuth routes read/write these, but only the
    // migration files created them — nothing applies those at runtime, so a
    // fresh D1 had no oauth_states/oauth_tokens and every Google login 500'd.
    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS oauth_providers (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        client_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1
      )
    `,
    ).run();
    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        access_token_enc TEXT NOT NULL,
        refresh_token_enc TEXT,
        scope TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(user_id, provider)
      )
    `,
    ).run();
    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS oauth_states (
        state TEXT PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        redirect_to TEXT,
        pkce_verifier TEXT NOT NULL,
        intent TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `,
    ).run();
    try {
      await env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens(user_id)`,
      ).run();
    } catch (e) {}
    try {
      await env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at)`,
      ).run();
    } catch (e) {}
    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO oauth_providers (name, client_id, enabled) VALUES ('google', '', 0)`,
      ).run();
    } catch (e) {}

    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN grade INTEGER`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN grade_class_id INTEGER`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN warning INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN warning_message TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN warning_first_viewed TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(
        `ALTER TABLE users ADD COLUMN warning_view_count INTEGER DEFAULT 0`,
      ).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN suspension_end_date TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN suspension_reason TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN google_id TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(
        `ALTER TABLE users ADD COLUMN oauth_provider TEXT DEFAULT 'local'`,
      ).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN last_seen_at TEXT`).run();
    } catch (e) {}

    // Academic year, TOTP 2FA, and graduation tracking.
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN academic_year TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN totp_secret TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN totp_backup_codes TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN graduated INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE grade_classes ADD COLUMN academic_year TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS idx_users_grade_class_id ON users(grade_class_id)`,
      ).run();
    } catch (e) {}

    try {
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN author_grade INTEGER`).run();
    } catch (e) {}

    const defaultClasses = [
      { grade: 10, class_name: '10.1' },
      { grade: 10, class_name: '10.2' },
      { grade: 10, class_name: '10.3' },
      { grade: 11, class_name: '11.1' },
      { grade: 11, class_name: '11.2' },
      { grade: 11, class_name: '11.3' },
      { grade: 12, class_name: '12.1' },
      { grade: 12, class_name: '12.2' },
      { grade: 12, class_name: '12.3' },
    ];
    for (const c of defaultClasses) {
      try {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO grade_classes (grade, class_name, semester, is_active) VALUES (?, ?, '', 1)`,
        )
          .bind(c.grade, c.class_name)
          .run();
      } catch (e) {}
    }

    try {
      await env.DB.prepare(
        `
        UPDATE users SET grade = CAST(SUBSTR(class, 1, 2) AS INTEGER)
        WHERE class IS NOT NULL AND class != '' AND grade IS NULL
      `,
      ).run();
    } catch (e) {}

    try {
      await env.DB.prepare(
        `
        UPDATE users SET grade_class_id = (
          SELECT id FROM grade_classes WHERE class_name = users.class AND is_active = 1 LIMIT 1
        )
        WHERE class IS NOT NULL AND grade_class_id IS NULL
      `,
      ).run();
    } catch (e) {}

    try {
      await env.DB.prepare(
        `
        UPDATE notes SET author_grade = (
          SELECT u.grade FROM users u WHERE u.id = notes.author_id
        )
        WHERE author_grade IS NULL
      `,
      ).run();
    } catch (e) {}

    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS quiz_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        note_id INTEGER,
        question_text TEXT NOT NULL,
        question_hash TEXT NOT NULL,
        is_correct INTEGER NOT NULL,
        confidence INTEGER,
        answered_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `,
    ).run();
    try {
      await env.DB.prepare(
        `
        CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_time
          ON quiz_attempts(user_id, answered_at)
      `,
      ).run();
    } catch (e) {}

    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS study_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        note_id INTEGER,
        question_text TEXT NOT NULL,
        question_hash TEXT NOT NULL,
        ease_factor REAL DEFAULT 2.5,
        interval_days INTEGER DEFAULT 0,
        repetitions INTEGER DEFAULT 0,
        due_at TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        UNIQUE(user_id, note_id, question_hash)
      )
    `,
    ).run();
    try {
      await env.DB.prepare(
        `
        CREATE INDEX IF NOT EXISTS idx_study_items_user_due
          ON study_items(user_id, due_at)
      `,
      ).run();
    } catch (e) {}

    try {
      // Nullable: NULL means "use the school default". See migration 0020 and
      // schema.sql — all three must stay in step.
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN timezone TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN current_streak INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN longest_streak INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN last_study_date TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN learning_points INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
      // Read by /api/auth/me on every page load. Without it that endpoint 500s
      // and the client clears its token, so nobody can hold a session. Existed
      // only in migration 0014, which production never ran.
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN admin_role TEXT`).run();
    } catch (e) {}
    try {
      // Soft-delete marker. Every "active notes" query filters on it, so
      // without the column the admin notes tab, note restore, and all three
      // ops recompute targets 500. Existed only in migration 0009.
      await env.DB.prepare(`ALTER TABLE notes ADD COLUMN deleted_at TEXT`).run();
    } catch (e) {}
    try {
      await env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS idx_notes_browse ON notes(subject_id, status, visibility, created_at DESC) WHERE deleted_at IS NULL`,
      ).run();
    } catch (e) {}
    try {
      await env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS idx_notes_active ON notes(deleted_at) WHERE deleted_at IS NULL`,
      ).run();
    } catch (e) {}

    // Tables below reached local databases through migrations/ only, so they are
    // absent from production and every feature that touches them 500s. Declared
    // here so a deploy creates them. DDL matches schema.sql, including its
    // ISO-8601 defaults — created fresh, these never need the triggers below.
    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS test_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        subject_id INTEGER,
        source_type TEXT,
        source_id INTEGER,
        question_count INTEGER NOT NULL,
        correct_count INTEGER NOT NULL,
        score_pct INTEGER NOT NULL,
        duration_sec INTEGER,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `,
    ).run();
    try {
      await env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS idx_test_sessions_user_time ON test_sessions(user_id, created_at DESC)`,
      ).run();
    } catch (e) {}

    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS tutor_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        blurb TEXT,
        grade_min INTEGER,
        grade_max INTEGER,
        languages TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        approved_by INTEGER,
        rating_avg REAL,
        session_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        UNIQUE (user_id, subject_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (subject_id) REFERENCES subjects(id)
      )
    `,
    ).run();

    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS tutor_availability (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tutor_profile_id INTEGER NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'one_to_one',
        seat_cap INTEGER,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        FOREIGN KEY (tutor_profile_id) REFERENCES tutor_profiles(id)
      )
    `,
    ).run();

    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS tutor_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tutor_profile_id INTEGER NOT NULL,
        availability_id INTEGER,
        subject_id INTEGER NOT NULL,
        topic TEXT,
        kind TEXT NOT NULL DEFAULT 'one_to_one',
        seat_cap INTEGER,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        location TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled',
        points_awarded INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        FOREIGN KEY (tutor_profile_id) REFERENCES tutor_profiles(id),
        FOREIGN KEY (subject_id) REFERENCES subjects(id)
      )
    `,
    ).run();

    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS tutor_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        seat_no INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'booked',
        rating INTEGER,
        feedback TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        UNIQUE (session_id, student_id),
        UNIQUE (session_id, seat_no),
        FOREIGN KEY (session_id) REFERENCES tutor_sessions(id),
        FOREIGN KEY (student_id) REFERENCES users(id)
      )
    `,
    ).run();
    try {
      await env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS idx_tutor_profiles_subject ON tutor_profiles(subject_id, status)`,
      ).run();
    } catch (e) {}
    try {
      await env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS idx_tutor_sessions_start ON tutor_sessions(starts_at, status)`,
      ).run();
    } catch (e) {}
    try {
      await env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS idx_tutor_bookings_student ON tutor_bookings(student_id, status)`,
      ).run();
    } catch (e) {}

    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS request_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        path TEXT,
        method TEXT,
        status INTEGER,
        duration_ms INTEGER
      ) STRICT
    `,
    ).run();
    try {
      await env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS idx_request_metrics_ts ON request_metrics(ts)`,
      ).run();
    } catch (e) {}

    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS ai_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        provider TEXT,
        endpoint TEXT,
        ok INTEGER,
        duration_ms INTEGER,
        tokens INTEGER
      ) STRICT
    `,
    ).run();
    try {
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ai_usage_ts ON ai_usage(ts)`).run();
    } catch (e) {}

    await env.DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS usage_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stat_date TEXT NOT NULL,
        active_users INTEGER NOT NULL DEFAULT 0,
        new_users INTEGER NOT NULL DEFAULT 0,
        notes_created INTEGER NOT NULL DEFAULT 0,
        likes_given INTEGER NOT NULL DEFAULT 0,
        chat_sessions INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      ) STRICT
    `,
    ).run();

    // Last, so every table above exists before a trigger references it. Each is
    // dropped first so a changed definition replaces the old one on re-init.
    for (const [table, column] of ISO_TIMESTAMP_COLUMNS) {
      try {
        await env.DB.prepare(`DROP TRIGGER IF EXISTS trg_${table}_${column}_iso`).run();
        await env.DB.prepare(
          `
          CREATE TRIGGER trg_${table}_${column}_iso
          AFTER INSERT ON ${table}
          FOR EACH ROW
          WHEN NEW.${column} IS NOT NULL
           AND NEW.${column} NOT LIKE '%Z'
           AND NEW.${column} LIKE '____-__-__ %'
          BEGIN
            UPDATE ${table}
               SET ${column} = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.${column})
             WHERE rowid = NEW.rowid;
          END
        `,
        ).run();
      } catch (e) {}
    }
  } catch (error: any) {
    // Don't throw - table might already exist
  }
}

export async function syncNoteCounts(env: Env) {
  try {
    const { results } = await env.DB.prepare(
      `
      SELECT subject_id, COUNT(*) as actual_count
      FROM notes
      GROUP BY subject_id
    `,
    ).all();
    for (const row of results || []) {
      const subjectRow = row as any;
      await env.DB.prepare('UPDATE subjects SET note_count = ? WHERE id = ?')
        .bind(subjectRow.actual_count, subjectRow.subject_id)
        .run();
    }
    await env.DB.prepare(
      `
      UPDATE subjects SET note_count = 0
      WHERE id NOT IN (SELECT DISTINCT subject_id FROM notes)
    `,
    ).run();
  } catch (error: any) {}
}

export const MOCK_SUBJECTS = [
  { id: 1, name: 'Filsafat', icon: '🧠', note_count: 0 },
  { id: 2, name: 'Fisika', icon: '⚛️', note_count: 0 },
  { id: 3, name: 'Matematika', icon: '📐', note_count: 0 },
  { id: 4, name: 'Bahasa Indonesia', icon: '🗣️', note_count: 0 },
  { id: 5, name: 'Bahasa Inggris', icon: '🇬🇧', note_count: 0 },
  { id: 6, name: 'Sosiologi', icon: '👥', note_count: 0 },
  { id: 7, name: 'Sejarah Indonesia', icon: '📜', note_count: 0 },
  { id: 8, name: 'Geografi', icon: '🌍', note_count: 0 },
  { id: 9, name: 'Ekonomi', icon: '💹', note_count: 0 },
  { id: 10, name: 'Sains', icon: '🔬', note_count: 0 },
  { id: 11, name: 'PKN', icon: '🏛️', note_count: 0 },
  { id: 12, name: 'PAK', icon: '⛪', note_count: 0 },
  { id: 13, name: 'Biologi', icon: '🧬', note_count: 0 },
  { id: 14, name: 'Kimia', icon: '🧪', note_count: 0 },
];
