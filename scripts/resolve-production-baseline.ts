import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

import { assertProductionDatabase } from './assert-production-database';
import { assertRecentRestoreEvidence } from './restore-evidence';

const BASELINE_NAME = '00000000000000_baseline';
const MIGRATION_PATH = `prisma/migrations/${BASELINE_NAME}/migration.sql`;

function runPrisma(args: string[]) {
  const executable = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
  const result = spawnSync(
    executable,
    ['npm', 'exec', '--', 'prisma', ...args],
    {
      env: process.env,
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) {
    throw new Error(`Prisma command failed: prisma ${args.join(' ')}`);
  }
}

async function main() {
  const { fingerprint } = assertProductionDatabase();

  const directUrl = process.env.POSTGRES_URL_NON_POOLING;
  if (!directUrl) throw new Error('POSTGRES_URL_NON_POOLING is required.');

  const migrationSql = await readFile(MIGRATION_PATH);
  const migrationChecksum = createHash('sha256')
    .update(migrationSql)
    .digest('hex');
  const expectedApproval = `${BASELINE_NAME}:${migrationChecksum}`;
  if (process.env.PRODUCTION_BASELINE_APPROVAL !== expectedApproval) {
    throw new Error(
      `Set PRODUCTION_BASELINE_APPROVAL to the exact approved migration name and checksum (${BASELINE_NAME}:<sha256>).`,
    );
  }
  const restoreEvidence = assertRecentRestoreEvidence({
    createdAt: process.env.PRODUCTION_RESTORE_EVIDENCE_CREATED_AT ?? '',
    id: process.env.PRODUCTION_RESTORE_EVIDENCE_ID ?? '',
  });

  const client = new Client({ connectionString: directUrl });
  await client.connect();
  try {
    const before = await client.query<{ relation: string | null }>(
      `SELECT to_regclass('"public"."_prisma_migrations"')::text AS relation`,
    );
    if (before.rows[0]?.relation) {
      throw new Error(
        'Production already has _prisma_migrations; refusing one-time baseline resolve.',
      );
    }

    runPrisma([
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma/schema.prisma',
      '--exit-code',
    ]);
    runPrisma(['migrate', 'resolve', '--applied', BASELINE_NAME]);
    runPrisma(['migrate', 'status']);
    runPrisma([
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma/schema.prisma',
      '--exit-code',
    ]);

    const after = await client.query<{
      applied_steps_count: number;
      checksum: string;
      finished_at: Date | null;
      migration_name: string;
      rolled_back_at: Date | null;
    }>(
      `SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
       FROM "public"."_prisma_migrations"
       ORDER BY started_at`,
    );
    const row = after.rows[0];
    if (
      after.rowCount !== 1 ||
      row?.migration_name !== BASELINE_NAME ||
      row.checksum !== migrationChecksum ||
      !row.finished_at ||
      row.rolled_back_at ||
      row.applied_steps_count !== 0
    ) {
      throw new Error('Production baseline ledger verification failed.');
    }
  } finally {
    await client.end();
  }

  console.log(
    `Production baseline registered: ${BASELINE_NAME}; target ${fingerprint}; restore evidence ${restoreEvidence.id} at ${restoreEvidence.createdAt}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
