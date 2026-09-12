#!/usr/bin/env bash
#
# Rebuild the `users` table without its legacy CHECK constraints.
#
# WHAT THIS IS FOR
#   Production's `users` table was created long ago with
#     class TEXT CHECK(class IN ('10.1','10.2','10.3'))
#     role  TEXT CHECK(role IN ('student','admin'))
#     created_at / updated_at DEFAULT (datetime('now'))      -- space form
#   The first one rejects every grade 11 and 12 signup with a 500. SQLite
#   cannot ALTER a CHECK or a DEFAULT away, and initializeDatabase()'s
#   CREATE TABLE IF NOT EXISTS is a no-op on a table that already exists, so a
#   deploy never fixes it. The only cure is to build a clean table and move
#   the rows across. This is that, with the guards the 28-08-26 local rebuild
#   used, scripted so production gets exactly the rehearsed procedure.
#
# HOW IT MOVES THE ROWS (and why this order)
#   1. PRAGMA foreign_keys = OFF, PRAGMA legacy_alter_table = ON
#   2. ALTER TABLE users RENAME TO users_old
#   3. CREATE TABLE users (clean definition), INSERT ... SELECT from users_old
#   4. verify: row-for-row identical, every child table count unchanged,
#      foreign_key_check clean, no CHECK left, sequence preserved
#   5. only then DROP TABLE users_old
#   Nothing ever drops a table that a child still references, so ON DELETE
#   CASCADE can never fire. If anything fails before step 5, users_old still
#   holds every row and the script prints the two statements that put it back.
#
# THE ONE ASSUMPTION, PROBED NOT TRUSTED
#   Step 2 only leaves the children pointing at the name `users` if
#   foreign_keys is really OFF when the RENAME runs — with FKs on, SQLite
#   rewrites every REFERENCES to `users_old` (see the table in the ALTER TABLE
#   docs), and PRAGMA foreign_keys is a no-op inside a transaction. Whether
#   wrangler's remote path runs a file inside one is not documented, so before
#   touching users this script runs the same sequence on two throwaway tables
#   through the same path and aborts if the pragma did not take effect.
#
# USAGE
#   ./scripts/rebuild-users-table.sh --local             # rehearse
#   ./scripts/rebuild-users-table.sh --remote --dry-run  # preflight + probe only
#   ./scripts/rebuild-users-table.sh --remote            # production
#   ./scripts/rebuild-users-table.sh --remote --yes      # skip the typed confirm
#
set -euo pipefail

DB_NAME="${DB_NAME:-notarium-db}"   # override only to rehearse on a scratch copy
TARGET=""
DRY_RUN=0
ASSUME_YES=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$BACKEND_DIR/backups"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# The clean definition. Every column production has today, same types, same
# NOT NULLs, same defaults — minus the three CHECKs, plus ISO timestamp
# defaults, plus AUTOINCREMENT (production has it; table_info cannot say so).
# STRICT is kept because production is STRICT and the app runs against it.
# Columns a target lacks (local has no notes_count) simply take their default.
TARGET_DDL='CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  photo_url TEXT,
  role TEXT NOT NULL DEFAULT '"'"'student'"'"',
  points INTEGER NOT NULL DEFAULT 0,
  notes_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('"'"'%Y-%m-%dT%H:%M:%SZ'"'"','"'"'now'"'"')),
  updated_at TEXT NOT NULL DEFAULT (strftime('"'"'%Y-%m-%dT%H:%M:%SZ'"'"','"'"'now'"'"')),
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
  oauth_provider TEXT DEFAULT '"'"'local'"'"',
  last_seen_at TEXT,
  firebase_uid TEXT,
  academic_year TEXT,
  totp_secret TEXT,
  totp_enabled INTEGER DEFAULT 0,
  totp_backup_codes TEXT,
  graduated INTEGER DEFAULT 0,
  timezone TEXT,
  admin_role TEXT
) STRICT'

die()  { printf '\n\033[31mABORT\033[0m  %s\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '       %s\n' "$*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local)   TARGET="--local"  ;;
    --remote)  TARGET="--remote" ;;
    --dry-run) DRY_RUN=1 ;;
    --yes|-y)  ASSUME_YES=1 ;;
    -h|--help) sed -n '2,45p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done
[[ -n "$TARGET" ]] || die "pass --local or --remote explicitly. There is no default."
cd "$BACKEND_DIR"

# --command returns rows; --file (against --remote) returns only a summary.
# So: reads go through --command, the batches that change things go through
# --file — the same path the probe exercises.
# Reads retry: the API occasionally drops one call in a burst of twenty, and
# a dropped read must not abort a verify that is otherwise passing.
d1c()  {
  local out i
  for i in 1 2 3; do
    if out="$(npx wrangler d1 execute "$DB_NAME" "$TARGET" --json --command "$1" 2>&1)" && grep -q '^\[' <<<"$out"; then
      sed -n '/^\[/,$p' <<<"$out"; return 0
    fi
    sleep $((i * 3))
  done
  printf '%s\n' "$out" >&2; return 1
}
d1f()  { npx wrangler d1 execute "$DB_NAME" "$TARGET" --file "$1" 2>&1; }
# first numeric value of the named column in a one-row result
num()  { local out; out="$(d1c "$1")" || die "query failed: $1"; printf '%s' "$out" | grep -oE "\"$2\": *-?[0-9]+" | head -1 | grep -oE '\-?[0-9]+$' || echo ""; }
# string value of the named column
str()  { local out; out="$(d1c "$1")" || die "query failed: $1"; printf '%s' "$out" | grep -oE "\"$2\": *\"[^\"]*\"" | head -1 | sed -E 's/^"[^"]*": *"//; s/"$//'; }
# number of result rows (counts one distinctive key per row)
rows() { local out; out="$(d1c "$1")" || die "query failed: $1"; printf '%s' "$out" | grep -cE "\"$2\":" || true; }

step "Target"
note "database : $DB_NAME"
note "mode     : $TARGET"
[[ "$TARGET" == "--remote" ]] && printf '\033[33m       This is PRODUCTION. Real students, real notes.\033[0m\n'

# ---------------------------------------------------------------------------
step "Preflight"
[[ "$(num "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='users'" n)" == "1" ]] || die "no users table here"
[[ "$(num "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='users_old'" n)" == "0" ]] \
  || die "users_old already exists — a previous run stopped partway. Inspect it before doing anything else; do not re-run blindly."
[[ "$(num "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE '\_fk\_probe\_%' ESCAPE '\\'" n)" == "0" ]] \
  || die "leftover _fk_probe_ tables from an earlier run — drop them first"

# Every live column must be in the target definition, or rows would lose data.
LIVE_COLS="$(str "SELECT GROUP_CONCAT(name, ',') AS cols FROM pragma_table_info('users')" cols)"
[[ -n "$LIVE_COLS" ]] || die "could not read the users column list"
missing=()
for c in ${LIVE_COLS//,/ }; do
  grep -qE "^\s+${c} " <<<"$TARGET_DDL" || missing+=("$c")
done
(( ${#missing[@]} == 0 )) || die "live column(s) not in the target definition — would be dropped: ${missing[*]}. Add them to TARGET_DDL first."
ncols="$(tr ',' '\n' <<<"$LIVE_COLS" | wc -l)"
note "$ncols live columns, all covered by the target definition"

has_check="$(num "SELECT instr(sql,'CHECK') AS n FROM sqlite_master WHERE name='users'" n)"
[[ "$has_check" != "0" ]] && note "current definition carries CHECK constraints (offset $has_check) — that is what we are removing" \
                          || note "current definition has no CHECK — nothing to remove, but the rebuild is still safe to run"

# Children: every table whose definition references users. Counted now, re-counted after.
CHILDREN="$(d1c "SELECT name FROM sqlite_master WHERE type='table' AND name <> 'users' AND (sql LIKE '%REFERENCES users%' OR sql LIKE '%REFERENCES \"users\"%') ORDER BY name" \
            | grep -oE '"name": *"[^"]*"' | sed -E 's/^"name": *"//; s/"$//')"
[[ -n "$CHILDREN" ]] || die "found no tables referencing users — that is not this schema. Refusing."
declare -A BEFORE
for t in $CHILDREN; do BEFORE[$t]="$(num "SELECT COUNT(*) AS n FROM $t" n)"; done
N_BEFORE="$(num "SELECT COUNT(*) AS n FROM users" n)"
SEQ_BEFORE="$(num "SELECT seq FROM sqlite_sequence WHERE name='users'" seq)"
[[ -n "$SEQ_BEFORE" ]] || die "users has no sqlite_sequence row — expected AUTOINCREMENT"
note "users rows      : $N_BEFORE   (sequence $SEQ_BEFORE)"
note "child tables    : $(wc -w <<<"$CHILDREN")  ($(tr '\n' ' ' <<<"$CHILDREN"))"

[[ "$(rows "PRAGMA foreign_key_check" table)" == "0" ]] || die "foreign_key_check already reports violations before we start — fix those first, or the after-check cannot be trusted"
note "foreign_key_check: clean"

# Named indexes on users: captured verbatim, dropped after the rename (index
# names are global, the new table cannot reuse them while users_old holds
# them), recreated on the new table. The email UNIQUE autoindex has no name
# and comes back with the CREATE TABLE.
INDEX_SQL="$(d1c "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='users' AND sql IS NOT NULL ORDER BY name" \
             | grep -oE '"sql": *"[^"]*"' | sed -E 's/^"sql": *"//; s/"$//')"
INDEX_NAMES="$(grep -oE 'INDEX +[a-zA-Z0-9_]+' <<<"$INDEX_SQL" | awk '{print $2}')"
note "named indexes   : $(tr '\n' ' ' <<<"${INDEX_NAMES:-none}")"

# ---------------------------------------------------------------------------
step "Probe — does PRAGMA foreign_keys=OFF take effect through this path?"
cat > "$WORK/probe.sql" <<'SQL'
PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;
CREATE TABLE _fk_probe_parent (id INTEGER PRIMARY KEY);
CREATE TABLE _fk_probe_child (id INTEGER PRIMARY KEY, pid INTEGER REFERENCES _fk_probe_parent(id) ON DELETE CASCADE);
INSERT INTO _fk_probe_parent (id) VALUES (1);
INSERT INTO _fk_probe_child (id, pid) VALUES (1, 1);
ALTER TABLE _fk_probe_parent RENAME TO _fk_probe_parent_old;
DROP TABLE _fk_probe_parent_old;
SQL
d1f "$WORK/probe.sql" > "$WORK/probe.out" || { cat "$WORK/probe.out" >&2; die "probe batch failed — nothing touched users"; }
probe_child_rows="$(num "SELECT COUNT(*) AS n FROM _fk_probe_child" n)"
probe_child_ddl="$(str "SELECT sql FROM sqlite_master WHERE name='_fk_probe_child'" sql)"
printf 'PRAGMA foreign_keys = OFF;\nDROP TABLE IF EXISTS _fk_probe_child;\nDROP TABLE IF EXISTS _fk_probe_parent;\nDROP TABLE IF EXISTS _fk_probe_parent_old;\n' > "$WORK/probe-clean.sql"
d1f "$WORK/probe-clean.sql" > /dev/null || note "warning: could not drop the probe tables — drop _fk_probe_* by hand"
if [[ "$probe_child_rows" != "1" ]]; then
  die "the probe child lost its row on DROP: foreign keys were ON during the batch, so the pragma is a no-op on this path. The rename would have rewired every child table to users_old and the final DROP would have cascaded through notes, sessions and tokens. Not running."
fi
if grep -q "_fk_probe_parent_old" <<<"$probe_child_ddl"; then
  die "RENAME rewrote the child's REFERENCES to the old name: foreign keys were ON during the rename. Not running."
fi
note "cascade did not fire, references were not rewritten — the pragma holds on this path"

# ---------------------------------------------------------------------------
if (( DRY_RUN )); then
  step "Dry run — stopping before the export"
  note "would rename users → users_old, create the clean table, copy $N_BEFORE rows, verify, then drop users_old"
  exit 0
fi

step "Export — full database snapshot before any write"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$BACKUP_DIR/${DB_NAME}-${TARGET#--}-users-rebuild-${STAMP}.sql"
npx wrangler d1 export "$DB_NAME" "$TARGET" --output "$BACKUP" || die "export failed — nothing has been modified"
[[ -s "$BACKUP" ]] || die "export produced an empty file: $BACKUP"
grep -qi "CREATE TABLE" "$BACKUP" || die "export has no CREATE TABLE — refusing to treat it as a backup: $BACKUP"
note "wrote $BACKUP ($(wc -c < "$BACKUP") bytes, $(grep -ci '^INSERT INTO' "$BACKUP") INSERT statements)"

if [[ "$TARGET" == "--remote" ]] && (( ! ASSUME_YES )); then
  step "Confirm"
  note "about to rebuild the users table in PRODUCTION ($N_BEFORE rows)"
  note "backup: $BACKUP"
  printf '       type the database name (%s) to continue: ' "$DB_NAME"
  read -r answer
  [[ "$answer" == "$DB_NAME" ]] || die "not confirmed — nothing was modified"
fi

# ---------------------------------------------------------------------------
step "Rebuild — rename, create, copy, re-index (users_old is kept until verified)"
{
  printf 'PRAGMA foreign_keys = OFF;\nPRAGMA legacy_alter_table = ON;\n'
  printf 'ALTER TABLE users RENAME TO users_old;\n'
  for i in $INDEX_NAMES; do printf 'DROP INDEX IF EXISTS %s;\n' "$i"; done
  printf '%s;\n' "$TARGET_DDL"
  printf 'INSERT INTO users (%s) SELECT %s FROM users_old;\n' "$LIVE_COLS" "$LIVE_COLS"
  while IFS= read -r line; do [[ -n "$line" ]] && printf '%s;\n' "$line"; done <<<"$INDEX_SQL"
  printf "UPDATE sqlite_sequence SET seq = %s WHERE name = 'users';\n" "$SEQ_BEFORE"
} > "$WORK/rebuild.sql"
RECOVERY="PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON; DROP TABLE IF EXISTS users; ALTER TABLE users_old RENAME TO users;  -- then recreate: $(tr '\n' ';' <<<"$INDEX_SQL")"
d1f "$WORK/rebuild.sql" > "$WORK/rebuild.out" || { cat "$WORK/rebuild.out" >&2; die "rebuild batch failed. users_old still holds every row. Recover with:  $RECOVERY   Backup: $BACKUP"; }
note "batch applied"

# ---------------------------------------------------------------------------
step "Verify — before dropping anything"
fail=()
n_after="$(num "SELECT COUNT(*) AS n FROM users" n)"
[[ "$n_after" == "$N_BEFORE" ]] || fail+=("users rows: $N_BEFORE → $n_after")
diff1="$(num "SELECT COUNT(*) AS n FROM (SELECT $LIVE_COLS FROM users EXCEPT SELECT $LIVE_COLS FROM users_old)" n)"
diff2="$(num "SELECT COUNT(*) AS n FROM (SELECT $LIVE_COLS FROM users_old EXCEPT SELECT $LIVE_COLS FROM users)" n)"
[[ "$diff1" == "0" && "$diff2" == "0" ]] || fail+=("rows differ between users and users_old ($diff1 / $diff2)")
for t in $CHILDREN; do
  a="$(num "SELECT COUNT(*) AS n FROM $t" n)"
  [[ "$a" == "${BEFORE[$t]}" ]] || fail+=("$t rows: ${BEFORE[$t]} → $a")
done
fk="$(rows "PRAGMA foreign_key_check" table)"
[[ "$fk" == "0" ]] || fail+=("foreign_key_check: $fk violation(s)")
chk="$(num "SELECT instr(sql,'CHECK') AS n FROM sqlite_master WHERE name='users'" n)"
[[ "$chk" == "0" ]] || fail+=("new definition still contains CHECK")
seq_after="$(num "SELECT seq FROM sqlite_sequence WHERE name='users'" seq)"
[[ "$seq_after" == "$SEQ_BEFORE" ]] || fail+=("sequence: $SEQ_BEFORE → $seq_after")
for i in $INDEX_NAMES; do
  [[ "$(num "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND tbl_name='users' AND name='$i'" n)" == "1" ]] || fail+=("index $i missing on the new table")
done
for t in $CHILDREN; do
  grep -q "users_old" <<<"$(str "SELECT sql FROM sqlite_master WHERE name='$t'" sql)" && fail+=("$t now references users_old")
done
qc="$(str "PRAGMA quick_check" quick_check)"
[[ "$qc" == "ok" ]] || fail+=("quick_check: $qc")

if (( ${#fail[@]} )); then
  for f in "${fail[@]}"; do note "FAILED: $f"; done
  die "verification failed — users_old was NOT dropped and still holds every row. Recover with:  $RECOVERY   Backup: $BACKUP"
fi
note "rows identical, $(wc -w <<<"$CHILDREN") child tables unchanged, foreign keys clean, no CHECK, sequence $seq_after, indexes back, quick_check ok"

# ---------------------------------------------------------------------------
step "Drop users_old"
printf 'PRAGMA foreign_keys = OFF;\nDROP TABLE users_old;\n' > "$WORK/drop.sql"
d1f "$WORK/drop.sql" > "$WORK/drop.out" || { cat "$WORK/drop.out" >&2; die "could not drop users_old — the new users table is complete and verified; drop users_old by hand"; }
[[ "$(rows "PRAGMA foreign_key_check" table)" == "0" ]] || die "foreign_key_check reports violations AFTER dropping users_old. Restore from the backup: $BACKUP"
for t in $CHILDREN; do
  a="$(num "SELECT COUNT(*) AS n FROM $t" n)"
  [[ "$a" == "${BEFORE[$t]}" ]] || die "$t lost rows on the final drop (${BEFORE[$t]} → $a). Restore from the backup: $BACKUP"
done

step "Done"
note "users rebuilt: $n_after rows, no CHECK constraints, ISO timestamp defaults"
note "backup retained at $BACKUP"
note "now sign up as a grade 12 student — that is the case the old CHECK forbade"
