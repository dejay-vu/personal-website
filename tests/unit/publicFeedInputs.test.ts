import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { encodeKeysetCursor } from '../../src/lib/keysetCursor';
import {
  isCacheableNotesPageInput,
  normalizeNotesPageInput,
} from '../../src/modules/notes/pageInput';
import { parseNotesPageSearchParams } from '../../src/modules/notes/publicApi';
import {
  isCacheablePhotosPageInput,
  normalizePhotosPageInput,
} from '../../src/modules/photos/pageInput';
import { parsePhotosPageSearchParams } from '../../src/modules/photos/publicApi';

test('canonicalizes equivalent photo queries before cache lookup', () => {
  const cursor = encodeKeysetCursor('photos', {
    id: 'photo_1',
    timestamp: '2026-07-12T10:20:30.000Z',
  });
  const first = parsePhotosPageSearchParams(
    new URLSearchParams([
      ['country', ' United Kingdom '],
      ['country', 'japan'],
      ['country', 'japan'],
      ['q', ' night '],
      ['limit', '36'],
      ['cursor', cursor],
    ]),
  );
  const second = parsePhotosPageSearchParams(
    new URLSearchParams([
      ['cursor', cursor],
      ['limit', '36'],
      ['q', 'night'],
      ['country', 'japan'],
      ['country', 'united-kingdom'],
    ]),
  );

  assert.equal(first.ok, true);
  assert.deepEqual(first, second);
});

test('merges photo filter fields that normalize to the same key', () => {
  const parsed = parsePhotosPageSearchParams(
    new URLSearchParams([
      ['Country', 'Japan'],
      ['country', 'United Kingdom'],
      [' country ', 'japan'],
    ]),
  );

  assert.deepEqual(parsed, {
    ok: true,
    input: {
      cursor: null,
      filters: {
        country: ['japan', 'united-kingdom'],
      },
      limit: 36,
      q: null,
    },
  });
});

test('canonicalizes note categories before cache lookup', () => {
  const parsed = parseNotesPageSearchParams(
    new URLSearchParams([
      ['category', 'Machine Learning'],
      ['category', 'architecture'],
      ['category', 'Machine Learning'],
      ['limit', '6'],
    ]),
  );

  assert.deepEqual(parsed, {
    ok: true,
    input: {
      categories: ['architecture', 'machine-learning'],
      cursor: null,
      limit: 6,
    },
  });
});

test('rejects inputs that would create unbounded cache cardinality', () => {
  assert.deepEqual(
    parsePhotosPageSearchParams(new URLSearchParams({ limit: '999999' })),
    { ok: false, error: 'Invalid limit.' },
  );
  assert.deepEqual(
    parsePhotosPageSearchParams(new URLSearchParams({ q: 'x'.repeat(161) })),
    { ok: false, error: 'Invalid search query.' },
  );
  assert.deepEqual(
    parseNotesPageSearchParams(
      new URLSearchParams({ cursor: 'random-valid-looking-value' }),
    ),
    { ok: false, error: 'Invalid cursor.' },
  );

  const tooManyFilters = new URLSearchParams();
  for (let index = 0; index < 13; index += 1) {
    tooManyFilters.set(`field_${index}`, 'value');
  }
  assert.deepEqual(parsePhotosPageSearchParams(tooManyFilters), {
    ok: false,
    error: 'Invalid photo filters.',
  });

  const tooManyCategories = new URLSearchParams();
  for (let index = 0; index < 13; index += 1) {
    tooManyCategories.append('category', `category-${index}`);
  }
  assert.deepEqual(parseNotesPageSearchParams(tooManyCategories), {
    ok: false,
    error: 'Invalid categories.',
  });

  assert.deepEqual(
    parsePhotosPageSearchParams(
      new URLSearchParams({ 'invalid field': 'value' }),
    ),
    { ok: false, error: 'Invalid photo filters.' },
  );
  assert.deepEqual(
    parsePhotosPageSearchParams(
      new URLSearchParams({ country: 'x'.repeat(121) }),
    ),
    { ok: false, error: 'Invalid photo filters.' },
  );

  const tooManyFilterValues = new URLSearchParams();
  for (let index = 0; index < 61; index += 1) {
    tooManyFilterValues.append('country', `value-${index}`);
  }
  assert.deepEqual(parsePhotosPageSearchParams(tooManyFilterValues), {
    ok: false,
    error: 'Invalid photo filters.',
  });

  assert.deepEqual(
    parseNotesPageSearchParams(new URLSearchParams({ category: ' ' })),
    { ok: false, error: 'Invalid categories.' },
  );
});

test('only finite unfiltered first-page variants use the persistent cache', () => {
  assert.equal(isCacheableNotesPageInput(normalizeNotesPageInput()), true);
  assert.equal(
    isCacheableNotesPageInput(
      normalizeNotesPageInput({ categories: ['architecture'] }),
    ),
    false,
  );
  assert.equal(
    isCacheableNotesPageInput(
      normalizeNotesPageInput({
        cursor: {
          id: 'note_1',
          timestamp: '2026-07-12T10:20:30.000Z',
        },
      }),
    ),
    false,
  );

  assert.equal(isCacheablePhotosPageInput(normalizePhotosPageInput()), true);
  assert.equal(
    isCacheablePhotosPageInput(normalizePhotosPageInput({ q: 'night' })),
    false,
  );
  assert.equal(
    isCacheablePhotosPageInput(
      normalizePhotosPageInput({ filters: { country: ['japan'] } }),
    ),
    false,
  );
});

test('public feed routes parse canonical input before invoking cached readers', () => {
  for (const contract of [
    {
      parser: 'parseNotesPageSearchParams',
      reader: 'getPublishedNotesPage',
      route: 'src/app/api/notes/route.ts',
    },
    {
      parser: 'parsePhotosPageSearchParams',
      reader: 'getPhotosPage',
      route: 'src/app/api/photos/route.ts',
    },
  ]) {
    const source = readFileSync(contract.route, 'utf8');
    const parseIndex = source.indexOf(`const parsed = ${contract.parser}`);
    const readIndex = source.indexOf(`await ${contract.reader}(parsed.input)`);

    assert.notEqual(parseIndex, -1);
    assert.notEqual(readIndex, -1);
    assert.ok(parseIndex < readIndex);
  }
});
