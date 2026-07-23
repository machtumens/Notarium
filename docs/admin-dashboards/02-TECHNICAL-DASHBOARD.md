# Technical Dashboard (monitoring · "candle watching" · site maintenance)

> Role: `technical` (and `admin` superuser). Gate: `requireTechnical`.
> Depends on **00-FOUNDATION**. Lives at `/ops`, separate from Moderator `/admin`.
> Goal: **all possible monitors in ONE dashboard** + proper site maintenance.

## Reality check — what data exists today

Bindings are only **D1 + KV** (`wrangler.toml`). No Analytics Engine, no request/latency/AI logging, no `/api/health`. So monitors split into 3 tiers by how much we must add. Build A first; A alone is already a strong dashboard.

---

## MONITORS

### Tier A — zero new instrumentation (pure D1/KV queries) — ship first

All from existing tables (`users`, `notes`, `chat_*`, `quiz_attempts`, `study_items`, `admin_activity_log`, `usage_stats`).

- **Live users**: online now + active in 5m / 1h / 24h (`last_seen_at`).
- **Signups candle**: new users per hour/day (OHLC-style or area).
- **Notes candle**: notes created per hour/day; by subject; deleted count; moderation-queue size.
- **Engagement**: chat sessions & messages/day, quiz attempts, study items due now, likes given.
- **Moderation health**: active suspensions, active warnings, admin actions timeline (from `admin_activity_log`).
- **DB growth**: row counts per table + delta vs yesterday.
- **Streaks/points**: distribution of `current_streak`, `learning_points`.
- **Rate-limit pressure**: throttle events — **needs one line added** where `checkRateLimit` rejects: increment a KV counter `metrics:ratelimit:<day>`. (Borderline A/B.)

### Tier B — light instrumentation we add (medium) — this is the real "candle watching"

Add tiny logging so we can chart traffic/errors/latency/AI over time.

- **[DECIDE] storage:** (i) new D1 tables `request_metrics` / `error_log` / `ai_usage`, sampled + rolled up hourly to stay cheap; **or** (ii) add a Cloudflare **Analytics Engine** binding (purpose-built for high-volume time series, cheaper at scale). Default: **Analytics Engine** if you're OK adding a binding; else D1 tables with sampling.
- Wrap the fetch handler in `index.ts` to record: path, method, status, duration ms.
- **Request-rate candlestick** (OHLC of req/min), **error-rate**, **status-code breakdown**, **top & slowest endpoints (p50/p95)**.
- **AI usage & cost**: wrap DeepSeek/Gemini calls (`routes/ai.ts`, `routes/chat.ts`) → calls, tokens, failures, latency, est. cost. Candle of AI spend/day.
- Latency candlestick per endpoint = the literal "candles" a technical admin watches.

### Tier C — Cloudflare platform metrics (needs a secret) — optional, best ops signal

- **[DECIDE]** add `CF_API_TOKEN` + `CF_ACCOUNT_ID` secrets → query the Cloudflare **GraphQL Analytics API** for Worker invocations, CPU time, errors, subrequests, D1 rows read/written, KV ops, bandwidth, cache-hit ratio. Free, but external token + a fetch proxy endpoint. Default: add later once A/B are live.

### Health panel (build with A)

`GET /api/health` deep check → status lights for: DB ping, KV ping, AI provider reachable, OAuth configured, latest migration applied. Public shallow `/api/health` (ok/down) is also useful for uptime pings.

---

## SITE MAINTENANCE ("proper")

KV-backed flags checked in the request pipeline; all toggles `requireTechnical` + logged.

- **Maintenance mode** — KV `site:maintenance = on`; middleware in `index.ts` returns 503 + maintenance page for normal users, **bypass for `technical`/`admin`**. Toggle from the dashboard.
- **Feature flags** — KV `flag:signups`, `flag:uploads`, `flag:ai_chat`, etc.; checked at the relevant routes. Turn subsystems off without a deploy.
- **Rate-limit tools** — reset throttles / clear a KV key / raise limits temporarily.
- **Migrations panel** — list applied vs pending migrations; run pending (guarded, `admin`-only recommended).
- **Data integrity tools** — recompute derived counters that drift: `subjects.note_count`, `users.notes_uploaded`, `total_likes`, snapshot `usage_stats` for today.
- **Activity log export** — CSV of `admin_activity_log`.
- **Danger zone** (`admin`-only, double-confirm): purge soft-deleted notes older than N days; revoke all refresh tokens (force re-login); clear a KV namespace.
- **Broadcast maintenance banner** — reuse notifications to warn users of upcoming downtime.

---

## Charts — how to render

Today usage charts are hand-rolled CSS bars (`AdminUsageReport.tsx`). Candlesticks + many time-series need more.
**[DECIDE] chart approach:**

- **A tiny SVG `<Candles>` / `<Sparkline>` component** — no dependency, ponytail-friendly, fine for a handful of chart types.
- **Add a chart lib** — `recharts` (React-idiomatic, easy candlestick/area/line) or lightweight `uPlot`. Justified because "all possible monitors" = many chart types.
  Default: **recharts** for the ops dashboard (worth the dep here); keep hand-rolled bars where they already work.

## Backend surface (new)

```
GET  /api/health                         shallow (public) + deep (requireTechnical)
GET  /api/ops/metrics?range=&metric=     Tier A aggregates (requireTechnical)
GET  /api/ops/timeseries?metric=&range=  Tier B candles (requireTechnical)
GET  /api/ops/cloudflare?metric=         Tier C proxy (requireTechnical) [optional]
GET  /api/ops/flags   POST /api/ops/flags        feature flags + maintenance (requireTechnical)
POST /api/ops/maintenance {on|off}
POST /api/ops/recompute {counter}        data integrity
POST /api/ops/migrations/run             (admin-only)
GET  /api/ops/activity-log.csv           export
POST /api/ops/danger/*                   (admin-only, confirm)
```

Group as `backend/src/routes/ops.ts` (keep files < ~400 lines; split metrics vs maintenance if it grows).

## Frontend

- New `src/pages/OpsDashboard.tsx` at `/ops`, gated by `canOps(user)`.
- Layout: top status-light row (health) → monitor grid (Tier A cards + B candles) → maintenance panel → danger zone.
- Auto-refresh (poll every 15–30s; **[DECIDE]** SSE/websocket later for true live).

## Security

- Everything `requireTechnical`; destructive ops `admin`-only + double-confirm + logged.
- Maintenance-mode bypass strictly by verified JWT role, never a query param.
- Tier C token stays a server secret; the CF proxy endpoint never exposes it.

## Effort / phasing

1. **A + health + maintenance mode** — the meaningful MVP (D1 queries + KV flag + one page).
2. **B** — instrumentation + candlesticks + AI usage.
3. **C** — Cloudflare GraphQL (only if you add the token).

## Open decisions to edit

1. Tier B storage: Analytics Engine binding vs D1 tables+sampling. (default: Analytics Engine)
2. Do Tier C at all? adds `CF_API_TOKEN`/`CF_ACCOUNT_ID`. (default: later)
3. Charts: hand-rolled SVG vs recharts. (default: recharts)
4. Live updates: polling vs SSE/websocket. (default: polling first)
5. Migration-runner & danger-zone: `technical` allowed, or `admin`-only? (default: admin-only)
6. Which feature flags matter to you (signups / uploads / ai_chat / …).
