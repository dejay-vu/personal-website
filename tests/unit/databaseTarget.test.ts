import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  databaseTargetFingerprint,
  isDevelopmentDatabaseName,
  isDisposableDatabaseName,
  parseDatabaseTarget,
} from '../../scripts/database-target';

const productionUrl =
  'postgresql://owner:secret@production.example:5432/site?sslmode=verify-full';
const productionFingerprint = databaseTargetFingerprint(
  parseDatabaseTarget(productionUrl),
);

function runScript(
  path: string,
  environment: Record<string, string | undefined>,
) {
  return spawnSync(process.execPath, ['--import', 'tsx', path], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      NODE_ENV: 'test',
      PATH: process.env.PATH,
      ...environment,
    },
  });
}

test('normalizes database identity and authority query overrides', () => {
  assert.deepEqual(
    parseDatabaseTarget(
      'postgres://user:secret@ignored.example:5432/site?host=actual.example&port=6543',
    ),
    {
      databaseName: 'site',
      hostname: 'actual.example',
      port: '6543',
      protocol: 'postgresql:',
      schema: 'public',
      username: 'user',
    },
  );
  assert.equal(
    parseDatabaseTarget('postgres://user:secret@database.example/site', {
      allowDefaultPort: true,
    }).port,
    '5432',
  );
});

test('includes schema in identity and rejects connection-start overrides', () => {
  const publicTarget = parseDatabaseTarget(
    'postgres://user:secret@database.example:5432/site?schema=public',
  );
  const otherTarget = parseDatabaseTarget(
    'postgres://user:secret@database.example:5432/site?schema=other',
  );
  assert.notEqual(
    databaseTargetFingerprint(publicTarget),
    databaseTargetFingerprint(otherTarget),
  );
  assert.throws(
    () =>
      parseDatabaseTarget(
        'postgres://user:secret@database.example:5432/site?options=-c%20search_path%3Dother',
      ),
    /options is not supported/,
  );
});

test('classifies disposable and development database names', () => {
  assert.equal(isDisposableDatabaseName('website_test'), true);
  assert.equal(isDisposableDatabaseName('website'), false);
  assert.equal(isDevelopmentDatabaseName('website_dev'), true);
  assert.equal(isDevelopmentDatabaseName('website'), false);
});

test('production guard requires the exact target fingerprint', () => {
  const accepted = runScript('scripts/assert-production-database.ts', {
    POSTGRES_URL_NON_POOLING: productionUrl,
    PRODUCTION_DATABASE_FINGERPRINT: productionFingerprint,
  });
  assert.equal(accepted.status, 0, `${accepted.stdout}${accepted.stderr}`);

  const rejected = runScript('scripts/assert-production-database.ts', {
    POSTGRES_URL_NON_POOLING: productionUrl,
    PRODUCTION_DATABASE_FINGERPRINT: '0'.repeat(64),
  });
  assert.notEqual(rejected.status, 0);
  assert.match(`${rejected.stdout}${rejected.stderr}`, /fingerprint mismatch/);
});

test('database log masking emits only GitHub mask commands for target identity', () => {
  const result = runScript('scripts/mask-database-logs.ts', {
    POSTGRES_URL_NON_POOLING: productionUrl,
  });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /::add-mask::production\.example/);
  assert.match(output, /::add-mask::site/);
  assert.match(output, /::add-mask::owner/);
  assert.doesNotMatch(output, /secret|postgresql:\/\//);
});

test('production guard rejects disposable targets', () => {
  const url = 'postgres://ci:ci@localhost:5432/ci';
  const result = runScript('scripts/assert-production-database.ts', {
    POSTGRES_URL_NON_POOLING: url,
    PRODUCTION_DATABASE_FINGERPRINT: databaseTargetFingerprint(
      parseDatabaseTarget(url),
    ),
  });
  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /test\/development database/,
  );
});

test('production guard rejects non-public schemas and advisory-lock overrides', () => {
  const schemaUrl = `${productionUrl}&schema=other`;
  const wrongSchema = runScript('scripts/assert-production-database.ts', {
    POSTGRES_URL_NON_POOLING: schemaUrl,
    PRODUCTION_DATABASE_FINGERPRINT: databaseTargetFingerprint(
      parseDatabaseTarget(schemaUrl),
    ),
  });
  assert.notEqual(wrongSchema.status, 0);
  const wrongSchemaOutput = `${wrongSchema.stdout}${wrongSchema.stderr}`;
  assert.match(wrongSchemaOutput, /public schema/);
  assert.doesNotMatch(wrongSchemaOutput, /other/);

  const lockDisabled = runScript('scripts/assert-production-database.ts', {
    POSTGRES_URL_NON_POOLING: productionUrl,
    PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1',
    PRODUCTION_DATABASE_FINGERPRINT: productionFingerprint,
  });
  assert.notEqual(lockDisabled.status, 0);
  assert.match(
    `${lockDisabled.stdout}${lockDisabled.stderr}`,
    /advisory locking/,
  );

  const targetOverride = runScript('scripts/assert-production-database.ts', {
    PGOPTIONS: '-c search_path=other',
    POSTGRES_URL_NON_POOLING: productionUrl,
    PRODUCTION_DATABASE_FINGERPRINT: productionFingerprint,
  });
  assert.notEqual(targetOverride.status, 0);
  assert.match(
    `${targetOverride.stdout}${targetOverride.stderr}`,
    /PGOPTIONS is not supported/,
  );
});

test('development migration guard refuses an ordinary database name', () => {
  const result = runScript('scripts/assert-development-database.ts', {
    POSTGRES_URL_NON_POOLING: productionUrl,
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /migrate dev/);
});

test('development migration guard requires an exact explicit fingerprint', () => {
  const url = 'postgres://owner:secret@localhost:5432/website_dev';
  const targetFingerprint = databaseTargetFingerprint(parseDatabaseTarget(url));
  const missing = runScript('scripts/assert-development-database.ts', {
    POSTGRES_URL_NON_POOLING: url,
  });
  assert.notEqual(missing.status, 0);
  assert.match(`${missing.stdout}${missing.stderr}`, /exact SHA-256/);

  const accepted = runScript('scripts/assert-development-database.ts', {
    DEVELOPMENT_DATABASE_FINGERPRINT: targetFingerprint,
    POSTGRES_URL_NON_POOLING: url,
  });
  assert.equal(accepted.status, 0, `${accepted.stdout}${accepted.stderr}`);
});
