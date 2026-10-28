import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNT_STATE, API_URL } from '../playwright.config';

export const SCREENSHOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '__screenshots__',
);

/** Fixed test credentials — not a secret; every account is created fresh on the local D1 per run. */
export const PASSWORD = 'e2e-password-123';
export const ACCOUNT_NAME = 'E2E Account';
/**
 * Every e2e account needs a class. `RequireSession` holds an account whose `class` is NULL on
 * /welcome until it picks one — Google creates the row that way on purpose — so an account made
 * here without one never reaches /app/*. `10.1` is a seeded `grade_classes` row on main.
 */
export const ACCOUNT_CLASS = '10.1';

/** Unique per run and per call, so a re-run inside the same Worker state never hits the 409. Main only accepts its school domain. */
export const EMAIL_DOMAIN = 'sekolahkristencalvin.org';
export const uniqueEmail = (tag: string) =>
  `e2e-${tag}-${Date.now()}-${randomBytes(3).toString('hex')}@${EMAIL_DOMAIN}`;

export type ApiAccount = {
  email: string;
  password: string;
  name: string;
  token: string;
  user: { id: number; name: string; email: string };
};

/** Create an account straight on the Worker (bypasses the UI, but it is the real signup route), in `ACCOUNT_CLASS` so it is past the profile gate. Main answers 201 `{ token, user }`. */
export async function signUpViaApi(
  request: APIRequestContext,
  tag: string,
  name = ACCOUNT_NAME,
): Promise<ApiAccount> {
  const email = uniqueEmail(tag);
  const res = await request.post(`${API_URL}/api/auth/signup`, {
    data: { email, password: PASSWORD, name, class: ACCOUNT_CLASS },
  });
  const body = await res.json().catch(() => ({}));
  expect(
    res.status(),
    `POST /api/auth/signup for ${email} should return 201, got ${res.status()} ${JSON.stringify(body)}`,
  ).toBe(201);
  return { email, password: PASSWORD, name, token: body.token, user: body.user };
}

/** Put an account token in localStorage the way `signIn` does, then reload so the store bootstraps from it. */
export async function useToken(page: Page, token: string) {
  await page.goto('/login');
  await page.evaluate((t) => localStorage.setItem('token', t), token);
}

/** Sign in straight on the Worker. The sign-in screen is school Google only, so there is no password form to drive. */
export async function loginViaApi(
  request: APIRequestContext,
  email: string,
  password = PASSWORD,
): Promise<string> {
  const res = await request.post(`${API_URL}/api/auth/login`, { data: { email, password } });
  const body = await res.json().catch(() => ({}));
  expect(
    res.status(),
    `POST /api/auth/login for ${email} should return 200, got ${res.status()} ${JSON.stringify(body)}`,
  ).toBe(200);
  return body.token;
}

/**
 * Become a guest through the one door the app still has for it: onboarding's "Continue as guest
 * instead", on the account step after the three questions. The sign-in screen is school Google
 * only, so the old `/login` button is gone — guest mode itself is not.
 */
export async function asGuest(page: Page) {
  await page.goto('/onboard');
  for (const heading of [
    'What are you studying?',
    'How do you usually study?',
    'How long is a session?',
  ]) {
    await expect(
      page.getByRole('heading', { name: heading }),
      `onboarding should reach "${heading}"`,
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await expect(
    page.getByRole('heading', { name: 'Keep this space' }),
    'the account step should follow the three questions',
  ).toBeVisible();
  // Keyboard, not a click: the account step autofocuses Name, and the blur a mousedown causes marks
  // it touched, which inserts "Enter your name" above the button row. The layout shifts between
  // mousedown and mouseup and the click lands next to the button, so the door never opens.
  const door = page.getByRole('button', { name: 'Continue as guest instead' });
  await door.focus();
  await door.press('Enter');
}

/**
 * A JWT that parses (three base64url parts, HS256 header, unexpired payload) but was never signed
 * with the Worker's secret, so `jwtVerify` rejects it and every authenticated route answers 401.
 */
export function forgedJwt(userId = 1) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({
    id: userId,
    email: `forged@${EMAIL_DOMAIN}`,
    role: 'student',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `${header}.${payload}.${randomBytes(32).toString('base64url')}`;
}

/** One evidence screenshot per spec under e2e/__screenshots__/ (gitignored). */
export const snap = (page: Page, name: string) =>
  page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });

/** Wait until no loading skeleton is on screen (Home `aria-busy`, Notes/Discover `animate-pulse`). */
export async function settled(page: Page) {
  await expect(
    page.locator('[data-screen-label]').first(),
    'a screen should have rendered',
  ).toBeVisible();
  await expect(
    page.locator('[aria-busy="true"], .animate-pulse'),
    'loading skeletons should have cleared',
  ).toHaveCount(0);
}

export const readToken = (page: Page) => page.evaluate(() => localStorage.getItem('token'));

/** The shared account's Worker token, read back from the storage state auth.setup.ts saved. */
export function accountToken(): string {
  const state = JSON.parse(readFileSync(ACCOUNT_STATE, 'utf8')) as {
    origins: { localStorage: { name: string; value: string }[] }[];
  };
  const token = state.origins.flatMap((o) => o.localStorage).find((e) => e.name === 'token')?.value;
  if (!token) throw new Error(`no token in ${ACCOUNT_STATE}; did the setup project run?`);
  return token;
}

/**
 * Main today writes one `notes` row per image chunk (`createNote`, backend/src/routes/notes.ts), so a
 * text-only POST /api/notes answers `{ notes: [], success: true, totalParts: 0 }` and stores nothing —
 * M1.5 on main is fixing that. True once a text-only draft comes back with a `note`.
 */
export async function mainStoresTextOnlyNotes(request: APIRequestContext): Promise<boolean> {
  const token = accountToken();
  const subjects = (await (await request.get(`${API_URL}/api/subjects`)).json()) as {
    subjects: { id: number; name: string }[];
  };
  const kimia = subjects.subjects.find((s) => s.name === 'Kimia');
  if (!kimia) throw new Error('main should seed a Kimia subject');
  const res = await request.post(`${API_URL}/api/notes`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title: 'e2e probe — text-only',
      subject_id: kimia.id,
      extracted_text: 'probe',
      content: 'probe',
      description: 'probe',
      tags: [],
      status: 'draft',
      visibility: 'class',
    },
  });
  expect(res.status(), 'the probe POST /api/notes should be accepted').toBe(200);
  const body = (await res.json()) as { note?: { id: number } };
  return !!body.note;
}
