export interface Env {
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
  // Atomic rate limiter (Durable Object). Optional: when absent (e.g. in tests),
  // checkRateLimit falls back to the KV sliding-window.
  RATE_LIMITER?: DurableObjectNamespace;
  GEMINI_API_KEY?: string;
  JWT_SECRET: string;
  ADMIN_PASSWORD: string;
  MODERATOR_PASSWORD?: string;
  TECH_PASSWORD?: string;
  DEEPSEEK_API_KEY?: string;
  GOOGLE_CLOUD_VISION_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  // Firebase Auth (Identity Platform). Enables RS256 ID-token verification.
  FIREBASE_PROJECT_ID?: string;
  OAUTH_REDIRECT_URI?: string;
  OAUTH_TOKEN_AES_KEY?: string;
  FRONTEND_URL?: string;
  EXTRA_ALLOWED_ORIGINS?: string;
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
}

export interface User {
  id: number;
  encrypted_yw_id?: string;
  display_name?: string;
  email?: string;
  photo_url?: string;
  class?: string;
  grade?: number;
  grade_class_id?: number;
  academic_year?: string;
  graduated?: number;
  totp_enabled?: number;
  role: string;
  admin_role?: string;
  /** IANA zone name. Undefined/null = fall back to the school default. */
  timezone?: string | null;
  notes_uploaded?: number;
  total_likes?: number;
  total_admin_upvotes?: number;
  /** Last authenticated request, ISO-8601 UTC. Refreshed at most every 15
   *  minutes by touchLastSeen(); feeds the daily active_users figure. */
  last_seen_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const MAX_REQUEST_SIZE = 10 * 1024 * 1024;
export const RATE_LIMIT_WINDOW = 900;
export const RATE_LIMIT_MAX_ATTEMPTS = 5;
/**
 * Ceiling for limits keyed on IP alone.
 *
 * The school sits behind one NAT, so every student shares a single public IP.
 * At RATE_LIMIT_MAX_ATTEMPTS that is five logins per quarter hour for the whole
 * school — one student fat-fingering a password locks out the class. Per-account
 * limits stay at 5 (that is what stops brute force); the shared-IP bucket only
 * has to stop a flood.
 */
export const RATE_LIMIT_MAX_ATTEMPTS_PER_IP = 100;
export const JWT_EXPIRATION = '24h';
export const REFRESH_TOKEN_EXPIRATION = '7d';
