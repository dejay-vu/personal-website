import { config } from 'dotenv';

import {
  assertNoDatabaseTargetEnvironmentOverrides,
  databaseTargetFingerprint,
  isDevelopmentDatabaseName,
  parseDatabaseTarget,
} from './database-target';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

const raw = process.env.POSTGRES_URL_NON_POOLING;
if (!raw) throw new Error('POSTGRES_URL_NON_POOLING is required.');
assertNoDatabaseTargetEnvironmentOverrides();
if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to run migrate dev with NODE_ENV=production.');
}

const target = parseDatabaseTarget(raw);
if (target.schema !== 'public') {
  throw new Error(
    `Development migrations require the public schema, received: ${target.schema}`,
  );
}
if (!isDevelopmentDatabaseName(target.databaseName)) {
  throw new Error(
    `Refusing to run migrate dev against database: ${target.databaseName}`,
  );
}

const expectedFingerprint = process.env.DEVELOPMENT_DATABASE_FINGERPRINT;
if (!expectedFingerprint || !/^[a-f0-9]{64}$/.test(expectedFingerprint)) {
  throw new Error(
    'DEVELOPMENT_DATABASE_FINGERPRINT must be the exact SHA-256 target fingerprint.',
  );
}
const actualFingerprint = databaseTargetFingerprint(target);
if (actualFingerprint !== expectedFingerprint) {
  throw new Error('Development database target fingerprint mismatch.');
}

const productionFingerprint = process.env.PRODUCTION_DATABASE_FINGERPRINT;
if (productionFingerprint && actualFingerprint === productionFingerprint) {
  throw new Error('Development database matches the production fingerprint.');
}

console.log('Development database target verified.');
