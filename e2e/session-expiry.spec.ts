import { test, expect } from '@playwright/test';
import { ACCOUNT_STATE } from '../playwright.config';
import { forgedJwt, readToken, settled, snap } from './helpers';

/**
 * F1 browser leg: a token the Worker rejects must end on /login, whether it is found at
 * bootstrap (full load) or mid-session (an authenticated call answers 401 → sign-out).
 * Holds after Wave 2 too: a refresh attempt with no/invalid refresh token must also sign out.
 */
test.use({ storageState: ACCOUNT_STATE });

const setForgedToken = (page: Parameters<typeof readToken>[0]) =>
  page.evaluate((t) => localStorage.setItem('token', t), forgedJwt());

test('a wrongly-signed token at page load bounces to /login and is cleared', async ({ page }) => {
  await page.goto('/app/home');
  await expect(
    page.getByRole('button', { name: 'Sign out' }),
    'the shared account should be signed in first',
  ).toBeVisible();

  await setForgedToken(page);
  await page.goto('/app/notes');

  await expect(page, 'bootstrapping with a rejected token should end on /login').toHaveURL(
    /\/login$/,
  );
  expect(
    await readToken(page),
    'the rejected token should be removed from localStorage',
  ).toBeNull();
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await snap(page, 'session-expiry');
});

test('a wrongly-signed token mid-session signs out on the first 401 and lands on /login', async ({
  page,
}) => {
  await page.goto('/app/home');
  await expect(
    page.getByRole('button', { name: 'Sign out' }),
    'the shared account should be signed in first',
  ).toBeVisible();
  // Let Home's own fetches finish (subjects → community notes) so the first call with the forged token is the one below.
  await settled(page);

  await setForgedToken(page);
  // In-app navigation (no reload): Notes calls /api/notes/my-notes with the bad token → 401.
  const unauthorized = page.waitForResponse(
    (r) => r.url().endsWith('/api/notes/my-notes') && r.status() === 401,
  );
  await page.getByRole('link', { name: 'Notes' }).first().click();
  await unauthorized;

  await expect(page, 'a 401 on an authenticated call should sign out to /login').toHaveURL(
    /\/login$/,
  );
  expect(await readToken(page), 'sign-out on 401 should clear localStorage.token').toBeNull();
});
