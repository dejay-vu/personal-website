import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { AdminUploadStatus } from '../../src/generated/prisma/client';
import prisma from '../../src/lib/prisma';
import { AdminDomainError } from '../../src/modules/admin/errors';
import { getUploadStatuses } from '../../src/modules/admin/uploads';
import { buildNoteCoverOriginalKey } from '../../src/modules/media/storageKeys';
import {
  commitAdminNoteCreation,
  createAdminNoteFromEditor,
  preflightAdminNoteCreation,
  purgeAdminNote,
  swapAdminNoteCover,
  updateAdminNoteFromEditor,
  updateAdminNoteStatus,
} from '../../src/modules/notes/admin';
import {
  getPublishedNoteBySlug,
  getPublishedNoteSitemapEntries,
} from '../../src/modules/notes/read';
import {
  configureStorageDeletionTestEnvironment,
  resetDatabase,
  seedNote,
  seedNoteCoverIntent,
} from './helpers';

test.beforeEach(async () => {
  configureStorageDeletionTestEnvironment();
  await resetDatabase();
});
test.after(() => prisma.$disconnect());

const noteInput = ({
  coverUploadId,
  slug,
}: {
  coverUploadId: string;
  slug: string;
}) => ({
  abstract: `Abstract for ${slug}`,
  categories: ['Architecture'],
  content: `# ${slug}`,
  coverUploadId,
  published: true,
  publishedAt: '2026-07-10',
  seoTitle: null,
  slug,
  title: slug,
});

const preparedCover = ({
  mediaAssetId = randomUUID(),
  noteId,
}: {
  mediaAssetId?: string;
  noteId: string;
}) => ({
  blurDataURL: 'data:image/jpeg;base64,',
  height: 630,
  mediaAssetId,
  mimeType: 'image/jpeg',
  originalKey: buildNoteCoverOriginalKey({
    extension: 'jpg',
    mediaAssetId,
    noteId,
  }),
  sha256: 'a'.repeat(64),
  sizeBytes: 100,
  width: 1200,
});

test('note sitemap reads the cover key and excludes hidden notes', async () => {
  const visible = await seedNote({
    content: '# Visible',
    slug: 'sitemap-visible-note',
  });
  const archived = await seedNote({
    content: '# Archived',
    slug: 'sitemap-archived-note',
  });
  const unpublished = await seedNote({
    content: '# Unpublished',
    slug: 'sitemap-unpublished-note',
  });
  await prisma.note.update({
    data: { archivedAt: new Date() },
    where: { id: archived.id },
  });
  await prisma.note.update({
    data: { published: false },
    where: { id: unpublished.id },
  });

  const persisted = await prisma.note.findUniqueOrThrow({
    include: { coverMedia: true },
    where: { id: visible.id },
  });
  const entries = await getPublishedNoteSitemapEntries();

  assert.deepEqual(
    entries.map(({ coverMedia, slug }) => ({
      originalKey: coverMedia.originalKey,
      slug,
    })),
    [
      {
        originalKey: persisted.coverMedia.originalKey,
        slug: visible.slug,
      },
    ],
  );
});

test('commits note, audit, and finalized intent atomically', async () => {
  const intent = await seedNoteCoverIntent();
  const noteId = randomUUID();
  const cover = preparedCover({ noteId });

  const note = await commitAdminNoteCreation({
    cover,
    githubId: intent.githubId,
    input: noteInput({
      coverUploadId: intent.uploadId,
      slug: 'atomic-create',
    }),
    noteId,
    uploadIntentId: intent.id,
  });

  const finalized = await prisma.adminUploadIntent.findUniqueOrThrow({
    where: { id: intent.id },
  });
  assert.equal(note.id, noteId);
  assert.equal(await prisma.note.count(), 1);
  assert.equal(await prisma.adminAuditLog.count(), 1);
  assert.equal(finalized.status, AdminUploadStatus.FINALIZED);
  assert.equal(finalized.finalKey, cover.originalKey);
  assert.equal(finalized.sha256, cover.sha256);
  assert.ok(finalized.finalizedAt);
  assert.equal(finalized.error, null);
});

test('same finalized upload retry returns the existing note', async () => {
  const intent = await seedNoteCoverIntent();
  const noteId = randomUUID();
  const input = noteInput({
    coverUploadId: intent.uploadId,
    slug: 'idempotent-create',
  });

  const created = await commitAdminNoteCreation({
    cover: preparedCover({ noteId }),
    githubId: intent.githubId,
    input,
    noteId,
    uploadIntentId: intent.id,
  });
  const retried = await createAdminNoteFromEditor({
    githubId: intent.githubId,
    input,
  });

  assert.equal(retried.id, created.id);
  assert.equal(await prisma.note.count(), 1);
  assert.equal(await prisma.adminAuditLog.count(), 1);
});

test('note preflight rejects an occupied normalized slug before upload', async () => {
  await seedNote({ slug: 'occupied-note', content: '# Occupied' });
  const input = noteInput({
    coverUploadId: randomUUID(),
    slug: 'Occupied Note',
  });

  await assert.rejects(
    () => preflightAdminNoteCreation({ input }),
    (error: unknown) =>
      error instanceof AdminDomainError &&
      error.status === 409 &&
      error.message === 'Note slug already exists: occupied-note',
  );
});

test('duplicate note slug keeps the staged cover retryable and visible', async () => {
  await seedNote({ slug: 'occupied-note', content: '# Occupied' });
  const intent = await seedNoteCoverIntent();

  await assert.rejects(
    () =>
      createAdminNoteFromEditor({
        githubId: intent.githubId,
        input: noteInput({
          coverUploadId: intent.uploadId,
          slug: 'occupied-note',
        }),
      }),
    (error: unknown) =>
      error instanceof AdminDomainError && error.status === 409,
  );

  const unchanged = await prisma.adminUploadIntent.findUniqueOrThrow({
    where: { id: intent.id },
  });
  const [status] = await getUploadStatuses({
    githubId: intent.githubId,
    uploadIds: [intent.uploadId],
  });

  assert.equal(unchanged.status, AdminUploadStatus.STAGED);
  assert.equal(unchanged.error, 'Note slug already exists: occupied-note');
  assert.equal(status?.retryable, true);
});

test('non-retryable note validation failure marks the staged cover failed', async () => {
  const intent = await seedNoteCoverIntent();

  await assert.rejects(() =>
    createAdminNoteFromEditor({
      githubId: intent.githubId,
      input: {
        ...noteInput({
          coverUploadId: intent.uploadId,
          slug: 'invalid-note',
        }),
        publishedAt: 'not-a-date',
      },
    }),
  );

  const failed = await prisma.adminUploadIntent.findUniqueOrThrow({
    where: { id: intent.id },
  });

  assert.equal(failed.status, AdminUploadStatus.FAILED);
  assert.match(failed.error ?? '', /Invalid publish date/);
});

test('creation transaction failure does not finalize intent or persist rows', async () => {
  const intent = await seedNoteCoverIntent();
  const conflictingMediaAssetId = randomUUID();
  await prisma.mediaAsset.create({
    data: {
      blurDataURL: 'data:image/jpeg;base64,',
      id: conflictingMediaAssetId,
      mimeType: 'image/jpeg',
      originalKey: `existing/${conflictingMediaAssetId}.jpg`,
    },
  });
  const noteId = randomUUID();

  await assert.rejects(() =>
    commitAdminNoteCreation({
      cover: preparedCover({
        mediaAssetId: conflictingMediaAssetId,
        noteId,
      }),
      githubId: intent.githubId,
      input: noteInput({
        coverUploadId: intent.uploadId,
        slug: 'rolled-back-create',
      }),
      noteId,
      uploadIntentId: intent.id,
    }),
  );

  const unchangedIntent = await prisma.adminUploadIntent.findUniqueOrThrow({
    where: { id: intent.id },
  });
  assert.equal(await prisma.note.count(), 0);
  assert.equal(await prisma.adminAuditLog.count(), 0);
  assert.equal(unchangedIntent.status, AdminUploadStatus.STAGED);
  assert.equal(unchangedIntent.finalKey, null);
  assert.equal(unchangedIntent.finalizedAt, null);
});

test('renames a slug and content atomically without storage', async () => {
  const note = await seedNote({ slug: 'intro-pytorch', content: '# Intro' });

  const updated = await updateAdminNoteFromEditor({
    githubId: '123',
    id: note.id,
    input: {
      abstract: 'Updated abstract',
      categories: ['Machine Learning'],
      content: '# PyTorch Intro',
      published: true,
      publishedAt: '2026-07-10',
      seoTitle: null,
      slug: 'pytorch-intro',
      title: 'PyTorch Intro',
    },
  });

  assert.equal(updated.slug, 'pytorch-intro');
  assert.equal(updated.content, '# PyTorch Intro');
  const persisted = await prisma.note.findUniqueOrThrow({
    where: { id: note.id },
    include: { categories: true },
  });
  assert.deepEqual(
    persisted.categories.map(({ slug }) => slug),
    ['machine-learning'],
  );
  assert.equal(
    await prisma.adminAuditLog.count({ where: { targetId: note.id } }),
    1,
  );
  assert.equal(
    await prisma.note.findUnique({ where: { slug: 'intro-pytorch' } }),
    null,
  );
  assert.equal(await getPublishedNoteBySlug('intro-pytorch'), null);
  assert.equal((await getPublishedNoteBySlug('pytorch-intro'))?.id, note.id);
});

test('preserves exact Markdown bytes when renaming a slug', async () => {
  const content = '\r\n# Exact Markdown\r\n';
  const note = await seedNote({ slug: 'original-slug', content });

  const updated = await updateAdminNoteFromEditor({
    githubId: '123',
    id: note.id,
    input: {
      abstract: note.abstract,
      categories: ['Architecture'],
      content,
      published: true,
      publishedAt: '2026-07-10',
      seoTitle: null,
      slug: 'renamed-slug',
      title: note.title,
    },
  });

  assert.equal(updated.content, content);
  assert.equal(
    (await prisma.note.findUniqueOrThrow({ where: { id: note.id } })).content,
    content,
  );
});

test('duplicate slug rolls back the original note content', async () => {
  const original = await seedNote({
    slug: 'original-note',
    content: '# Original',
  });
  await seedNote({ slug: 'occupied-slug', content: '# Occupied' });

  await assert.rejects(() =>
    updateAdminNoteFromEditor({
      githubId: '123',
      id: original.id,
      input: {
        abstract: 'Changed abstract',
        categories: ['Databases'],
        content: '# Changed',
        published: true,
        publishedAt: '2026-07-10',
        seoTitle: null,
        slug: 'occupied-slug',
        title: 'Changed title',
      },
    }),
  );

  const unchanged = await prisma.note.findUniqueOrThrow({
    where: { id: original.id },
  });

  assert.equal(unchanged.slug, 'original-note');
  assert.equal(unchanged.content, '# Original');
  assert.equal(
    await prisma.adminAuditLog.count({ where: { targetId: original.id } }),
    0,
  );
});

test('concurrent same-slug updates leave the loser unchanged', async () => {
  const first = await seedNote({
    slug: 'first-original',
    content: '# First original',
  });
  const second = await seedNote({
    slug: 'second-original',
    content: '# Second original',
  });
  const attempts = [
    {
      note: first,
      input: {
        abstract: 'First updated',
        categories: ['First category'],
        content: '# First winner candidate',
        published: true,
        publishedAt: '2026-07-10',
        seoTitle: null,
        slug: 'shared-new-slug',
        title: 'First candidate',
      },
    },
    {
      note: second,
      input: {
        abstract: 'Second updated',
        categories: ['Second category'],
        content: '# Second winner candidate',
        published: true,
        publishedAt: '2026-07-10',
        seoTitle: null,
        slug: 'shared-new-slug',
        title: 'Second candidate',
      },
    },
  ];

  const results = await Promise.allSettled(
    attempts.map(({ input, note }) =>
      updateAdminNoteFromEditor({
        githubId: '123',
        id: note.id,
        input,
      }),
    ),
  );
  const winnerIndex = results.findIndex(({ status }) => status === 'fulfilled');
  const loserIndex = results.findIndex(({ status }) => status === 'rejected');

  assert.notEqual(winnerIndex, -1);
  assert.notEqual(loserIndex, -1);
  const loserResult = results[loserIndex];
  assert.equal(loserResult.status, 'rejected');
  assert.ok(loserResult.reason instanceof AdminDomainError);
  assert.equal(loserResult.reason.status, 409);

  const loserAttempt = attempts[loserIndex];
  const loser = await prisma.note.findUniqueOrThrow({
    where: { id: loserAttempt.note.id },
    include: { categories: true },
  });
  assert.equal(loser.slug, loserAttempt.note.slug);
  assert.equal(loser.content, loserAttempt.note.content);
  assert.deepEqual(loser.categories, []);
  assert.equal(
    await prisma.adminAuditLog.count({
      where: { targetId: loserAttempt.note.id },
    }),
    0,
  );
  assert.equal(
    await prisma.note.count({ where: { slug: 'shared-new-slug' } }),
    1,
  );
});

test('editing a title preserves the explicit slug', async () => {
  const note = await seedNote({
    slug: 'stable-slug',
    content: '# Before',
  });

  const updated = await updateAdminNoteFromEditor({
    githubId: '123',
    id: note.id,
    input: {
      abstract: 'Updated abstract',
      categories: ['Architecture'],
      content: '# After',
      published: true,
      publishedAt: '2026-07-10',
      seoTitle: null,
      slug: 'stable-slug',
      title: 'A completely different title',
    },
  });

  assert.equal(updated.slug, 'stable-slug');
  assert.equal(updated.title, 'A completely different title');
});

test('archive_note_does_not_enqueue_storage_deletion', async () => {
  const note = await seedNote({ slug: 'archive-only', content: '# Archive' });

  await updateAdminNoteStatus({
    action: 'archive',
    githubId: '123',
    id: note.id,
  });

  assert.equal(await prisma.storageDeletionJob.count(), 0);
  assert.ok(
    (await prisma.note.findUniqueOrThrow({ where: { id: note.id } }))
      .archivedAt,
  );
});

test('purge_note_enqueues_exact_cover_key', async () => {
  const note = await seedNote({ slug: 'purge-note', content: '# Purge' });
  const persisted = await prisma.note.findUniqueOrThrow({
    where: { id: note.id },
    include: { coverMedia: true },
  });
  await updateAdminNoteStatus({
    action: 'archive',
    githubId: '123',
    id: note.id,
  });

  await purgeAdminNote({ githubId: '123', id: note.id });

  const job = await prisma.storageDeletionJob.findFirstOrThrow();
  assert.deepEqual(job.payload, {
    originalKeys: [persisted.coverMedia.originalKey],
    transformedPrefixes: [persisted.coverMedia.originalKey],
  });
  assert.equal(await prisma.note.count(), 0);
  assert.equal(await prisma.mediaAsset.count(), 0);
  assert.equal(
    await prisma.adminAuditLog.count({
      where: { action: 'PURGE', targetId: note.id },
    }),
    1,
  );
});

test('note purge keeps database rows when CDN configuration is incomplete', async () => {
  const note = await seedNote({
    slug: 'purge-preflight-note',
    content: '# Purge preflight',
  });
  await prisma.note.update({
    where: { id: note.id },
    data: { archivedAt: new Date() },
  });
  delete process.env.CLOUDFRONT_ORIGINALS_DISTRIBUTION_ID;

  await assert.rejects(
    () => purgeAdminNote({ githubId: '123', id: note.id }),
    /CLOUDFRONT_ORIGINALS_DISTRIBUTION_ID/,
  );

  assert.equal(await prisma.note.count(), 1);
  assert.equal(await prisma.mediaAsset.count(), 1);
  assert.equal(await prisma.storageDeletionJob.count(), 0);
  assert.equal(await prisma.adminAuditLog.count(), 0);
});

test('replace_note_cover_swaps_pointer_and_queues_old_asset', async () => {
  const note = await seedNote({ slug: 'replace-cover', content: '# Cover' });
  const before = await prisma.note.findUniqueOrThrow({
    where: { id: note.id },
    include: { coverMedia: true },
  });
  const newMediaAssetId = randomUUID();
  const newKey = buildNoteCoverOriginalKey({
    extension: 'webp',
    mediaAssetId: newMediaAssetId,
    noteId: note.id,
  });
  await prisma.mediaAsset.create({
    data: {
      blurDataURL: 'data:image/webp;base64,',
      id: newMediaAssetId,
      mimeType: 'image/webp',
      originalKey: newKey,
    },
  });

  const updated = await swapAdminNoteCover({
    githubId: '123',
    newMediaAssetId,
    noteId: note.id,
  });

  assert.equal(updated.coverMediaId, newMediaAssetId);
  assert.equal(updated.coverMedia.originalKey, newKey);
  assert.equal(
    await prisma.mediaAsset.findUnique({ where: { id: before.coverMediaId } }),
    null,
  );
  const job = await prisma.storageDeletionJob.findFirstOrThrow();
  assert.deepEqual(job.payload, {
    originalKeys: [before.coverMedia.originalKey],
    transformedPrefixes: [before.coverMedia.originalKey],
  });
});

test('failed cover replacement leaves the old cover unchanged', async () => {
  const note = await seedNote({
    slug: 'failed-cover-replacement',
    content: '# Cover',
  });

  await assert.rejects(() =>
    swapAdminNoteCover({
      githubId: '123',
      newMediaAssetId: randomUUID(),
      noteId: note.id,
    }),
  );

  const unchanged = await prisma.note.findUniqueOrThrow({
    where: { id: note.id },
  });
  assert.equal(unchanged.coverMediaId, note.coverMediaId);
  assert.equal(await prisma.storageDeletionJob.count(), 0);
});
