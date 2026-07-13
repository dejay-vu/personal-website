import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  AdminDomainError,
  AdminRetryableUploadError,
  getAdminUploadFailure,
  isAdminRetryableUploadError,
  isPrismaUniqueConstraintOn,
} from '../../src/modules/admin/errors';

test('retryable upload errors keep the intent staged with a visible error', () => {
  const error = new AdminRetryableUploadError(
    'Photo slug already exists: occupied',
  );

  assert.equal(error.status, 409);
  assert.equal(isAdminRetryableUploadError(error), true);
  assert.deepEqual(getAdminUploadFailure(error), {
    message: 'Photo slug already exists: occupied',
    retryable: true,
  });
});

test('ordinary upload errors remain terminal failures', () => {
  assert.deepEqual(
    getAdminUploadFailure(new AdminDomainError('Unsupported image.')),
    {
      message: 'Unsupported image.',
      retryable: false,
    },
  );
});

test('unique constraint classification only treats the slug target as retryable', () => {
  const slugConflict = {
    code: 'P2002',
    meta: { target: ['slug'] },
  };
  const storageConflict = {
    code: 'P2002',
    meta: { target: ['originalKey'] },
  };

  assert.equal(isPrismaUniqueConstraintOn(slugConflict, 'slug'), true);
  assert.equal(isPrismaUniqueConstraintOn(storageConflict, 'slug'), false);
});

test('note and photo create routes synchronously preflight before queuing work', () => {
  for (const route of [
    'src/app/api/admin/notes/editor/route.ts',
    'src/app/api/admin/photos/finalize/route.ts',
  ]) {
    const source = readFileSync(route, 'utf8');
    const preflightIndex = source.indexOf('await prepareAdmin');
    const afterIndex = source.indexOf('after(async');

    assert.notEqual(preflightIndex, -1, `${route} must preflight`);
    assert.ok(
      preflightIndex < afterIndex,
      `${route} must preflight before returning queued work`,
    );
  }
});

test('post-finalize failures are persisted instead of looking successful', () => {
  const uploads = readFileSync('src/modules/admin/uploads.ts', 'utf8');
  const monitor = readFileSync(
    'src/components/admin/AdminUploadMonitor.tsx',
    'utf8',
  );

  assert.match(uploads, /finalized\s*\? AdminUploadStatus\.FINALIZED/);
  assert.match(monitor, /status\.status === 'FINALIZED' && !status\.error/);
});
