import { test, expect, type Page } from '@playwright/test';
import {
  ACCOUNT_CLASS,
  PASSWORD,
  loginViaApi,
  readToken,
  snap,
  uniqueEmail,
  useToken,
} from './helpers';

/**
 * Signup → Home → sign out → sign in again → duplicate-email signup, all against the real Worker.
 * Serial on purpose: the account created through onboarding is the one that signs back in and then
 * collides on the second signup — main rate-limits logins (5 / 15 min / IP+email), so one account
 * and three sign-ins per journey is the budget. The password path runs on the Worker, not the
 * sign-in screen: that screen is school Google only.
 */
test.describe.serial('account journey', () => {
  const email = uniqueEmail('auth');
  const name = 'E2E Onboard';

  const walkToAccountStep = async (page: Page) => {
    await page.goto('/onboard');
    await expect(
      page.getByRole('heading', { name: 'What are you studying?' }),
      'onboarding should open on question 1',
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'How do you usually study?' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'How long is a session?' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Keep this space' }),
      'the account step should follow the three questions',
    ).toBeVisible();
  };

  const fillAccount = async (page: Page) => {
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    // RequireSession holds a classless account on /welcome, so a signup that skips the class never
    // reaches Home — onboarding now requires it, and this fills it so the journey is the real one.
    await page.getByLabel('Class', { exact: true }).fill(ACCOUNT_CLASS);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'This is what opens tomorrow' }),
      'a valid account form should advance to the result step',
    ).toBeVisible();
  };

  test('onboarding signup lands on Home with the greeting', async ({ page }) => {
    await walkToAccountStep(page);
    await fillAccount(page);
    await page.getByRole('button', { name: 'Enter Notarium' }).click();

    await expect(page, 'signup should land on /app/home').toHaveURL(/\/app\/home$/);
    await expect(
      page.locator('h1'),
      'Home headline should greet the new account by first name',
    ).toContainText('Sore, E2E');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    expect(
      await readToken(page),
      'signup should store the Worker token under localStorage.token',
    ).toBeTruthy();
    await snap(page, 'auth');
  });

  test('sign out returns to /login and signing in again returns to Home', async ({
    page,
    request,
  }) => {
    // The sign-in screen is school Google only now, so the password path is driven on the Worker
    // and the token is placed the way `signIn` does. Sign-out is still the real UI journey.
    await useToken(page, await loginViaApi(request, email));
    await page.goto('/app/home');
    await expect(page, 'a stored token should land on /app/home').toHaveURL(/\/app\/home$/);
    await expect(page.locator('h1')).toContainText('Sore, E2E');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page, 'sign out should go to /login').toHaveURL(/\/login$/);
    // Polled, not read once: against a worker that issues refresh tokens the store
    // waits for POST /api/auth/logout to settle before forgetting the keys (its
    // generation guard needs whatever the logout's own refresh rotated to). The UI
    // is already signed out by then, so only the key lags, by one round trip.
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

  test('signing up again with the same email points to /login', async ({ page }) => {
    await walkToAccountStep(page);
    await fillAccount(page);
    await page.getByRole('button', { name: 'Enter Notarium' }).click();

    const alert = page.getByRole('alert');
    await expect(
      alert,
      'the Worker 409 should surface as the already-has-an-account message',
    ).toContainText('That email already has an account.');
    const signIn = alert.getByRole('link', { name: 'Sign in instead' });
    await expect(signIn, 'the duplicate-email alert should link to /login').toHaveAttribute(
      'href',
      '/login',
    );
    await expect(page, 'a failed signup must stay on /onboard').toHaveURL(/\/onboard$/);
    await signIn.click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
