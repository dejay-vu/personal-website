import { encode } from 'next-auth/jwt';

import { expect, test } from '@playwright/test';

import { installMediaRoute } from './support/browser';

const AUTH_SECRET = 'e2e-auth-secret-not-for-production';

test.beforeEach(async ({ page }) => {
  await installMediaRoute(page);
});

test('public shells contain no Admin entry or owner-login action', async ({
  page,
}) => {
  await page.goto('/field-notes');
  const notePath = await page
    .locator('a[href^="/field-notes/"]')
    .first()
    .getAttribute('href');
  await page.goto('/darkroom');
  const photoPath = await page
    .locator('a[href^="/darkroom/"]')
    .filter({ has: page.locator('img') })
    .first()
    .getAttribute('href');

  const paths = [
    '/',
    '/field-notes',
    notePath!,
    '/darkroom',
    photoPath!,
    '/the-lab',
    '/contact',
  ];

  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Owner login' })).toHaveCount(
      0,
    );
  }
});

test('direct Admin access retains anonymous and owner behavior', async ({
  browser,
  page,
}) => {
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { level: 3, name: 'Owner login' }),
  ).toBeVisible();
  const anonymous = await page.request.get(
    '/api/admin/uploads/status?uploadId=00000000-0000-4000-8000-000000000000',
  );
  expect(anonymous.status()).toBe(401);
  const robots = await page.request.get('/robots.txt');
  expect(await robots.text()).toContain('Disallow: /admin');

  const token = await encode({
    maxAge: 60 * 60,
    secret: AUTH_SECRET,
    token: {
      githubId: 'e2e-owner',
      name: 'E2E Owner',
      sub: 'e2e-owner',
    },
  });
  const context = await browser.newContext();
  await context.addCookies([
    {
      domain: '127.0.0.1',
      httpOnly: true,
      name: 'next-auth.session-token',
      path: '/',
      sameSite: 'Lax',
      secure: false,
      value: token,
    },
  ]);
  const ownerPage = await context.newPage();
  await ownerPage.goto('http://127.0.0.1:3100/admin');
  await expect(
    ownerPage.getByRole('heading', { level: 1, name: 'Media workspace' }),
  ).toBeVisible();
  const authorized = await ownerPage.request.get(
    'http://127.0.0.1:3100/api/admin/uploads/status?uploadId=00000000-0000-4000-8000-000000000000',
  );
  expect(authorized.status()).toBe(200);
  await context.close();
});
