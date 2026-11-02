import { test, expect } from '@playwright/test';
import { loginViaApi, readToken, signUpViaApi, snap, useToken } from './helpers';

/**
 * Sign in → Home → sign out → sign in again, against the real Worker. The sign-in screen is Google
 * only, so the account is made and signed in on the Worker and the token placed the way `signIn`
 * does; sign-out is the real UI journey. Serial: main rate-limits logins (5 / 15 min / IP+email).
 * The old /onboard signup journey is in archive/demo-2026-11/e2e.
 */
test.describe.serial('account journey', () => {
  let email = '';

  test('a new account lands on Home with the greeting', async ({ page, request }) => {
    const account = await signUpViaApi(request, 'auth', 'E2E Onboard');
    email = account.email;
    await useToken(page, account.token);
    await page.goto('/app/home');
    await expect(page, 'a stored token should land on /app/home').toHaveURL(/\/app\/home$/);
    await expect(page.locator('h1'), 'Home should greet the account by first name').toContainText(
      'Hi, E2E',
    );
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    expect(await readToken(page)).toBeTruthy();
    await snap(page, 'auth');
  });

  test('sign out returns to /login and signing in again returns to Home', async ({
    page,
    request,
  }) => {
    await useToken(page, await loginViaApi(request, email));
    await page.goto('/app/home');
    await expect(page, 'a stored token should land on /app/home').toHaveURL(/\/app\/home$/);
    await expect(page.locator('h1')).toContainText('Hi, E2E');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page, 'sign out should go to /login').toHaveURL(/\/login$/);
    // Polled, not read once: against a worker that issues refresh tokens the store
    // waits for POST /api/auth/logout to settle before forgetting the keys.
    await expect
      .poll(() => readToken(page), { message: 'sign out should clear localStorage.token' })
      .toBeNull();

    await useToken(page, await loginViaApi(request, email));
    await page.goto('/app/home');
    await expect(page, 'signing in after sign out should reach /app/home again').toHaveURL(
      /\/app\/home$/,
    );
  });

  test('the sign-in screen offers Google and nothing else', async ({ page }) => {
    await page.goto('/login');
    await expect(
      page.getByRole('button', { name: /Continue with Google/ }),
      'the one way in should be the Google button',
    ).toBeVisible();
    await expect(
      page.getByLabel('Password', { exact: true }),
      'there should be no password form on /login',
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Continue as guest' }),
      'there should be no guest door on /login',
    ).toHaveCount(0);
  });
});
