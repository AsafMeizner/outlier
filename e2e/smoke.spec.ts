// Browser smoke test: first-time setup, a guest plays a round, the language switch flips the page to RTL.
// Needs a built web app (npm run build) and a Playwright Chromium (npx playwright install chromium).
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { SETUP_CODE_FILE } from './paths.ts';

const HEADERS = { 'x-outlier': '1', origin: 'http://127.0.0.1:8199' };

test.beforeAll(async ({ request }) => {
  const token = readFileSync(SETUP_CODE_FILE, 'utf8').trim();
  const r = await request.post('/api/setup', { headers: HEADERS, data: { token, username: 'admin', displayName: 'Admin', password: 'admin-password' } });
  expect(r.ok()).toBe(true);
});

test('a guest plays a round of the daily puzzle', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('button', { name: 'Play now' }).click();
  await expect(page.getByRole('heading', { name: /Daily launch/ })).toBeVisible();

  await page.goto('/play');
  // the card before a prompt names no category (no spoilers)
  await expect(page.getByRole('heading', { name: 'Ready for liftoff?' })).toBeVisible();
  await page.getByRole('button', { name: /First prompt/ }).click();
  const answer = page.getByRole('textbox');
  await expect(answer).toBeVisible();
  await page.getByRole('button', { name: /Pass/ }).click();
  await expect(page.getByRole('button', { name: /Next prompt/ })).toBeVisible();

  expect(errors).toEqual([]);
});

test('the language switch turns the page right-to-left', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'עברית' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('button', { name: 'לשחק עכשיו' })).toBeVisible();
});
