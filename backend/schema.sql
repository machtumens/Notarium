-- schema.sql — READ-ONLY SNAPSHOT of the production database `notarium-db`
-- (17779d22-7479-479c-8de7-dfe102916ba3), taken 20 Sep 2026 with
--   wrangler d1 export notarium-db --remote --no-data
-- (W4.1, master plan: "schema.sql regenerated from D1"). Nothing here is applied by anything.
--
-- This is NOT the schema this Worker creates. The tables it needs are built by migrations/
-- (`0001_baseline.sql` onwards). Production is wider than that: STRICT tables, extra columns
-- (grade, firebase_uid, totp_*, admin_role, deleted_at, …), extra tables (oauth_*, tutor_*,
-- study_items, quiz_attempts, notifications, grade_classes, …) and 24 AFTER INSERT triggers that
-- normalise timestamps to ISO-8601 — all of it from the `origin/main` lineage that is the bundle
-- actually deployed on `notarium-backend` (see RELEASE/C2-deployed-bundle_19-09-26.md in the V2.0
-- repo). Regenerate with the same command whenever production changes; do not hand-edit.
--
-- What matters for a `master` deploy against this schema:
--   * `notes.content TEXT NOT NULL` — an image-only note without text cannot be inserted here.
--   * `users.email TEXT NOT NULL UNIQUE`, `users.encrypted_yw_id` nullable, no CHECK constraints.
--   * STRICT tables reject values of the wrong type (e.g. a string bound to an INTEGER column).
--   * `refresh_tokens` lacks `family` / `revoked_at` until migrations 0002/0003 run.

PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    file_key TEXT,
    subject TEXT,
    tags TEXT,
    views INTEGER NOT NULL DEFAULT 0,
    rating_avg REAL NOT NULL DEFAULT 0.0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    is_public INTEGER NOT NULL DEFAULT 1 CHECK(is_public IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), description TEXT, admin_upvotes INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, subject_id INTEGER, extracted_text TEXT, image_path TEXT, summary TEXT, author_class TEXT, status TEXT DEFAULT 'published', visibility TEXT DEFAULT 'everyone', scheduled_publish_at TEXT, parent_note_id INTEGER, part_number INTEGER, author_grade INTEGER, deleted_at TEXT,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;
CREATE TABLE subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL,
    note_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
CREATE TABLE chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject TEXT,
    topic TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;
CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
) STRICT;
CREATE TABLE note_likes (
        note_id INTEGER,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (note_id, user_id),
        FOREIGN KEY (note_id) REFERENCES notes(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
CREATE TABLE admin_note_likes (
        note_id INTEGER,
        admin_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (note_id, admin_id),
        FOREIGN KEY (note_id) REFERENCES notes(id),
        FOREIGN KEY (admin_id) REFERENCES users(id)
      );
CREATE TABLE admin_activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER,
        admin_email TEXT,
        action_type TEXT,
        target_type TEXT,
        target_id INTEGER,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES users(id)
      );
CREATE TABLE refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  note_id INTEGER,
  question_text TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  confidence INTEGER,
  answered_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE study_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  note_id INTEGER,
  question_text TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  ease_factor REAL DEFAULT 2.5,
  interval_days INTEGER DEFAULT 0,
  repetitions INTEGER DEFAULT 0,
  due_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, question_hash)
);
CREATE TABLE grade_classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grade INTEGER NOT NULL CHECK(grade IN (10, 11, 12)),
        class_name TEXT NOT NULL,
        semester TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')), academic_year TEXT,
        UNIQUE(grade, class_name, semester)
      );
CREATE TABLE notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER,
        target_type TEXT NOT NULL,
        target_grade INTEGER,
        target_class TEXT,
        target_user_id INTEGER,
        notification_type TEXT NOT NULL DEFAULT 'announcement',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
CREATE TABLE notification_reads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        read_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(notification_id, user_id)
      );
CREATE TABLE oauth_providers (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        client_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1
      );
CREATE TABLE oauth_tokens (
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
      );
CREATE TABLE oauth_states (
        state TEXT PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        redirect_to TEXT,
        pkce_verifier TEXT NOT NULL,
        intent TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
CREATE TABLE test_sessions (
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
      );
CREATE TABLE tutor_profiles (
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
      );
CREATE TABLE tutor_availability (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tutor_profile_id INTEGER NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'one_to_one',
        seat_cap INTEGER,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        FOREIGN KEY (tutor_profile_id) REFERENCES tutor_profiles(id)
      );
CREATE TABLE tutor_sessions (
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
      );
CREATE TABLE tutor_bookings (
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
      );
CREATE TABLE request_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        path TEXT,
        method TEXT,
        status INTEGER,
        duration_ms INTEGER
      ) STRICT
    ;
CREATE TABLE ai_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        provider TEXT,
        endpoint TEXT,
        ok INTEGER,
        duration_ms INTEGER,
        tokens INTEGER
      ) STRICT
    ;
CREATE TABLE usage_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stat_date TEXT NOT NULL,
        active_users INTEGER NOT NULL DEFAULT 0,
        new_users INTEGER NOT NULL DEFAULT 0,
        notes_created INTEGER NOT NULL DEFAULT 0,
        likes_given INTEGER NOT NULL DEFAULT 0,
        chat_sessions INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      ) STRICT
    ;
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  photo_url TEXT,
  role TEXT NOT NULL DEFAULT 'student',
  points INTEGER NOT NULL DEFAULT 0,
  notes_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  class TEXT,
  suspended INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT,
  notes_uploaded INTEGER DEFAULT 0,
  total_likes INTEGER DEFAULT 0,
  total_admin_upvotes INTEGER DEFAULT 0,
  description TEXT,
  diamonds INTEGER DEFAULT 0,
  warning INTEGER DEFAULT 0,
  warning_message TEXT,
  warning_first_viewed TEXT,
  warning_view_count INTEGER DEFAULT 0,
  encrypted_yw_id TEXT,
  suspension_end_date TEXT,
  suspension_reason TEXT,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_study_date TEXT,
  learning_points INTEGER DEFAULT 0,
  grade INTEGER,
  grade_class_id INTEGER,
  google_id TEXT,
  oauth_provider TEXT DEFAULT 'local',
  last_seen_at TEXT,
  firebase_uid TEXT,
  academic_year TEXT,
  totp_secret TEXT,
  totp_enabled INTEGER DEFAULT 0,
  totp_backup_codes TEXT,
  graduated INTEGER DEFAULT 0,
  timezone TEXT,
  admin_role TEXT
) STRICT;
DELETE FROM sqlite_sequence;
CREATE INDEX idx_notes_author ON notes(author_id);
CREATE INDEX idx_notes_created ON notes(created_at DESC);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_quiz_attempts_user_time
  ON quiz_attempts(user_id, answered_at);
CREATE INDEX idx_study_items_user_due
  ON study_items(user_id, due_at);
CREATE INDEX idx_oauth_tokens_user ON oauth_tokens(user_id);
CREATE INDEX idx_oauth_states_expires ON oauth_states(expires_at);
CREATE INDEX idx_notes_browse ON notes(subject_id, status, visibility, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_active ON notes(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_sessions_user_time ON test_sessions(user_id, created_at DESC);
CREATE INDEX idx_tutor_profiles_subject ON tutor_profiles(subject_id, status);
CREATE INDEX idx_tutor_sessions_start ON tutor_sessions(starts_at, status);
CREATE INDEX idx_tutor_bookings_student ON tutor_bookings(student_id, status);
CREATE INDEX idx_request_metrics_ts ON request_metrics(ts);
CREATE INDEX idx_ai_usage_ts ON ai_usage(ts);
CREATE UNIQUE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_grade_class_id ON users(grade_class_id);
CREATE TRIGGER trg_subjects_created_at_iso
          AFTER INSERT ON subjects
          FOR EACH ROW
          WHEN NEW.created_at IS NOT NULL
           AND NEW.created_at NOT LIKE '%Z'
           AND NEW.created_at LIKE '____-__-__ %'
          BEGIN
            UPDATE subjects
               SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_notes_created_at_iso
          AFTER INSERT ON notes
          FOR EACH ROW
          WHEN NEW.created_at IS NOT NULL
           AND NEW.created_at NOT LIKE '%Z'
           AND NEW.created_at LIKE '____-__-__ %'
          BEGIN
            UPDATE notes
               SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_notes_updated_at_iso
          AFTER INSERT ON notes
          FOR EACH ROW
          WHEN NEW.updated_at IS NOT NULL
           AND NEW.updated_at NOT LIKE '%Z'
           AND NEW.updated_at LIKE '____-__-__ %'
          BEGIN
            UPDATE notes
               SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.updated_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_note_likes_created_at_iso
          AFTER INSERT ON note_likes
          FOR EACH ROW
          WHEN NEW.created_at IS NOT NULL
           AND NEW.created_at NOT LIKE '%Z'
           AND NEW.created_at LIKE '____-__-__ %'
          BEGIN
            UPDATE note_likes
               SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_admin_note_likes_created_at_iso
          AFTER INSERT ON admin_note_likes
          FOR EACH ROW
          WHEN NEW.created_at IS NOT NULL
           AND NEW.created_at NOT LIKE '%Z'
           AND NEW.created_at LIKE '____-__-__ %'
          BEGIN
            UPDATE admin_note_likes
               SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_chat_sessions_created_at_iso
          AFTER INSERT ON chat_sessions
          FOR EACH ROW
          WHEN NEW.created_at IS NOT NULL
           AND NEW.created_at NOT LIKE '%Z'
           AND NEW.created_at LIKE '____-__-__ %'
          BEGIN
            UPDATE chat_sessions
               SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_chat_sessions_updated_at_iso
          AFTER INSERT ON chat_sessions
          FOR EACH ROW
          WHEN NEW.updated_at IS NOT NULL
           AND NEW.updated_at NOT LIKE '%Z'
           AND NEW.updated_at LIKE '____-__-__ %'
          BEGIN
            UPDATE chat_sessions
               SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.updated_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_chat_messages_created_at_iso
          AFTER INSERT ON chat_messages
          FOR EACH ROW
          WHEN NEW.created_at IS NOT NULL
           AND NEW.created_at NOT LIKE '%Z'
           AND NEW.created_at LIKE '____-__-__ %'
          BEGIN
            UPDATE chat_messages
               SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_refresh_tokens_created_at_iso
          AFTER INSERT ON refresh_tokens
          FOR EACH ROW
          WHEN NEW.created_at IS NOT NULL
           AND NEW.created_at NOT LIKE '%Z'
           AND NEW.created_at LIKE '____-__-__ %'
          BEGIN
            UPDATE refresh_tokens
               SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_admin_activity_log_created_at_iso
          AFTER INSERT ON admin_activity_log
          FOR EACH ROW
          WHEN NEW.created_at IS NOT NULL
           AND NEW.created_at NOT LIKE '%Z'
           AND NEW.created_at LIKE '____-__-__ %'
          BEGIN
            UPDATE admin_activity_log
               SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_usage_stats_created_at_iso
          AFTER INSERT ON usage_stats
          FOR EACH ROW
          WHEN NEW.created_at IS NOT NULL
           AND NEW.created_at NOT LIKE '%Z'
           AND NEW.created_at LIKE '____-__-__ %'
          BEGIN
            UPDATE usage_stats
               SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_request_metrics_ts_iso
          AFTER INSERT ON request_metrics
          FOR EACH ROW
          WHEN NEW.ts IS NOT NULL
           AND NEW.ts NOT LIKE '%Z'
           AND NEW.ts LIKE '____-__-__ %'
          BEGIN
            UPDATE request_metrics
               SET ts = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.ts)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_ai_usage_ts_iso
          AFTER INSERT ON ai_usage
          FOR EACH ROW
          WHEN NEW.ts IS NOT NULL
           AND NEW.ts NOT LIKE '%Z'
           AND NEW.ts LIKE '____-__-__ %'
          BEGIN
            UPDATE ai_usage
               SET ts = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.ts)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_grade_classes_created_at_iso
          AFTER INSERT ON grade_classes
          FOR EACH ROW
          WHEN NEW.created_at IS NOT NULL
           AND NEW.created_at NOT LIKE '%Z'
           AND NEW.created_at LIKE '____-__-__ %'
          BEGIN
            UPDATE grade_classes
               SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_grade_classes_updated_at_iso
          AFTER INSERT ON grade_classes
          FOR EACH ROW
          WHEN NEW.updated_at IS NOT NULL
           AND NEW.updated_at NOT LIKE '%Z'
           AND NEW.updated_at LIKE '____-__-__ %'
          BEGIN
            UPDATE grade_classes
               SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.updated_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_notifications_created_at_iso
          AFTER INSERT ON notifications
          FOR EACH ROW
          WHEN NEW.created_at IS NOT NULL
           AND NEW.created_at NOT LIKE '%Z'
           AND NEW.created_at LIKE '____-__-__ %'
          BEGIN
            UPDATE notifications
               SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_notification_reads_read_at_iso
          AFTER INSERT ON notification_reads
          FOR EACH ROW
          WHEN NEW.read_at IS NOT NULL
           AND NEW.read_at NOT LIKE '%Z'
           AND NEW.read_at LIKE '____-__-__ %'
          BEGIN
            UPDATE notification_reads
               SET read_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.read_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_test_sessions_created_at_iso
          AFTER INSERT ON test_sessions
          FOR EACH ROW
          WHEN NEW.created_at IS NOT NULL
           AND NEW.created_at NOT LIKE '%Z'
           AND NEW.created_at LIKE '____-__-__ %'
          BEGIN
            UPDATE test_sessions
               SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_tutor_profiles_created_at_iso
          AFTER INSERT ON tutor_profiles
          FOR EACH ROW
          WHEN NEW.created_at IS NOT NULL
           AND NEW.created_at NOT LIKE '%Z'
           AND NEW.created_at LIKE '____-__-__ %'
          BEGIN
            UPDATE tutor_profiles
               SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_tutor_profiles_updated_at_iso
          AFTER INSERT ON tutor_profiles
          FOR EACH ROW
          WHEN NEW.updated_at IS NOT NULL
           AND NEW.updated_at NOT LIKE '%Z'
           AND NEW.updated_at LIKE '____-__-__ %'
          BEGIN
            UPDATE tutor_profiles
               SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.updated_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_tutor_availability_created_at_iso
          AFTER INSERT ON tutor_availability
          FOR EACH ROW
          WHEN NEW.created_at IS NOT NULL
           AND NEW.created_at NOT LIKE '%Z'
           AND NEW.created_at LIKE '____-__-__ %'
          BEGIN
            UPDATE tutor_availability
               SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_tutor_sessions_created_at_iso
          AFTER INSERT ON tutor_sessions
          FOR EACH ROW
          WHEN NEW.created_at IS NOT NULL
           AND NEW.created_at NOT LIKE '%Z'
           AND NEW.created_at LIKE '____-__-__ %'
          BEGIN
            UPDATE tutor_sessions
               SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_tutor_sessions_updated_at_iso
          AFTER INSERT ON tutor_sessions
          FOR EACH ROW
          WHEN NEW.updated_at IS NOT NULL
           AND NEW.updated_at NOT LIKE '%Z'
           AND NEW.updated_at LIKE '____-__-__ %'
          BEGIN
            UPDATE tutor_sessions
               SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.updated_at)
             WHERE rowid = NEW.rowid;
          END;
CREATE TRIGGER trg_tutor_bookings_created_at_iso
          AFTER INSERT ON tutor_bookings
          FOR EACH ROW
          WHEN NEW.created_at IS NOT NULL
           AND NEW.created_at NOT LIKE '%Z'
           AND NEW.created_at LIKE '____-__-__ %'
          BEGIN
            UPDATE tutor_bookings
               SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
             WHERE rowid = NEW.rowid;
          END;
