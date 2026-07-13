import { randomUUID } from 'node:crypto';

import { assertTestDatabase } from '../../scripts/assert-test-database';
import {
  AdminUploadKind,
  AdminUploadStatus,
} from '../../src/generated/prisma/client';
import prisma from '../../src/lib/prisma';
import { buildStagingKey } from '../../src/modules/media/storageKeys';

export function configureStorageDeletionTestEnvironment() {
  Object.assign(process.env, {
    AWS_ACCESS_KEY_ID: 'integration-test-access-key',
    AWS_EXPECTED_ACCOUNT_ID: '123456789012',
    AWS_REGION: 'eu-west-2',
    AWS_SECRET_ACCESS_KEY: 'integration-test-secret-key',
    CLOUDFRONT_ORIGINALS_DISTRIBUTION_ID: 'EORIGINALSINTEGRATION',
    CLOUDFRONT_TRANSFORMED_DISTRIBUTION_ID: 'ETRANSFORMEDINTEGRATION',
    S3_BUCKET_NAME: 'integration-test-originals',
    TRANSFORMED_IMAGE_BUCKET_NAME: 'integration-test-transformed',
  });
}

export async function resetDatabase() {
  assertTestDatabase();

  await prisma.$transaction([
    prisma.adminAuditLog.deleteMany(),
    prisma.storageDeletionJob.deleteMany(),
    prisma.adminUploadIntent.deleteMany(),
    prisma.photoTagAssignment.deleteMany(),
    prisma.photo.deleteMany(),
    prisma.photoTag.deleteMany(),
    prisma.note.deleteMany(),
    prisma.category.deleteMany(),
    prisma.mediaAsset.deleteMany(),
  ]);
}

export async function seedNote({
  content,
  slug,
}: {
  content: string;
  slug: string;
}) {
  const id = randomUUID();
  const mediaAssetId = randomUUID();

  return prisma.note.create({
    data: {
      abstract: `Abstract for ${slug}`,
      content,
      coverMedia: {
        create: {
          blurDataURL: 'data:image/jpeg;base64,',
          height: 630,
          id: mediaAssetId,
          mimeType: 'image/jpeg',
          originalKey: `media/notes/${id}/covers/${mediaAssetId}/original.jpg`,
          sizeBytes: 1,
          width: 1200,
        },
      },
      id,
      published: true,
      publishedAt: new Date('2026-07-10T00:00:00.000Z'),
      readingTime: 1,
      slug,
      title: slug,
      wordCount: 2,
    },
  });
}

export async function seedNoteCoverIntent({
  githubId = '123',
  uploadId = randomUUID(),
}: {
  githubId?: string;
  uploadId?: string;
} = {}) {
  return prisma.adminUploadIntent.create({
    data: {
      error: 'clear this on success',
      githubId,
      kind: AdminUploadKind.NOTE_COVER,
      mimeType: 'image/jpeg',
      originalName: 'cover.jpg',
      sizeBytes: 100,
      stagingKey: buildStagingKey(uploadId),
      status: AdminUploadStatus.STAGED,
      uploadId,
    },
  });
}

export async function seedPhotoUploadIntent({
  githubId = '123',
  uploadId = randomUUID(),
}: {
  githubId?: string;
  uploadId?: string;
} = {}) {
  return prisma.adminUploadIntent.create({
    data: {
      githubId,
      kind: AdminUploadKind.PHOTO,
      mimeType: 'image/jpeg',
      originalName: 'photo.jpg',
      sizeBytes: 100,
      stagingKey: buildStagingKey(uploadId),
      status: AdminUploadStatus.STAGED,
      uploadId,
    },
  });
}
