#!/usr/bin/env bash
# Deploy smoke for a Notarium Worker. Usage:
#   scripts/smoke.sh <base-url>            read-only: health, ready, subjects, leaderboard shape, a failing login
#   scripts/smoke.sh <base-url> --write    + a throwaway account: signup, legacy login (24h, no refresh
#                                            token), opt-in login (X-Notarium-Session: refresh), refresh,
#                                            text-only note → my-notes, logout, refresh after logout → 401
# --write is what deploy.yml runs on STAGING. Production gets the read-only set (no junk accounts in
# the live users table); RELEASE/RUNBOOK.md in the V2.0 repo says when to run --write by hand.
# Needs bash, curl, jq. Exit 1 on the first failed check; prints a PASS/FAIL table.
set -u
BASE="${1:?usage: smoke.sh <base-url> [--write]}"
BASE="${BASE%/}"
WRITE=0; [[ "${2:-}" == "--write" ]] && WRITE=1
STAMP="$(date -u +%Y%m%d%H%M%S)-$RANDOM"
EMAIL="smoke-${STAMP}@example.invalid"      # .invalid TLD: never a real mailbox
PASS="smoke-pass-${STAMP}"
SESSION_HEADER='X-Notarium-Session: refresh'
FAILED=0
BODY=""; CODE=""

req() { # method path [data] [extra-header...]
  local method="$1" path="$2" data="${3:-}"; shift 3 || shift $#
  local args=(-s -o /tmp/smoke-body.$$ -w '%{http_code}' -X "$method" -H 'Content-Type: application/json')
  for h in "$@"; do args+=(-H "$h"); done
  [[ -n "$data" ]] && args+=(--data "$data")
  CODE="$(curl "${args[@]}" "$BASE$path")" || CODE="000"
  BODY="$(cat /tmp/smoke-body.$$ 2>/dev/null || true)"
}
check() { # name condition-result(0/1) detail
  if [[ "$2" == "0" ]]; then printf '  PASS  %-58s %s\n' "$1" "$3"; else printf '  FAIL  %-58s %s\n' "$1" "$3"; FAILED=1; fi
}
jqok() { jq -e "$1" >/dev/null 2>&1 <<<"$BODY"; }
# Seconds a JWT in .token is valid for (exp - iat), from its payload; "?" when it cannot be read.
ttl() {
  local payload; payload="$(jq -r '.token // empty' <<<"$BODY" | cut -d. -f2 | tr '_-' '/+')"
  [[ -z "$payload" ]] && { echo "?"; return; }
  while (( ${#payload} % 4 )); do payload="${payload}="; done
  base64 -d <<<"$payload" 2>/dev/null | jq -r 'if .exp and .iat then (.exp - .iat) else "?" end' 2>/dev/null || echo "?"
}

echo "Smoke: $BASE  (write=$WRITE)"

req GET /api/health
check "GET /api/health → 200 {ok:true}" "$([[ "$CODE" == 200 ]] && jqok '.ok == true' && echo 0 || echo 1)" "$CODE $(jq -c '{version,env}' <<<"$BODY" 2>/dev/null)"
NOSTORE="$(curl -s -D - -o /dev/null "$BASE/api/health" | tr -d '\r' | grep -i '^cache-control:' | head -1)"
check "  Cache-Control: no-store" "$([[ "$NOSTORE" == *no-store* ]] && echo 0 || echo 1)" "$NOSTORE"

req GET /api/ready
check "GET /api/ready → 200 {ok:true, checks d1+kv ok}" "$([[ "$CODE" == 200 ]] && jqok '.ok == true and .checks.d1 == "ok" and .checks.kv == "ok"' && echo 0 || echo 1)" "$CODE $(jq -c '.checks' <<<"$BODY" 2>/dev/null)"

req GET /api/subjects
check "GET /api/subjects → 200, 14 subjects" "$([[ "$CODE" == 200 ]] && jqok '(.subjects | length) == 14' && echo 0 || echo 1)" "$CODE $(jq -c '.subjects | length' <<<"$BODY" 2>/dev/null) subjects"
SUBJECT_ID="$(jq -r '.subjects[0].id' <<<"$BODY" 2>/dev/null || echo 1)"

req GET /api/leaderboard
check "GET /api/leaderboard → 200, no email / encrypted_yw_id in any row" "$([[ "$CODE" == 200 ]] && jqok '(.leaderboard | map(has("email") or has("encrypted_yw_id")) | any) | not' && echo 0 || echo 1)" "$CODE $(jq -c '.leaderboard | length' <<<"$BODY" 2>/dev/null) rows"

req POST /api/auth/login "{\"email\":\"nobody-${STAMP}@example.invalid\",\"password\":\"wrong-password\"}"
check "POST /api/auth/login (unknown account) → 401" "$([[ "$CODE" == 401 ]] && echo 0 || echo 1)" "$CODE"

if [[ $WRITE -eq 1 ]]; then
  req POST /api/auth/signup "{\"name\":\"Smoke ${STAMP}\",\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"class\":\"10.1\"}"
  check "POST /api/auth/signup → 201 with token, no refreshToken" "$([[ "$CODE" == 201 ]] && jqok '.token and (has("refreshToken") | not)' && echo 0 || echo 1)" "$CODE"

  req POST /api/auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"
  TTL="$(ttl)"
  check "POST /api/auth/login (no header) → 200, no refreshToken, 24h token" "$([[ "$CODE" == 200 && "$TTL" == 86400 ]] && jqok '.token and (has("refreshToken") | not)' && echo 0 || echo 1)" "$CODE ttl=${TTL}s"

  req POST /api/auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" "$SESSION_HEADER"
  TTL="$(ttl)"
  check "POST /api/auth/login (X-Notarium-Session: refresh) → 200, refreshToken, 15m token" "$([[ "$CODE" == 200 && "$TTL" == 900 ]] && jqok '.token and .refreshToken' && echo 0 || echo 1)" "$CODE ttl=${TTL}s"
  TOKEN="$(jq -r '.token // empty' <<<"$BODY")"; REFRESH="$(jq -r '.refreshToken // empty' <<<"$BODY")"

  req POST /api/auth/refresh "{\"refreshToken\":\"$REFRESH\"}"
  check "POST /api/auth/refresh → 200, new token + rotated refreshToken" "$([[ "$CODE" == 200 ]] && jqok ".token and .refreshToken and .refreshToken != \"$REFRESH\"" && echo 0 || echo 1)" "$CODE"
  TOKEN="$(jq -r '.token // empty' <<<"$BODY")"; REFRESH2="$(jq -r '.refreshToken // empty' <<<"$BODY")"

  req POST /api/notes "{\"title\":\"Smoke note ${STAMP}\",\"content\":\"text-only smoke body ${STAMP}\",\"subject_id\":${SUBJECT_ID}}" "Authorization: Bearer $TOKEN"
  check "POST /api/notes (text-only) → 200 {success:true}" "$([[ "$CODE" == 200 ]] && jqok '.success == true and .note.id' && echo 0 || echo 1)" "$CODE"

  req GET /api/notes/my-notes "" "Authorization: Bearer $TOKEN"
  check "GET /api/notes/my-notes → 200, the note is there with its content" "$([[ "$CODE" == 200 ]] && jqok ".notes | map(select(.content == \"text-only smoke body ${STAMP}\")) | length == 1" && echo 0 || echo 1)" "$CODE $(jq -c '.notes | length' <<<"$BODY" 2>/dev/null) notes"

  req POST /api/auth/logout "{\"refreshToken\":\"$REFRESH2\"}" "Authorization: Bearer $TOKEN"
  check "POST /api/auth/logout → 200" "$([[ "$CODE" == 200 ]] && echo 0 || echo 1)" "$CODE"

  req POST /api/auth/refresh "{\"refreshToken\":\"$REFRESH2\"}"
  check "POST /api/auth/refresh after logout → 401" "$([[ "$CODE" == 401 ]] && echo 0 || echo 1)" "$CODE"
fi

rm -f /tmp/smoke-body.$$
if [[ $FAILED -eq 0 ]]; then echo "SMOKE PASS"; else echo "SMOKE FAIL"; exit 1; fi
