import { test as setup, expect } from '@playwright/test';
import { ACCOUNT_STATE } from '../playwright.config';
import { signUpViaApi, useToken } from './helpers';

/**
 * One shared account per run, created through the real signup route and stored as Playwright
 * storage state (the `token` localStorage key, same as the live app). Specs that only need "a
 * signed-in account" reuse it instead of signing up again; auth.spec.ts needs its own fresh email
 * for the duplicate-signup case (main allows 100 signups per 15 minutes per IP, but 5 logins per
 * 15 minutes per IP+email).
 */
setup('create the shared account', async ({ page, request }) => {
  const account = await signUpViaApi(request, 'shared');
  await useToken(page, account.token);
  await page.goto('/app/home');
  await expect(
    page.getByRole('button', { name: 'Sign out' }),
    'the stored token should open the account on Home',
  ).toBeVisible();
  await page.context().storageState({ path: ACCOUNT_STATE });
});
