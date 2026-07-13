import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

import { assertProductionDatabase } from './assert-production-database';
import {
  type MigrationLedgerRow,
  assertMigrationLedgerIsDeployable,
  loadCommittedMigrations,
} from './migration-ledger';

export async function assertProductionMigrationLedger() {
  assertProductionDatabase();
  const directUrl = process.env.POSTGRES_URL_NON_POOLING;
  if (!directUrl) throw new Error('POSTGRES_URL_NON_POOLING is required.');

  const committed = await loadCommittedMigrations();
  const client = new Client({ connectionString: directUrl });
  await client.connect();
  try {
    const relation = await client.query<{ relation: string | null }>(
      `SELECT to_regclass('"public"."_prisma_migrations"')::text AS relation`,
    );
    if (!relation.rows[0]?.relation) {
      throw new Error(
        'Production migration ledger is missing; register the baseline before deploy.',
      );
    }

    const result = await client.query<MigrationLedgerRow>(
      `SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
       FROM "public"."_prisma_migrations"
       ORDER BY started_at`,
    );
    return assertMigrationLedgerIsDeployable(committed, result.rows);
  } finally {
    await client.end();
  }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  assertProductionMigrationLedger()
    .then(({ applied, pending }) => {
      console.log(
        `Production migration ledger verified (${applied} applied, ${pending} pending).`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
