import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertNoDatabaseTargetEnvironmentOverrides,
  databaseTargetFingerprint,
  databaseTargetsEqual,
  isDisposableDatabaseName,
  parseDatabaseTarget,
} from './database-target';

const LOCAL_DATABASE_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export function assertTestDatabase() {
  assertNoDatabaseTargetEnvironmentOverrides();
  const cliUrl = process.env.POSTGRES_URL_NON_POOLING;
  const runtimeUrl = process.env.DATABASE_URL;

  if (!cliUrl) throw new Error('POSTGRES_URL_NON_POOLING is required.');
  if (!runtimeUrl) throw new Error('DATABASE_URL is required.');

  const cliTarget = parseDatabaseTarget(cliUrl);
  const runtimeTarget = parseDatabaseTarget(runtimeUrl);

  for (const target of [cliTarget, runtimeTarget]) {
    if (!isDisposableDatabaseName(target.databaseName)) {
      throw new Error(
        `Refusing to reset non-test database: ${target.databaseName}`,
      );
    }
    if (target.schema !== 'public') {
      throw new Error(
        `Refusing to reset non-public database schema: ${target.schema}`,
      );
    }
  }

  if (!databaseTargetsEqual(cliTarget, runtimeTarget)) {
    throw new Error(
      'POSTGRES_URL_NON_POOLING and DATABASE_URL must use the same database target.',
    );
  }

  const fingerprint = databaseTargetFingerprint(cliTarget);
  if (process.env.PRODUCTION_DATABASE_FINGERPRINT === fingerprint) {
    throw new Error('Refusing to reset the production database target.');
  }

  if (
    !LOCAL_DATABASE_HOSTS.has(cliTarget.hostname) &&
    process.env.TEST_DATABASE_RESET_APPROVAL !== fingerprint
  ) {
    throw new Error(
      'Remote test database resets require TEST_DATABASE_RESET_APPROVAL to match the exact target fingerprint.',
    );
  }

  return { fingerprint, target: cliTarget };
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  assertTestDatabase();
  console.log('Disposable test database target verified.');
}
