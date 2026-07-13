import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('proxy delegates visibility and excludes router prefetch requests', () => {
  const source = readFileSync('src/proxy.ts', 'utf8');

  assert.match(source, /publishedNoteExists\(noteSlug\)/);
  assert.match(source, /publicPhotoExists\(photoSlug\)/);
  assert.doesNotMatch(source, /prisma\./);
  assert.match(source, /source: '\/darkroom\/:photoSlug'/);
  assert.match(source, /source: '\/field-notes\/:noteSlug'/);
  assert.equal(source.match(/key: 'next-router-prefetch'/g)?.length, 2);
  assert.equal(source.match(/key: 'purpose', value: 'prefetch'/g)?.length, 2);
});
