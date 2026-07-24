export interface Env {
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
  GEMINI_API_KEY?: string;
  JWT_SECRET: string;
  ADMIN_PASSWORD: string;
  MODERATOR_PASSWORD?: string;
  TECH_PASSWORD?: string;
  DEEPSEEK_API_KEY?: string;
  GOOGLE_CLOUD_VISION_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
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
  notes_uploaded?: number;
  total_likes?: number;
  total_admin_upvotes?: number;
  created_at?: string;
  updated_at?: string;
}

export const MAX_REQUEST_SIZE = 10 * 1024 * 1024;
export const RATE_LIMIT_WINDOW = 900;
export const RATE_LIMIT_MAX_ATTEMPTS = 5;
export const JWT_EXPIRATION = '24h';
export const REFRESH_TOKEN_EXPIRATION = '7d';
