import assert from 'node:assert/strict';
import test from 'node:test';

import { assertRecentRestoreEvidence } from '../../scripts/restore-evidence';

const now = Date.parse('2026-07-12T16:00:00.000Z');

test('accepts recent non-sensitive restore evidence', () => {
  assert.deepEqual(
    assertRecentRestoreEvidence({
      createdAt: '2026-07-12T15:30:00.000Z',
      id: 'br-release-restore-123',
      now,
    }),
    {
      createdAt: '2026-07-12T15:30:00.000Z',
      id: 'br-release-restore-123',
    },
  );
});

test('rejects URLs, stale evidence, and future evidence', () => {
  assert.throws(
    () =>
      assertRecentRestoreEvidence({
        createdAt: '2026-07-12T15:30:00.000Z',
        id: 'https://console.neon.tech/secret',
        now,
      }),
    /non-sensitive/,
  );
  assert.throws(
    () =>
      assertRecentRestoreEvidence({
        createdAt: '2026-07-11T15:00:00.000Z',
        id: 'br-release-restore-123',
        now,
      }),
    /less than 24 hours/,
  );
  assert.throws(
    () =>
      assertRecentRestoreEvidence({
        createdAt: '2026-07-12T16:06:00.000Z',
        id: 'br-release-restore-123',
        now,
      }),
    /future/,
  );
});
