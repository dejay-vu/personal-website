import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type KeysetCursor,
  parseKeysetCursor,
} from '../../src/lib/keysetCursor';
import prisma from '../../src/lib/prisma';
import { getPublishedNotesPage } from '../../src/modules/notes/read';
import { getPhotosPage } from '../../src/modules/photos/read';
import { resetDatabase } from './helpers';

test.beforeEach(resetDatabase);
test.after(() => prisma.$disconnect());

const NEWER_TIMESTAMP = new Date('2026-07-12T12:00:00.000Z');
const OLDER_TIMESTAMP = new Date('2026-07-11T12:00:00.000Z');

function decodeCursor(
  value: string | null,
  kind: 'notes' | 'photos',
): KeysetCursor {
  assert.notEqual(value, null);
  const parsed = parseKeysetCursor(value, kind);

  assert.equal(parsed.ok, true);
  assert.notEqual(parsed.cursor, null);

  if (!parsed.ok || !parsed.cursor) {
    throw new Error('Expected a valid keyset cursor.');
  }

  return parsed.cursor;
}

async function seedCursorNotes() {
  const entries = [
    { id: 'note_cursor_c', publishedAt: NEWER_TIMESTAMP },
    { id: 'note_cursor_b', publishedAt: NEWER_TIMESTAMP },
    { id: 'note_cursor_a', publishedAt: NEWER_TIMESTAMP },
    { id: 'note_cursor_z', publishedAt: OLDER_TIMESTAMP },
  ];

  for (const entry of entries) {
    const mediaAssetId = `asset_${entry.id}`;

    await prisma.note.create({
      data: {
        abstract: `Abstract for ${entry.id}`,
        content: `# ${entry.id}`,
        coverMedia: {
          create: {
            blurDataURL: 'data:image/jpeg;base64,',
            id: mediaAssetId,
            mimeType: 'image/jpeg',
            originalKey: `media/notes/${entry.id}/covers/${mediaAssetId}/original.jpg`,
          },
        },
        id: entry.id,
        published: true,
        publishedAt: entry.publishedAt,
        readingTime: 1,
        slug: entry.id,
        title: entry.id,
        wordCount: 1,
      },
    });
  }
}

async function seedCursorPhotos() {
  const entries = [
    { createdAt: NEWER_TIMESTAMP, id: 'photo_cursor_c' },
    { createdAt: NEWER_TIMESTAMP, id: 'photo_cursor_b' },
    { createdAt: NEWER_TIMESTAMP, id: 'photo_cursor_a' },
    { createdAt: OLDER_TIMESTAMP, id: 'photo_cursor_z' },
  ];

  for (const entry of entries) {
    const mediaAssetId = `asset_${entry.id}`;

    await prisma.photo.create({
      data: {
        createdAt: entry.createdAt,
        id: entry.id,
        mediaAsset: {
          create: {
            blurDataURL: 'data:image/jpeg;base64,',
            id: mediaAssetId,
            mimeType: 'image/jpeg',
            originalKey: `media/photos/${entry.id}/assets/${mediaAssetId}/original.jpg`,
          },
        },
        slug: entry.id,
        title: entry.id,
      },
    });
  }
}

test('notes continue after a deleted first-page boundary without duplicates or omissions', async () => {
  await seedCursorNotes();
  const first = await getPublishedNotesPage({ limit: 2 });

  assert.deepEqual(
    first.notes.map(({ id }) => id),
    ['note_cursor_c', 'note_cursor_b'],
  );

  const deletedBoundaryId = first.notes.at(-1)?.id;
  assert.equal(deletedBoundaryId, 'note_cursor_b');
  const cursor = decodeCursor(first.nextCursor, 'notes');

  await prisma.note.delete({ where: { id: deletedBoundaryId } });

  const second = await getPublishedNotesPage({ cursor, limit: 2 });
  const secondIds = second.notes.map(({ id }) => id);

  assert.deepEqual(secondIds, ['note_cursor_a', 'note_cursor_z']);
  assert.equal(second.nextCursor, null);
  assert.equal(
    secondIds.some((id) => first.notes.some((note) => note.id === id)),
    false,
  );

  const remainingIds = (
    await prisma.note.findMany({
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    })
  ).map(({ id }) => id);

  assert.deepEqual([first.notes[0]!.id, ...secondIds], remainingIds);
});

test('photos continue after a deleted first-page boundary without duplicates or omissions', async () => {
  await seedCursorPhotos();
  const first = await getPhotosPage({ limit: 2 });

  assert.deepEqual(
    first.photos.map(({ id }) => id),
    ['photo_cursor_c', 'photo_cursor_b'],
  );

  const deletedBoundaryId = first.photos.at(-1)?.id;
  assert.equal(deletedBoundaryId, 'photo_cursor_b');
  const cursor = decodeCursor(first.nextCursor, 'photos');

  await prisma.photo.delete({ where: { id: deletedBoundaryId } });

  const second = await getPhotosPage({ cursor, limit: 2 });
  const secondIds = second.photos.map(({ id }) => id);

  assert.deepEqual(secondIds, ['photo_cursor_a', 'photo_cursor_z']);
  assert.equal(second.nextCursor, null);
  assert.equal(
    secondIds.some((id) => first.photos.some((photo) => photo.id === id)),
    false,
  );

  const remainingIds = (
    await prisma.photo.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    })
  ).map(({ id }) => id);

  assert.deepEqual([first.photos[0]!.id, ...secondIds], remainingIds);
});
