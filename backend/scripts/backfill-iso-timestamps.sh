#!/usr/bin/env bash
#
# Rewrite every stored timestamp still in SQLite's space form to ISO-8601 UTC.
#
# WHAT THIS IS FOR
#   Migration 0019 normalises "2026-08-31 11:48:10" (parsed by a browser as
#   LOCAL time — a silent seven-hour skew for a UTC+7 school) to
#   "2026-08-31T11:48:10Z". It has never run against production, because
#   production has no d1_migrations table: `wrangler d1 migrations apply` was
#   never used there, and the deploy path is initializeDatabase() instead.
#   So 0019 has to be applied by hand, once, and this is that.
#
#   This only fixes rows that ALREADY EXIST. New rows are handled by the
#   triggers that initializeDatabase() installs — deploy first (see ORDER).
#
# ORDER — this matters
#   1. Deploy the worker.  The deploy creates the tables 0019 expects and
#      installs the triggers. This script refuses to run until it can see both,
#      so getting the order wrong is an early abort, not a half-migration.
#   2. Run this script.    Exports first, then rewrites.
#   3. Spot-check the app. Dates should read "Today" for something posted today.
#
# SAFETY
#   - Exports the whole database before touching it, and refuses to continue if
#     the export is missing, empty, or does not look like SQL.
#   - Every statement in 0019 is idempotent: the WHERE clause matches only the
#     space form, so a second run is a no-op and a partial run resumes cleanly.
#   - Against --remote it requires you to type the database name to confirm.
#   - Aborts on the first error (set -e) rather than continuing half-applied.
#
# USAGE
#   ./scripts/backfill-iso-timestamps.sh --local           # rehearse
#   ./scripts/backfill-iso-timestamps.sh --remote          # production
#   ./scripts/backfill-iso-timestamps.sh --remote --dry-run  # audit only
#   ./scripts/backfill-iso-timestamps.sh --remote --yes    # skip the prompt (CI)
#
set -euo pipefail

DB_NAME="notarium-db"
TARGET=""
DRY_RUN=0
ASSUME_YES=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
MIGRATION="$BACKEND_DIR/migrations/0019_normalise_timestamps_to_iso.sql"
AUDIT_SQL="$SCRIPT_DIR/sql/audit-space-form-timestamps.sql"
BACKUP_DIR="$BACKEND_DIR/backups"

# Tables 0019 writes to. All must exist before it runs, or it aborts partway
# through and leaves the database half-converted.
REQUIRED_TABLES=(
  admin_activity_log admin_note_likes chat_messages chat_sessions grade_classes
  note_likes notes notification_reads notifications oauth_states oauth_tokens
  quiz_attempts refresh_tokens study_items subjects test_sessions
  tutor_availability tutor_bookings tutor_profiles tutor_sessions usage_stats
  users
)

die() { printf '\n\033[31mABORT\033[0m  %s\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '       %s\n' "$*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local)   TARGET="--local"  ;;
    --remote)  TARGET="--remote" ;;
    --dry-run) DRY_RUN=1 ;;
    --yes|-y)  ASSUME_YES=1 ;;
    -h|--help) sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done

[[ -n "$TARGET" ]] || die "pass --local or --remote explicitly. There is no default: the whole point is that you cannot hit production by forgetting a flag."
[[ -f "$MIGRATION" ]] || die "migration not found: $MIGRATION"
[[ -f "$AUDIT_SQL"  ]] || die "audit query not found: $AUDIT_SQL"

cd "$BACKEND_DIR"

d1() { npx wrangler d1 execute "$DB_NAME" "$TARGET" "$@" 2>&1; }

# Pull a single integer out of wrangler's JSON-ish output.
scalar() {
  local out
  out="$(d1 --command "$1")" || { printf '%s\n' "$out" >&2; die "query failed"; }
  printf '%s' "$out" | grep -oE '"[a-z_]+": *-?[0-9]+' | head -1 | grep -oE '\-?[0-9]+$'
}

# The audit returns ONE row whose columns are named <table>__<column>. The
# double underscore is what separates our fields from wrangler's own JSON keys
# ("duration", "success"), so nothing else can be mistaken for a count.
# Emits "table.column <n>" per line.
audit() {
  local out
  out="$(d1 --file "$AUDIT_SQL")" || { printf '%s\n' "$out" >&2; die "audit query failed"; }
  printf '%s' "$out" \
    | grep -oE '"[a-z_]+__[a-z_]+": *[0-9]+' \
    | tr -d '"' \
    | sed 's/__/./; s/: */ /'
}

audit_total() { awk '{ s += $2 } END { print s + 0 }'; }

step "Target"
note "database : $DB_NAME"
note "mode     : $TARGET"
if [[ "$TARGET" == "--remote" ]]; then
  printf '\033[33m       This is PRODUCTION. Real students, real notes.\033[0m\n'
fi

# ---------------------------------------------------------------- preflight
step "Preflight — is the schema ready for 0019?"

missing=()
for t in "${REQUIRED_TABLES[@]}"; do
  found="$(scalar "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='$t';")"
  [[ "$found" == "1" ]] || missing+=("$t")
done

if (( ${#missing[@]} )); then
  printf '\n'
  note "missing tables: ${missing[*]}"
  die "0019 writes to tables that do not exist here. Deploy the worker first — initializeDatabase() creates them. Running now would abort partway and leave the database half-converted."
fi
note "all ${#REQUIRED_TABLES[@]} tables present"

triggers="$(scalar "SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_%_iso';")"
if [[ "${triggers:-0}" -lt 24 ]]; then
  note "found ${triggers:-0} of 24 ISO triggers"
  die "the deploy that installs the triggers has not landed (SCHEMA_VERSION 3). Without them, rows written between this backfill and that deploy go back to the space form and you would have to run this again. Deploy first."
fi
note "$triggers ISO triggers installed — new writes are already safe"

# ------------------------------------------------------------------- audit
step "Before — values still in the space form"
BEFORE_REPORT="$(audit)"
before="$(printf '%s\n' "$BEFORE_REPORT" | audit_total)"
printf '%s\n' "$BEFORE_REPORT" | awk '$2 > 0 { printf "       %-44s %s\n", $1, $2 }'
note "total: ${before}"

if [[ "${before}" == "0" ]]; then
  step "Nothing to do"
  note "every timestamp is already ISO-8601. Exiting without exporting or writing."
  exit 0
fi

if (( DRY_RUN )); then
  step "Dry run — stopping before the export"
  note "${before} values would be rewritten. Re-run without --dry-run to proceed."
  exit 0
fi

# ------------------------------------------------------------------ export
step "Export — full database snapshot before any write"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$BACKUP_DIR/${DB_NAME}-${TARGET#--}-${STAMP}.sql"

npx wrangler d1 export "$DB_NAME" "$TARGET" --output "$BACKUP" \
  || die "export failed — nothing has been modified"

[[ -s "$BACKUP" ]] || die "export produced an empty file: $BACKUP"
grep -qi "CREATE TABLE" "$BACKUP" \
  || die "export does not contain any CREATE TABLE — refusing to treat it as a usable backup: $BACKUP"

note "wrote $BACKUP ($(wc -c < "$BACKUP") bytes, $(grep -ci '^INSERT INTO' "$BACKUP") INSERT statements)"
note "restore with: npx wrangler d1 execute $DB_NAME $TARGET --file $BACKUP"

# ----------------------------------------------------------------- confirm
if [[ "$TARGET" == "--remote" ]] && (( ! ASSUME_YES )); then
  step "Confirm"
  note "about to rewrite ${before} stored values in PRODUCTION"
  note "backup: $BACKUP"
  printf '       type the database name (%s) to continue: ' "$DB_NAME"
  read -r answer
  [[ "$answer" == "$DB_NAME" ]] || die "not confirmed — nothing was modified"
fi

# ------------------------------------------------------------------- apply
step "Applying 0019"
d1 --file "$MIGRATION" > /dev/null || die "0019 failed. The database may be partially converted — 0019 is idempotent, so re-running is safe once the cause is fixed. Backup: $BACKUP"
note "applied"

# ------------------------------------------------------------------ verify
step "After — values still in the space form"
AFTER_REPORT="$(audit)"
after="$(printf '%s\n' "$AFTER_REPORT" | audit_total)"
note "before: ${before}"
note "after : ${after}"

if [[ "${after}" != "0" ]]; then
  printf '%s\n' "$AFTER_REPORT" | awk '$2 > 0 { printf "       %-44s %s\n", $1, $2 }'
  die "${after} values are still in the space form. 0019 is idempotent — investigate the fields above, then re-run. Backup: $BACKUP"
fi

step "Done"
note "$((before - after)) values rewritten to ISO-8601 UTC"
note "backup retained at $BACKUP"
note "spot-check the app: a note posted today should read \"Today\", not \"Yesterday\"."
