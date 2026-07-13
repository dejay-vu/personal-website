import { expect, test } from '@playwright/test';

import { installMediaRoute } from './support/browser';

test.beforeEach(async ({ page }) => {
  await installMediaRoute(page);
});

test('the retired standalone contact route returns 404', async ({ page }) => {
  const response = await page.goto('/contact');

  if (!response) {
    throw new Error('Expected /contact navigation to return a response.');
  }

  expect(response.status()).toBe(404);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Page not found' }),
  ).toBeVisible();

  const sitemap = await page.request.get('/sitemap.xml');
  expect(await sitemap.text()).not.toContain('/contact</loc>');
});

test('the homepage retains the contact form', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#contact form')).toHaveCount(1);
});
