import { encode } from 'next-auth/jwt';

import { expect, test } from '@playwright/test';

const AUTH_SECRET = 'e2e-auth-secret-not-for-production';

async function createSessionToken(githubId: string) {
  return encode({
    maxAge: 60 * 60,
    secret: AUTH_SECRET,
    token: {
      githubId,
      name: 'E2E User',
      sub: githubId,
    },
  });
}

test('AWS health is owner-only, uncached, and fails closed without runtime config', async ({
  browser,
  page,
}) => {
  const anonymous = await page.request.get('/api/admin/aws-health');
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()['cache-control']).toBe('no-store');

  const nonOwnerContext = await browser.newContext();
  await nonOwnerContext.addCookies([
    {
      domain: '127.0.0.1',
      httpOnly: true,
      name: 'next-auth.session-token',
      path: '/',
      sameSite: 'Lax',
      secure: false,
      value: await createSessionToken('e2e-non-owner'),
    },
  ]);
  const nonOwner = await nonOwnerContext.request.get(
    'http://127.0.0.1:3100/api/admin/aws-health',
  );
  expect(nonOwner.status()).toBe(401);
  expect(nonOwner.headers()['cache-control']).toBe('no-store');
  await nonOwnerContext.close();

  const context = await browser.newContext();
  await context.addCookies([
    {
      domain: '127.0.0.1',
      httpOnly: true,
      name: 'next-auth.session-token',
      path: '/',
      sameSite: 'Lax',
      secure: false,
      value: await createSessionToken('e2e-owner'),
    },
  ]);

  const owner = await context.request.get(
    'http://127.0.0.1:3100/api/admin/aws-health',
  );
  const ownerBody = await owner.text();

  expect(owner.status()).toBe(500);
  expect(owner.headers()['cache-control']).toBe('no-store');
  expect(ownerBody).toContain('AWS runtime health check failed.');
  expect(ownerBody).not.toMatch(
    /arn:aws|AWS_ACCESS_KEY|AWS_SECRET|AWS_EXPECTED|S3_BUCKET|TRANSFORMED_IMAGE/,
  );
  await context.close();
});
