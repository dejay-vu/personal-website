import { expect, test } from '@playwright/test';

import { installMediaRoute } from './support/browser';

test.beforeEach(async ({ page }) => {
  await installMediaRoute(page);
});

test('The Lab lists the instrument card and the reserved bench', async ({
  page,
}) => {
  await page.goto('/the-lab');

  await expect(page.locator('h1')).toContainText('The Lab');

  const cards = page.locator('article.neon-card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator('a[href^="/the-lab/"]')).toHaveAttribute(
    'href',
    '/the-lab/slurmdeck',
  );
  await expect(cards.first()).toContainText(
    'PYTHON · CLI + TUI · V0.1.0 · MIT',
  );

  await expect(page.locator('.neon-bench')).toBeVisible();
});

test('project cards navigate to the canonical detail page', async ({
  page,
}) => {
  await page.goto('/the-lab');
  await page.locator('article.neon-card a[href="/the-lab/slurmdeck"]').click();

  await expect(page).toHaveURL(/\/the-lab\/slurmdeck$/);
  await expect(page.locator('[data-project-title]')).toHaveText(/slurmdeck/i);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/the-lab\/slurmdeck$/,
  );

  const jsonLd = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  expect(jsonLd.map((value) => JSON.parse(value)['@type'])).toContain(
    'SoftwareSourceCode',
  );

  // The checked-in TUI capture is served same-origin and renders in the
  // console frame.
  await expect(
    page.locator('.project-console img[src*="slurmdeck-tui"]'),
  ).toBeVisible();
  const asset = await page.request.get('/projects/slurmdeck-tui.svg');
  expect(asset.ok()).toBe(true);
  expect(await asset.text()).toContain('<svg');

  await expect(page.locator('.project-rail__step')).toHaveCount(5);
  await expect(page.locator('.project-spec__install')).toContainText(
    'pipx install slurmdeck',
  );
});

test('the detail page returns to The Lab, not the gate', async ({ page }) => {
  await page.goto('/the-lab/slurmdeck');

  const back = page
    .getByRole('navigation', { name: 'Return' })
    .getByRole('link');
  await expect(back).toHaveText(/THE LAB/);
  await expect(back).toHaveAttribute('href', '/the-lab');

  await back.click();
  await expect(page).toHaveURL(/\/the-lab$/);
  await expect(page.locator('article.neon-card')).toHaveCount(1);
});

test('unknown project slugs return the canonical 404', async ({ page }) => {
  const response = await page.goto('/the-lab/e2e-definitely-missing');
  expect(response?.status()).toBe(404);
});
