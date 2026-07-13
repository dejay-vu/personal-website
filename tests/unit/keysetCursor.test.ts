import assert from 'node:assert/strict';
import test from 'node:test';

import {
  encodeKeysetCursor,
  parseKeysetCursor,
} from '../../src/lib/keysetCursor';

test('round-trips an opaque, versioned keyset cursor', () => {
  const cursor = {
    id: '8f54d3f0-9708-4fa7-bad4-8ad5a0d13095',
    timestamp: '2026-07-12T10:20:30.000Z',
  };
  const encoded = encodeKeysetCursor('photos', cursor);

  assert.deepEqual(parseKeysetCursor(encoded, 'photos'), {
    ok: true,
    cursor,
  });
  assert.equal(encoded.includes(cursor.id), false);
});

test('rejects malformed, cross-feed, and non-canonical cursors', () => {
  const encoded = encodeKeysetCursor('notes', {
    id: 'note_1',
    timestamp: '2026-07-12T10:20:30.000Z',
  });

  assert.deepEqual(parseKeysetCursor(encoded, 'photos'), {
    ok: false,
    cursor: null,
  });
  assert.deepEqual(parseKeysetCursor('not+base64', 'notes'), {
    ok: false,
    cursor: null,
  });
  assert.deepEqual(parseKeysetCursor('x'.repeat(257), 'notes'), {
    ok: false,
    cursor: null,
  });

  const outOfDatabaseRange = Buffer.from(
    JSON.stringify({
      i: 'photo_1',
      k: 'photos',
      t: '+275760-09-13T00:00:00.000Z',
      v: 1,
    }),
  ).toString('base64url');
  assert.deepEqual(parseKeysetCursor(outOfDatabaseRange, 'photos'), {
    ok: false,
    cursor: null,
  });
});

test('represents a missing cursor as the first page', () => {
  assert.deepEqual(parseKeysetCursor(null, 'notes'), {
    ok: true,
    cursor: null,
  });
});
