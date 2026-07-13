import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { handleStorageDeletionCronRequest } from '../../src/modules/media/deletionCron';

test('the storage deletion cron accepts only the exact configured bearer token', async () => {
  for (const request of [
    new Request('https://example.test/api/cron/storage-deletions'),
    new Request('https://example.test/api/cron/storage-deletions', {
      headers: { authorization: 'Bearer wrong' },
    }),
    new Request('https://example.test/api/cron/storage-deletions', {
      headers: { authorization: 'Bearer cron-secret extra' },
    }),
  ]) {
    let calls = 0;
    const response = await handleStorageDeletionCronRequest(request, {
      cronSecret: 'cron-secret',
      drain: async () => {
        calls += 1;
        return 0;
      },
    });

    assert.equal(response.status, 401);
    assert.equal(calls, 0);
  }

  let calls = 0;
  const response = await handleStorageDeletionCronRequest(
    new Request('https://example.test/api/cron/storage-deletions', {
      headers: { authorization: 'Bearer cron-secret' },
    }),
    {
      cronSecret: 'cron-secret',
      drain: async () => {
        calls += 1;
        return 3;
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.deepEqual(await response.json(), {
    data: { claimed: 3 },
    ok: true,
  });
});

test('the storage deletion cron fails closed without CRON_SECRET', async () => {
  let calls = 0;
  const response = await handleStorageDeletionCronRequest(
    new Request('https://example.test/api/cron/storage-deletions', {
      headers: { authorization: 'Bearer undefined' },
    }),
    {
      cronSecret: undefined,
      drain: async () => {
        calls += 1;
        return 1;
      },
    },
  );

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test('the App Router cron endpoint fails closed when deployment config is missing', async () => {
  const previousSecret = process.env.CRON_SECRET;

  delete process.env.CRON_SECRET;

  try {
    const { GET } =
      await import('../../src/app/api/cron/storage-deletions/route');
    const response = await GET(
      new Request('https://example.test/api/cron/storage-deletions', {
        headers: { authorization: 'Bearer undefined' },
      }),
    );

    assert.equal(response.status, 401);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previousSecret;
    }
  }
});

test('Vercel schedules a Hobby-compatible daily authenticated drain', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
    crons?: { path?: string; schedule?: string }[];
  };
  const cronRoute = readFileSync(
    'src/app/api/cron/storage-deletions/route.ts',
    'utf8',
  );
  const envExample = readFileSync('.env.example', 'utf8');

  assert.deepEqual(config.crons, [
    {
      path: '/api/cron/storage-deletions',
      schedule: '0 0 * * *',
    },
  ]);
  assert.match(cronRoute, /cronSecret:\s*process\.env\.CRON_SECRET/);
  assert.match(cronRoute, /drainStorageDeletionJobs\(\{ limit: 20 \}\)/);
  assert.match(envExample, /^CRON_SECRET=$/m);
});

test('the manual drain route is owner-gated and supports explicit retry', () => {
  const route = readFileSync(
    'src/app/api/admin/storage-deletions/drain/route.ts',
    'utf8',
  );
  const authIndex = route.indexOf('requireAdminRequest(request)');
  const drainIndex = route.indexOf('drainStorageDeletionJobs({');

  assert.notEqual(authIndex, -1);
  assert.notEqual(drainIndex, -1);
  assert.ok(authIndex < drainIndex);
  assert.match(route, /z\.enum\(\['drain', 'retry'\]\)/);
  assert.match(route, /retryFailedStorageDeletionJobs\(\{ now \}\)/);
});

test('the admin dashboard exposes queue counts, recent errors, and controls', () => {
  const dashboardModule = readFileSync(
    'src/modules/admin/dashboard.ts',
    'utf8',
  );
  const dashboard = readFileSync(
    'src/components/admin/AdminDashboard.tsx',
    'utf8',
  );

  assert.match(dashboardModule, /storageDeletionJob\.count/);
  assert.match(dashboardModule, /recentFailures/);
  assert.match(dashboard, /Storage deletion queue/);
  assert.match(dashboard, /Drain now/);
  assert.match(dashboard, /Retry failed/);
  assert.match(dashboard, /Recent errors/);
});
