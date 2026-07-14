import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { escapeSitemapImageUrl } from '../../src/lib/sitemap';

test('image URLs escape XML query separators exactly once', () => {
  const raw =
    'https://resizer.dejayvu.com/media/photo.jpg?format=webp&quality=75&width=2048';
  const escaped =
    'https://resizer.dejayvu.com/media/photo.jpg?format=webp&amp;quality=75&amp;width=2048';

  assert.equal(escapeSitemapImageUrl(raw), escaped);
  assert.equal(escapeSitemapImageUrl(escaped), escaped);
  assert.equal(
    escapeSitemapImageUrl('https://example.com/image?caption=a&fake;'),
    'https://example.com/image?caption=a&amp;fake;',
  );
});

test('content cache invalidation includes the image sitemap', () => {
  for (const file of [
    'src/modules/notes/admin.ts',
    'src/modules/photos/admin.ts',
  ]) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /revalidatePath\('\/sitemap\.xml'\)/, file);
  }
});

test('image sitemap cache shapes are explicitly versioned', () => {
  const notes = readFileSync('src/modules/notes/read.ts', 'utf8');
  const photos = readFileSync('src/modules/photos/read.ts', 'utf8');

  assert.match(notes, /const NOTES_CACHE_VERSION = 'v5'/);
  assert.match(photos, /const PHOTOS_CACHE_VERSION = 'v4'/);
  assert.match(notes, /coverMedia:[\s\S]*?originalKey: true/);
  assert.match(photos, /mediaAsset:[\s\S]*?originalKey: true/);
});
