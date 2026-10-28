import { test, expect } from '@playwright/test';
import { ACCOUNT_STATE } from '../playwright.config';
import { mainStoresTextOnlyNotes, settled, snap } from './helpers';

/**
 * Create → publish → Notes flash → the note renders from `my-notes`, then Home lists it: a text-only
 * note round-trips through `extracted_text`/`content` and the block codec (`$$ ` formula prefix) on
 * the real Worker. The companion column is gone for accounts (main has no chat routes), so nothing
 * here touches it.
 */
test.use({ storageState: ACCOUNT_STATE });

test('create, publish, and read back a note with a paragraph and a formula block', async ({
  page,
  request,
}) => {
  // Main writes one row per image chunk, so a text-only POST /api/notes stores nothing today (main's
  // M1.5 fixes that). Probe the real route first: until it lands this stays fixme — recorded, not deleted.
  test.fixme(
    !(await mainStoresTextOnlyNotes(request)),
    'main M1.5 pending: a text-only POST /api/notes creates no row (createNote writes one row per image chunk), so publish cannot round-trip yet',
  );

  const stamp = Date.now();
  const title = `E2E Stoikiometri ${stamp}`;
  const paragraph = `Satu mol berisi 6,022 × 10²³ partikel (e2e ${stamp}).`;
  const formula = `n = m / Mr (e2e ${stamp})`;

  await page.goto('/app/create');
  await settled(page);

  const subject = page.getByLabel('Subject');
  await expect(
    subject.locator('option', { hasText: 'Kimia' }),
    'subjects should load from the Worker',
  ).toHaveCount(1);
  await subject.selectOption({ label: 'Kimia' });
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Paragraph').first().fill(paragraph);
  await page.getByRole('button', { name: '+ Formula' }).click();
  const formulaBox = page.getByLabel('Formula');
  await expect(formulaBox, '"+ Formula" should add a formula block').toBeVisible();
  await formulaBox.fill(formula);
  await expect(
    page.getByText('Draft · 2 blocks'),
    'two filled blocks should be counted',
  ).toBeVisible();

  await page.getByRole('button', { name: 'Review and publish' }).click();
  await expect(
    page.getByRole('heading', { name: 'Who sees it' }),
    'the publish phase should open',
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'My class', pressed: true }),
    'accounts default to the class audience',
  ).toBeVisible();
  const publish = page.getByRole('button', { name: 'Publish anyway' });
  await expect(publish, 'with a title and a subject the publish button is enabled').toBeEnabled();
  await publish.click();

  await expect(
    page,
    'publishing should hand over to /app/notes, opening the row main wrote',
  ).toHaveURL(/\/app\/notes\?note=\d+&subject=\d+$/);
  await expect(page.getByRole('status'), 'the one-shot flash should name the audience').toHaveText(
    'Published to my class',
  );

  const rail = page.getByRole('navigation', { name: 'Your notes' });
  await expect(
    rail.getByRole('button', { name: title }),
    'the new note should be listed in the rail from /api/notes/my-notes',
  ).toBeVisible();
  const article = page.locator('article');
  await expect(
    article.getByRole('heading', { name: title }),
    'the new note should be the selected note',
  ).toBeVisible();
  await expect(
    article.getByText(paragraph, { exact: true }),
    'the paragraph should render from the note body',
  ).toBeVisible();
  const formulaBlock = article.getByText(formula, { exact: true });
  await expect(formulaBlock, 'the formula should render from the note body').toBeVisible();
  expect(
    await formulaBlock.evaluate((el) => el.tagName),
    'the formula should render as a formula block (div), not a paragraph',
  ).toBe('DIV');
  await expect(
    article.getByText(/^Published · \d{4}-\d{2}-\d{2}$/),
    'the note should be published',
  ).toBeVisible();
  await expect(
    article.getByText('Summary'),
    'main fills summary with the description (the first paragraph), which must not render twice',
  ).toHaveCount(0);
  await expect(page.getByText('AI companion'), 'accounts get no companion column').toHaveCount(0);
  await snap(page, 'notes');

  await page.goto('/app/home');
  await settled(page);
  await expect(
    page.getByRole('heading', { name: 'Your notes' }),
    'Home should show the live "Your notes" module',
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: new RegExp(title) }).first(),
    'Home "Your notes" should list the new note',
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: `Continue ${title}` }),
    'the hero should pick up the latest note',
  ).toBeVisible();
});
