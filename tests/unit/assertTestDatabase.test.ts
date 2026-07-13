import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const runGuard = ({
  cliUrl,
  runtimeUrl,
}: {
  cliUrl?: string;
  runtimeUrl?: string;
}) =>
  spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/assert-test-database.ts'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        NODE_ENV: 'test',
        PATH: process.env.PATH,
        ...(cliUrl ? { POSTGRES_URL_NON_POOLING: cliUrl } : {}),
        ...(runtimeUrl ? { DATABASE_URL: runtimeUrl } : {}),
      },
    },
  );

test('rejects a missing runtime database URL', () => {
  const result = runGuard({
    cliUrl: 'postgres://ci:ci@localhost:5432/ci',
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /DATABASE_URL is required/);
});

test('rejects a non-test runtime database', () => {
  const result = runGuard({
    cliUrl: 'postgres://ci:ci@localhost:5432/ci',
    runtimeUrl: 'postgres://app:secret@production.example:5432/verceldb',
  });

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /Refusing to reset non-test database: verceldb/,
  );
});

test('rejects different CLI and runtime connection targets', () => {
  const result = runGuard({
    cliUrl: 'postgres://ci:ci@localhost:5432/ci',
    runtimeUrl: 'postgres://ci:ci@other-host:5432/ci',
  });

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /must use the same database target/,
  );
});

test('rejects a runtime host query override', () => {
  const result = runGuard({
    cliUrl: 'postgres://ci:ci@localhost:5432/ci',
    runtimeUrl:
      'postgres://ci:runtime@localhost:5432/ci?host=production.example',
  });

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /must use the same database target/,
  );
});

test('rejects a runtime port query override', () => {
  const result = runGuard({
    cliUrl: 'postgres://ci:ci@localhost:5432/ci',
    runtimeUrl: 'postgres://ci:runtime@localhost:5432/ci?port=6543',
  });

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /must use the same database target/,
  );
});

test('rejects a runtime user query override', () => {
  const result = runGuard({
    cliUrl: 'postgres://ci:ci@localhost:5432/ci',
    runtimeUrl: 'postgres://ci:runtime@localhost:5432/ci?user=other',
  });

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /must use the same database target/,
  );
});

test('rejects unsupported database URL protocols', () => {
  const result = runGuard({
    cliUrl: 'mysql://ci:ci@localhost:5432/ci',
    runtimeUrl: 'mysql://ci:runtime@localhost:5432/ci',
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /PostgreSQL URL/);
});

test('rejects database URLs whose port depends on the environment', () => {
  const result = runGuard({
    cliUrl: 'postgres://ci:ci@localhost/ci',
    runtimeUrl: 'postgres://ci:runtime@localhost/ci',
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /explicit port/);
});

test('allows matching disposable URLs with harmless query differences', () => {
  const result = runGuard({
    cliUrl: 'postgres://ci:ci@localhost:5432/ci?sslmode=disable',
    runtimeUrl:
      'postgres://ci:runtime-password@localhost:5432/ci?schema=public',
  });

  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test('rejects mismatched or non-public schemas', () => {
  const result = runGuard({
    cliUrl: 'postgres://ci:ci@localhost:5432/ci?schema=public',
    runtimeUrl: 'postgres://ci:runtime@localhost:5432/ci?schema=private',
  });

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /non-public database schema/,
  );
});

test('rejects search-path options outside the target fingerprint', () => {
  const result = runGuard({
    cliUrl:
      'postgres://ci:ci@localhost:5432/ci?options=-c%20search_path%3Dpublic',
    runtimeUrl:
      'postgres://ci:runtime@localhost:5432/ci?options=-c%20search_path%3Dprivate',
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /options is not supported/);
});

test('requires exact approval before resetting a remote disposable database', () => {
  const url = 'postgres://ci:ci@test.example:5432/website_test';
  const result = runGuard({ cliUrl: url, runtimeUrl: url });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /RESET_APPROVAL/);
});
