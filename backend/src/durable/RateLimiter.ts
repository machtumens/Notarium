/**
 * Atomic sliding-window rate limiter backed by a Durable Object.
 *
 * A DO instance is single-threaded, so the read-modify-write on the hit list is
 * race-free — unlike the KV limiter, where concurrent requests could each read a
 * stale count and slip past the limit. One DO id per (endpoint, ip) key.
 *
 * Request: GET https://rl/?limit=<n>&window=<seconds>
 * Response: { "allowed": true | false }
 */
export class RateLimiter implements DurableObject {
  private storage: DurableObjectStorage;

  constructor(state: DurableObjectState) {
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit')) || 5;
    const windowSec = Number(url.searchParams.get('window')) || 900;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - windowSec;

    const hits = (await this.storage.get<number[]>('hits')) ?? [];
    const recent = hits.filter((t) => t > windowStart);

    if (recent.length >= limit) {
      return json({ allowed: false });
    }

    recent.push(now);
    await this.storage.put('hits', recent);
    // Self-clean: wipe state once the window elapses so idle limiters don't
    // retain storage. Re-armed on every allowed hit.
    await this.storage.setAlarm(Date.now() + windowSec * 1000);
    return json({ allowed: true });
  }

  async alarm(): Promise<void> {
    await this.storage.deleteAll();
  }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
}
