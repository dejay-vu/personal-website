import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertNoDatabaseTargetEnvironmentOverrides,
  databaseTargetFingerprint,
  isDevelopmentDatabaseName,
  isDisposableDatabaseName,
  parseDatabaseTarget,
} from './database-target';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

export function assertProductionDatabase() {
  assertNoDatabaseTargetEnvironmentOverrides();

  const raw = process.env.POSTGRES_URL_NON_POOLING;
  const expectedFingerprint = process.env.PRODUCTION_DATABASE_FINGERPRINT;

  if (!raw) throw new Error('POSTGRES_URL_NON_POOLING is required.');
  if (!expectedFingerprint) {
    throw new Error('PRODUCTION_DATABASE_FINGERPRINT is required.');
  }
  if (!/^[a-f0-9]{64}$/.test(expectedFingerprint)) {
    throw new Error(
      'PRODUCTION_DATABASE_FINGERPRINT must be a SHA-256 hex value.',
    );
  }

  const target = parseDatabaseTarget(raw, { allowDefaultPort: true });
  if (target.schema !== 'public') {
    throw new Error('Production migrations require the public schema.');
  }
  if (process.env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK) {
    throw new Error('Prisma advisory locking must remain enabled.');
  }
  if (
    isDisposableDatabaseName(target.databaseName) ||
    isDevelopmentDatabaseName(target.databaseName)
  ) {
    throw new Error(
      'Refusing to treat a test/development database as production.',
    );
  }

  const actualFingerprint = databaseTargetFingerprint(target);
  if (actualFingerprint !== expectedFingerprint) {
    throw new Error('Production database target fingerprint mismatch.');
  }

  return { fingerprint: actualFingerprint, target };
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  assertProductionDatabase();
  console.log('Production database target fingerprint verified.');
}
