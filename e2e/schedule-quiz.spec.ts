import { test, expect } from '@playwright/test';
import { signUpViaApi, snap, useToken } from './helpers';

/** The two new corners: Schedule (ask a tutor for a subject on a day) and Quiz (picker renders). */
test('a student asks for help on the Schedule and sees the ask counted', async ({
  page,
  request,
}) => {
  const account = await signUpViaApi(request, 'sched', 'E2E Schedule');
  await useToken(page, account.token);
  await page.goto('/app/schedule');
  await expect(page.getByRole('heading', { name: 'Tutors this week' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Day' }).first().selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Send request' }).click();
  const ask = page.getByRole('button', { name: /· 1 \(you — withdraw\)/ });
  await expect(ask, 'the ask should show on Tomorrow, counted once and marked mine').toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Tomorrow' }).getByText('Asked for:'),
  ).toBeVisible();
  await snap(page, 'schedule');
  await ask.click();
  await expect(ask).toHaveCount(0);
  await expect(page.getByText('Become a tutor')).toBeVisible();
});

test('the Quiz screen offers difficulty and no timer or break mode', async ({ page, request }) => {
  const account = await signUpViaApi(request, 'quiz', 'E2E Quiz');
  await useToken(page, account.token);
  await page.goto('/app/quiz');
  await expect(page.getByRole('heading', { name: 'Test yourself on shared notes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'hard' })).toBeVisible();
  await expect(page.getByText(/break|minutes/i)).toHaveCount(0);
  await snap(page, 'quiz');
});
