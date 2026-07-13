import assert from 'node:assert/strict';
import test from 'node:test';

import { AdminDomainError } from '../../src/modules/admin/errors';
import { ensureAdminSlug } from '../../src/modules/admin/slug';

test('normalizes an explicit admin slug', () => {
  assert.equal(
    ensureAdminSlug(' Field Notes Entry ', 'Slug'),
    'field-notes-entry',
  );
});

test('rejects an explicit admin slug without usable text', () => {
  assert.throws(
    () => ensureAdminSlug('---', 'Slug'),
    (error) =>
      error instanceof AdminDomainError &&
      error.message === 'Slug cannot be converted to a slug.' &&
      error.status === 400,
  );
});
