-- OAuth provider registry, token storage, and state/PKCE table
-- Apply locally:  cd backend && npx wrangler d1 migrations apply notarium-db --local
-- Apply to prod:  cd backend && npx wrangler d1 migrations apply notarium-db

CREATE TABLE IF NOT EXISTS oauth_providers (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  client_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

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
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens(user_id);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  redirect_to TEXT,
  -- pkce_verifier is plaintext: short-lived (10 min TTL), deleted immediately after callback
  pkce_verifier TEXT NOT NULL,
  intent TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

INSERT OR IGNORE INTO oauth_providers (name, client_id, enabled)
VALUES ('google', '', 0);
