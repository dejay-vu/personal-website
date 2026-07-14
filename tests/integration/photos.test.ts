import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { AdminUploadStatus } from '../../src/generated/prisma/client';
import prisma from '../../src/lib/prisma';
import { AdminDomainError } from '../../src/modules/admin/errors';
import { getUploadStatuses } from '../../src/modules/admin/uploads';
import { buildPhotoOriginalKey } from '../../src/modules/media/storageKeys';
import {
  finalizePhoto,
  preflightAdminPhotoFinalizations,
  purgeAdminPhoto,
  updateAdminPhoto,
} from '../../src/modules/photos/admin';
import { getPhotoSitemapEntries } from '../../src/modules/photos/read';
import {
  configureStorageDeletionTestEnvironment,
  resetDatabase,
  seedPhotoUploadIntent,
} from './helpers';

test.beforeEach(async () => {
  configureStorageDeletionTestEnvironment();
  await resetDatabase();
});
test.after(() => prisma.$disconnect());

async function seedPhoto(slug: string) {
  const photoId = randomUUID();
  const mediaAssetId = randomUUID();

  return prisma.photo.create({
    data: {
      id: photoId,
      mediaAsset: {
        create: {
          blurDataURL: 'data:image/jpeg;base64,',
          id: mediaAssetId,
          mimeType: 'image/jpeg',
          originalKey: buildPhotoOriginalKey({
            extension: 'jpg',
            mediaAssetId,
            photoId,
          }),
        },
      },
      slug,
      title: slug,
    },
  });
}

test('photo sitemap reads the public media key and excludes archives', async () => {
  const visible = await seedPhoto('sitemap-visible-photo');
  const archived = await seedPhoto('sitemap-archived-photo');
  await prisma.photo.update({
    data: { archivedAt: new Date() },
    where: { id: archived.id },
  });

  const persisted = await prisma.photo.findUniqueOrThrow({
    include: { mediaAsset: true },
    where: { id: visible.id },
  });
  const entries = await getPhotoSitemapEntries();

  assert.deepEqual(
    entries.photos.map(({ mediaAsset, slug }) => ({
      originalKey: mediaAsset.originalKey,
      slug,
    })),
    [
      {
        originalKey: persisted.mediaAsset.originalKey,
        slug: visible.slug,
      },
    ],
  );
});

test('photo preflight rejects database and same-batch slug conflicts', async () => {
  await seedPhoto('occupied-photo');

  await assert.rejects(
    () =>
      preflightAdminPhotoFinalizations({
        inputs: [{ slug: 'Occupied Photo', title: 'Occupied' }],
      }),
    (error: unknown) =>
      error instanceof AdminDomainError &&
      error.status === 409 &&
      error.message === 'Photo slug already exists: occupied-photo',
  );
  await assert.rejects(
    () =>
      preflightAdminPhotoFinalizations({
        inputs: [
          { slug: 'same-photo', title: 'First' },
          { slug: 'Same Photo', title: 'Second' },
        ],
      }),
    (error: unknown) =>
      error instanceof AdminDomainError &&
      error.status === 409 &&
      error.message.includes('appears more than once'),
  );
});

test('duplicate photo slug keeps the staged upload retryable and visible', async () => {
  await seedPhoto('occupied-photo');
  const intent = await seedPhotoUploadIntent();

  await assert.rejects(
    () =>
      finalizePhoto({
        githubId: intent.githubId,
        input: {
          slug: 'occupied-photo',
          title: 'Occupied photo',
          uploadId: intent.uploadId,
        },
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
  assert.equal(unchanged.error, 'Photo slug already exists: occupied-photo');
  assert.equal(status?.retryable, true);
});

test('non-retryable photo validation failure marks the staged upload failed', async () => {
  const intent = await seedPhotoUploadIntent();

  await assert.rejects(() =>
    finalizePhoto({
      githubId: intent.githubId,
      input: {
        slug: 'invalid-photo',
        title: ' ',
        uploadId: intent.uploadId,
      },
    }),
  );

  const failed = await prisma.adminUploadIntent.findUniqueOrThrow({
    where: { id: intent.id },
  });

  assert.equal(failed.status, AdminUploadStatus.FAILED);
  assert.equal(failed.error, 'Photo title is required.');
});

test('editing a photo title preserves its explicit slug and media identity', async () => {
  const photoId = randomUUID();
  const mediaAssetId = randomUUID();
  const originalKey = buildPhotoOriginalKey({
    extension: 'jpg',
    mediaAssetId,
    photoId,
  });
  const photo = await prisma.photo.create({
    data: {
      id: photoId,
      mediaAsset: {
        create: {
          blurDataURL: 'data:image/jpeg;base64,',
          id: mediaAssetId,
          mimeType: 'image/jpeg',
          originalKey,
        },
      },
      slug: 'stable-photo-slug',
      title: 'Original title',
    },
  });

  await updateAdminPhoto({
    githubId: '123',
    id: photo.id,
    input: {
      action: 'update',
      slug: 'stable-photo-slug',
      tags: [],
      title: 'A completely different title',
    },
  });

  const updated = await prisma.photo.findUniqueOrThrow({
    where: { id: photo.id },
    include: { mediaAsset: true },
  });

  assert.equal(updated.slug, 'stable-photo-slug');
  assert.equal(updated.title, 'A completely different title');
  assert.equal(updated.mediaAsset.originalKey, originalKey);
  assert.equal(
    await prisma.adminAuditLog.count({ where: { targetId: photo.id } }),
    1,
  );
});

test('purging an archived photo queues its exact immutable key', async () => {
  const photoId = randomUUID();
  const mediaAssetId = randomUUID();
  const originalKey = buildPhotoOriginalKey({
    extension: 'jpg',
    mediaAssetId,
    photoId,
  });
  await prisma.photo.create({
    data: {
      archivedAt: new Date(),
      id: photoId,
      mediaAsset: {
        create: {
          blurDataURL: 'data:image/jpeg;base64,',
          id: mediaAssetId,
          mimeType: 'image/jpeg',
          originalKey,
        },
      },
      slug: 'purge-photo',
      title: 'Purge photo',
    },
  });

  await purgeAdminPhoto({ githubId: '123', id: photoId });

  const job = await prisma.storageDeletionJob.findFirstOrThrow();
  assert.deepEqual(job.payload, {
    originalKeys: [originalKey],
    transformedPrefixes: [originalKey],
  });
  assert.equal(await prisma.photo.count(), 0);
  assert.equal(await prisma.mediaAsset.count(), 0);
});

test('photo purge keeps database rows when CDN configuration is incomplete', async () => {
  const photo = await seedPhoto('purge-preflight-photo');
  await prisma.photo.update({
    where: { id: photo.id },
    data: { archivedAt: new Date() },
  });
  delete process.env.CLOUDFRONT_TRANSFORMED_DISTRIBUTION_ID;

  await assert.rejects(
    () => purgeAdminPhoto({ githubId: '123', id: photo.id }),
    /CLOUDFRONT_TRANSFORMED_DISTRIBUTION_ID/,
  );

  assert.equal(await prisma.photo.count(), 1);
  assert.equal(await prisma.mediaAsset.count(), 1);
  assert.equal(await prisma.storageDeletionJob.count(), 0);
  assert.equal(await prisma.adminAuditLog.count(), 0);
});
