import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { AdminUploadStatus } from '../../src/generated/prisma/client';
import prisma from '../../src/lib/prisma';
import {
  cleanupExpiredUploads,
  markUploadIntentFailed,
} from '../../src/modules/admin/uploads';
import { resetDatabase } from './helpers';

test.beforeEach(resetDatabase);
test.after(() => prisma.$disconnect());

test('cleaned failed uploads cannot starve newer expired staging objects', async () => {
  const createdAt = new Date('2026-07-10T00:00:00.000Z');
  const failed = Array.from({ length: 50 }, (_, index) => ({
    createdAt,
    error: `failure ${index}`,
    githubId: '123',
    kind: 'PHOTO' as const,
    mimeType: 'image/jpeg',
    originalName: `failed-${index}.jpg`,
    sizeBytes: 100,
    stagingKey: `staging/failed-${index}`,
    status: AdminUploadStatus.FAILED,
    updatedAt: new Date(createdAt.getTime() + index),
    uploadId: randomUUID(),
  }));
  const stagedKey = 'staging/newer-expired';

  await prisma.adminUploadIntent.createMany({ data: failed });
  await prisma.adminUploadIntent.create({
    data: {
      createdAt,
      githubId: '123',
      kind: 'PHOTO',
      mimeType: 'image/jpeg',
      originalName: 'newer.jpg',
      sizeBytes: 100,
      stagingKey: stagedKey,
      updatedAt: new Date('2026-07-10T01:00:00.000Z'),
      uploadId: randomUUID(),
    },
  });
  const deleted: string[] = [];
  const options = {
    deleteObject: async (key: string) => void deleted.push(key),
    now: new Date('2026-07-12T00:00:00.000Z'),
  };

  await cleanupExpiredUploads(options);
  await cleanupExpiredUploads(options);

  assert.equal(
    await prisma.adminUploadIntent.count({
      where: { status: AdminUploadStatus.ABORTED },
    }),
    51,
  );
  assert.equal(deleted.includes(stagedKey), true);
});

test('a failed retry of a finalized upload cannot remain visible as success', async () => {
  const uploadId = randomUUID();
  await prisma.adminUploadIntent.create({
    data: {
      error: null,
      finalKey: 'media/photos/photo_1/asset_1/original.jpg',
      finalizedAt: new Date(),
      githubId: '123',
      kind: 'PHOTO',
      mimeType: 'image/jpeg',
      originalName: 'finalized.jpg',
      sizeBytes: 100,
      stagingKey: `staging/${uploadId}`,
      status: AdminUploadStatus.FINALIZED,
      uploadId,
    },
  });

  await markUploadIntentFailed(
    uploadId,
    new Error('Finalized upload has no domain record.'),
    { finalized: true },
  );

  const intent = await prisma.adminUploadIntent.findUniqueOrThrow({
    where: { uploadId },
  });
  assert.equal(intent.status, AdminUploadStatus.FAILED);
  assert.equal(intent.error, 'Finalized upload has no domain record.');
});
