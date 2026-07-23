export type GoogleTokens = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  scope: string;
  expiresAt: number; // unix seconds
};

// base64url: RFC 4648 §5 — no padding, + → -, / → _
function toBase64Url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export async function generatePkcePair(): Promise<{ verifier: string; challenge: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = toBase64Url(bytes.buffer);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = toBase64Url(hash);
  return { verifier, challenge };
}

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  challenge: string;
  loginHint?: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: opts.scopes.join(' '),
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });
  if (opts.loginHint) params.set('login_hint', opts.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function postToken(body: URLSearchParams): Promise<GoogleTokens> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token request failed ${res.status}: ${text}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    scope: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    scope: data.scope,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
  };
}

export function exchangeCode(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  verifier: string;
}): Promise<GoogleTokens> {
  return postToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      code: opts.code,
      code_verifier: opts.verifier,
    }),
  );
}

export function refreshTokens(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<GoogleTokens> {
  return postToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      refresh_token: opts.refreshToken,
    }),
  );
}

export async function revokeToken(token: string): Promise<void> {
  const res = await fetch(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
    { method: 'POST' },
  );
  // 200 = revoked, 400 = already revoked — both acceptable
  if (!res.ok && res.status !== 400) {
    const text = await res.text();
    throw new Error(`Google revoke failed ${res.status}: ${text}`);
  }
}

export async function importAesKey(base64Key: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// ciphertext wire format: base64( 12-byte IV || encrypted bytes )
export async function encryptToken(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(12 + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), 12);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptToken(key: CryptoKey, ciphertext: string): Promise<string> {
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plain);
}
