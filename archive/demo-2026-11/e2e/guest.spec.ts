import { test, expect } from '@playwright/test';
import { ACCOUNT_STATE } from '../playwright.config';
import { asGuest, snap } from './helpers';

/** Guest mode (seeded — the sign-in screen has no guest door), the reload fix (F2), and the DemoOnly gate for accounts. */
test.describe('guest', () => {
  test('a guest opens Home, reload keeps the guest, and demo screens open', async ({ page }) => {
    // / has no landing page any more: it redirects a visitor with no session to /login.
    await page.goto('/');
    await expect(page, '/ should hand a visitor with no session to the sign-in screen').toHaveURL(
      /\/login$/,
    );
    // The guest door moved with the landing page: it is onboarding's "Continue as guest instead".
    await asGuest(page);
    await expect(
      page,
      'the onboarding guest door should land on /app/home without a login',
    ).toHaveURL(/\/app\/home$/);
    await expect(
      page.getByText('Guest · sample data'),
      'the guest pill should be in the top strip',
    ).toBeVisible();
    await expect(page.locator('h1'), 'guest Home should show the design greeting').toContainText(
      'Sore, Arga',
    );
    expect(
      await page.evaluate(() => localStorage.getItem('token')),
      'a guest must not hold a token',
    ).toBeNull();

    // F2: the guest flag lives in sessionStorage, so a reload must not bounce to /login.
    await page.reload();
    await expect(page, 'reload should keep the guest on /app/home').toHaveURL(/\/app\/home$/);
    await expect(
      page.getByText('Guest · sample data'),
      'the guest pill should survive a reload',
    ).toBeVisible();

    await page.goto('/app/practice');
    await expect(page, 'a guest should be able to open /app/practice').toHaveURL(
      /\/app\/practice$/,
    );
    await expect(
      page.locator('[data-screen-label="Practice"]'),
      'the Practice demo screen should render for a guest',
    ).toBeVisible();
    await snap(page, 'guest');
  });
});

test.describe('account', () => {
  test.use({ storageState: ACCOUNT_STATE });

  test('a signed-in account visiting /app/practice is sent to /app/home', async ({ page }) => {
    await page.goto('/app/practice');
    await expect(page, 'DemoOnly should redirect an account away from the demo screen').toHaveURL(
      /\/app\/home$/,
    );
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.locator('[data-screen-label="Practice"]')).toHaveCount(0);
  });

  test('a signed-in account visiting /app/ai is sent to /app/home and sees no AI entry point (main has no chat routes)', async ({
    page,
  }) => {
    await page.goto('/app/ai');
    await expect(page, 'the AI surface is guest-only').toHaveURL(/\/app\/home$/);
    await expect(page.locator('[data-screen-label="AI tutor surface"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ask Notarium AI' })).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'AI' }),
    ).toHaveCount(0);
  });
});
