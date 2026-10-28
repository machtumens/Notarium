import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ACCOUNT_STATE } from '../playwright.config';
import { asGuest, settled, snap } from './helpers';

/**
 * Phone viewport (375×812): no horizontal overflow and the bottom tab bar on guest Home and the
 * four account screens (the AI surface is guest-only — accounts are redirected to Home); axe on
 * the four account screens, failing on serious/critical violations that are not on the known-gap
 * list below.
 */
const WIDTH = 375;
// Reduced motion: the `animate-rise` entrance fades modules in, and axe read mid-fade colours
// on some runs (a node flagged on one run and not the next). The app disables the animation
// under prefers-reduced-motion, so colours are final when axe runs.
test.use({ viewport: { width: WIDTH, height: 812 }, contextOptions: { reducedMotion: 'reduce' } });

const ACCOUNT_SCREENS: { name: string; path: string; label: string }[] = [
  { name: 'home', path: '/app/home', label: 'Adaptive Home' },
  { name: 'discover', path: '/app/discover', label: 'Discover' },
  { name: 'notes', path: '/app/notes', label: 'Note viewer' },
  { name: 'create', path: '/app/create', label: 'Create and publish a note' },
];

/**
 * Known gaps: pre-existing serious/critical violations the gate must NOT fail on, so it only
 * catches NEW ones. Empty as of 20 Sep 2026 — how that was decided:
 *   1. First runs (no reduced-motion) flagged 10–13 `color-contrast` nodes on Home (accent-700
 *      kickers, the sage stat card, the AI panel), but the set changed from run to run.
 *   2. With `reducedMotion: 'reduce'` (above) four runs — two with a note on the account, two
 *      without — reported zero serious/critical nodes on all (then five) screens: the failures were
 *      axe reading colours mid-way through the `animate-rise` fade-in, not the resting palette.
 * To add an entry: run with `E2E_AXE_DUMP=<dir> npm run e2e -- e2e/responsive-a11y.spec.ts`
 * twice, keep only nodes present in both dumps whose cause is the ported design (not a V2.0
 * change), and record `screen` ('*' for any), the axe rule `id`, the `element` key
 * (`tag.class list`, printed in the failure message) and a `note` naming the design decision.
 */
const KNOWN_GAPS: { screen: string; id: string; element: string; note: string }[] = [];

/** `tag.class list` of a violating node — stable across data states, unlike axe's nth-child CSS targets. */
const elementKey = (html: string) =>
  `${html.match(/^<([a-z0-9]+)/i)?.[1].toLowerCase() ?? '?'}.${html.match(/class="([^"]*)"/)?.[1] ?? ''}`;
const isKnown = (screen: string, id: string, element: string) =>
  KNOWN_GAPS.some(
    (g) => (g.screen === '*' || g.screen === screen) && g.id === id && g.element === element,
  );

async function noOverflowWithTabBar(page: Page, screen: string) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(
    scrollWidth,
    `${screen}: the document should not scroll horizontally at ${WIDTH}px (scrollWidth ${scrollWidth})`,
  ).toBeLessThanOrEqual(WIDTH);
  await expect(
    page.getByRole('navigation', { name: 'Main' }),
    `${screen}: the bottom tab bar should be visible on a phone`,
  ).toBeVisible();
}

async function axeGate(page: Page, screen: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .flatMap((v) =>
      v.nodes.map((n) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        helpUrl: v.helpUrl,
        target: String(n.target[0] ?? ''),
        element: elementKey(n.html),
        html: n.html.slice(0, 160),
      })),
    );
  // E2E_AXE_DUMP=<dir> writes every serious/critical node per screen — how KNOWN_GAPS gets (re)built.
  if (process.env.E2E_AXE_DUMP) {
    mkdirSync(process.env.E2E_AXE_DUMP, { recursive: true });
    writeFileSync(
      path.join(process.env.E2E_AXE_DUMP, `axe-${screen}.json`),
      JSON.stringify(blocking, null, 2),
    );
  }
  const fresh = blocking.filter((b) => !isKnown(screen, b.id, b.element));
  const report = fresh
    .map(
      (b) =>
        `  [${b.impact}] ${b.id} — ${b.help}\n    element: ${b.element}\n    target:  ${b.target}\n    html:    ${b.html}\n    ${b.helpUrl}`,
    )
    .join('\n');
  expect(
    fresh.length,
    `${screen}: ${fresh.length} serious/critical axe violation node(s) not on the known-gap list:\n${report}`,
  ).toBe(0);
}

test('guest Home fits a phone and shows the tab bar', async ({ page }) => {
  await asGuest(page);
  await expect(page).toHaveURL(/\/app\/home$/);
  await settled(page);
  await noOverflowWithTabBar(page, 'guest home');
  await snap(page, 'responsive-a11y');
});

test.describe('account screens', () => {
  test.use({ storageState: ACCOUNT_STATE });

  for (const screen of ACCOUNT_SCREENS) {
    test(`${screen.name} fits a phone, shows the tab bar, and passes axe`, async ({ page }) => {
      await page.goto(screen.path);
      await expect(
        page.locator(`[data-screen-label="${screen.label}"]`),
        `${screen.path} should render the ${screen.name} screen`,
      ).toBeVisible();
      await settled(page);
      await noOverflowWithTabBar(page, screen.name);
      await axeGate(page, screen.name);
    });
  }
});
