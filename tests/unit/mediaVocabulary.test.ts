import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const activeMediaFiles = [
  'scripts/prewarm-media-variants.ts',
  'src/components/notes/NoteCoverImage.tsx',
  'src/lib/media.ts',
  'src/modules/notes/admin.ts',
  'src/modules/photos/admin.ts',
];

test('uses noteCover vocabulary for note media variants', async () => {
  const sources = await Promise.all(
    activeMediaFiles.map((file) => readFile(file, 'utf8')),
  );
  const activeMediaSource = sources.join('\n');
  const legacyVariantName = ['post', 'Cover'].join('');

  assert.equal(activeMediaSource.includes(legacyVariantName), false);
  assert.match(activeMediaSource, /noteCover:\s*1200/);
  assert.match(sources[0], /kind: 'photo' \| 'noteCover'/);
  assert.match(sources[0], /select 'noteCover' as kind/);
});

test('prewarms note cover media from the notes table', async () => {
  const prewarmSource = await readFile(activeMediaFiles[0], 'utf8');

  assert.match(prewarmSource, /\bfrom notes\b/);
  assert.doesNotMatch(prewarmSource, /\bfrom posts\b/);
});
