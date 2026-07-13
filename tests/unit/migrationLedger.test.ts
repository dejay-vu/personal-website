import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type MigrationLedgerRow,
  assertMigrationLedgerIsDeployable,
} from '../../scripts/migration-ledger';

const committed = [
  { checksum: 'a'.repeat(64), name: '00000000000000_baseline' },
  { checksum: 'b'.repeat(64), name: '20260712170000_add_example' },
];

function row(overrides: Partial<MigrationLedgerRow> = {}): MigrationLedgerRow {
  return {
    applied_steps_count: 0,
    checksum: committed[0].checksum,
    finished_at: new Date('2026-07-12T16:00:00.000Z'),
    migration_name: committed[0].name,
    rolled_back_at: null,
    ...overrides,
  };
}

test('accepts an exact applied prefix and reports pending migrations', () => {
  assert.deepEqual(assertMigrationLedgerIsDeployable(committed, [row()]), {
    applied: 1,
    pending: 1,
  });
});

test('rejects missing, failed, reordered, and modified ledger history', () => {
  assert.throws(
    () => assertMigrationLedgerIsDeployable(committed, []),
    /empty/,
  );
  assert.throws(
    () =>
      assertMigrationLedgerIsDeployable(committed, [
        row({ finished_at: null }),
      ]),
    /unresolved/,
  );
  assert.throws(
    () =>
      assertMigrationLedgerIsDeployable(committed, [
        row({ migration_name: committed[1].name }),
      ]),
    /diverged/,
  );
  assert.throws(
    () =>
      assertMigrationLedgerIsDeployable(committed, [
        row({ checksum: 'c'.repeat(64) }),
      ]),
    /checksum mismatch/,
  );
});
