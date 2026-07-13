import { config } from 'dotenv';

import {
  databaseTargetFingerprint,
  parseDatabaseTarget,
} from './database-target';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

const raw = process.env.POSTGRES_URL_NON_POOLING;
if (!raw) throw new Error('POSTGRES_URL_NON_POOLING is required.');

console.log(
  databaseTargetFingerprint(
    parseDatabaseTarget(raw, { allowDefaultPort: true }),
  ),
);
