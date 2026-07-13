import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

export type CommittedMigration = {
  checksum: string;
  name: string;
};

export type MigrationLedgerRow = {
  applied_steps_count: number;
  checksum: string;
  finished_at: Date | null;
  migration_name: string;
  rolled_back_at: Date | null;
};

const MIGRATION_NAME = /^\d{14}_[a-z0-9_]+$/;

export async function loadCommittedMigrations(
  root = 'prisma/migrations',
): Promise<CommittedMigration[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (names.length === 0) throw new Error('No committed migrations found.');

  const migrations = [];
  for (const name of names) {
    if (!MIGRATION_NAME.test(name)) {
      throw new Error(`Invalid committed migration name: ${name}`);
    }
    const bytes = await readFile(`${root}/${name}/migration.sql`);
    migrations.push({
      checksum: createHash('sha256').update(bytes).digest('hex'),
      name,
    });
  }
  return migrations;
}

export function assertMigrationLedgerIsDeployable(
  committed: CommittedMigration[],
  ledger: MigrationLedgerRow[],
) {
  if (committed.length === 0) throw new Error('No committed migrations found.');
  if (ledger.length === 0) {
    throw new Error(
      'Production migration ledger is empty; register the baseline before deploy.',
    );
  }
  if (ledger.length > committed.length) {
    throw new Error(
      'Production migration ledger is ahead of committed history.',
    );
  }

  for (const [index, row] of ledger.entries()) {
    if (
      !row.finished_at ||
      row.rolled_back_at ||
      !Number.isInteger(row.applied_steps_count) ||
      row.applied_steps_count < 0
    ) {
      throw new Error(
        `Production migration ledger has an unresolved row: ${row.migration_name}`,
      );
    }

    const expected = committed[index];
    if (row.migration_name !== expected.name) {
      throw new Error(
        `Production migration order diverged at ${row.migration_name}; expected ${expected.name}.`,
      );
    }
    if (row.checksum !== expected.checksum) {
      throw new Error(
        `Production migration checksum mismatch: ${row.migration_name}.`,
      );
    }
  }

  return {
    applied: ledger.length,
    pending: committed.length - ledger.length,
  };
}
