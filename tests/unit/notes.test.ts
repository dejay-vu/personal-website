import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  NOTES_CACHE_TAG,
  NOTES_PAGE_SIZE,
  type NotesPage,
} from '../../src/modules/notes/types';

test('exposes the published notes page through note vocabulary', () => {
  const page: NotesPage = {
    notes: [],
    nextCursor: null,
  };

  assert.equal(NOTES_PAGE_SIZE, 6);
  assert.deepEqual(page, { notes: [], nextCursor: null });
});

test('shares the notes cache tag across readers and invalidators', () => {
  const readSource = readFileSync('src/modules/notes/read.ts', 'utf8');
  const adminSource = readFileSync('src/modules/notes/admin.ts', 'utf8');
  const manualSource = readFileSync(
    'src/components/admin/RevalidateButton.tsx',
    'utf8',
  );

  assert.doesNotMatch(adminSource, /revalidateTag\('posts'/);
  assert.equal(NOTES_CACHE_TAG, 'notes');
  assert.equal(
    readSource.match(/tags:\s*\[\s*NOTES_CACHE_TAG\s*\]/g)?.length,
    5,
  );
  assert.ok((adminSource.match(/revalidateNotes\(\)/g)?.length ?? 0) >= 6);
  assert.match(manualSource, /tag:\s*typeof NOTES_CACHE_TAG\s*\|\s*'photos'/);
  assert.match(readSource, /const noteDetailSelect[\s\S]*?content:\s*true/);
  assert.doesNotMatch(
    readSource.match(
      /const noteListSelect[\s\S]*?satisfies Prisma\.NoteSelect/,
    )?.[0] ?? '',
    /content:\s*true/,
  );
  assert.equal(existsSync('src/services/postContent.ts'), false);
});

test('keeps client note type imports on the lightweight types seam', () => {
  const clientFiles = [
    'src/components/notes/NoteEndlessGrid.tsx',
    'src/components/notes/NoteCard.tsx',
    'src/components/notes/NoteCardGrid.tsx',
  ];
  const barrelImports = clientFiles.filter((file) =>
    /import type .* from ['"]@\/modules\/notes['"]/.test(
      readFileSync(file, 'utf8'),
    ),
  );

  assert.deepEqual(
    barrelImports,
    [],
    'Client components must import note types from @/modules/notes/types',
  );
});
