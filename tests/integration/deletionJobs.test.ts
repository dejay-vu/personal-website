import assert from 'node:assert/strict';
import test from 'node:test';

import { StorageDeletionStatus } from '../../src/generated/prisma/client';
import prisma from '../../src/lib/prisma';
import {
  STORAGE_DELETION_JOB_LEASE_MS,
  drainStorageDeletionJobs,
} from '../../src/modules/media/deletionJobs';
import { resetDatabase } from './helpers';

test.beforeEach(resetDatabase);
test.after(() => prisma.$disconnect());

const payload = {
  originalKeys: ['media/photos/photo_1/asset_1/original.jpg'],
  transformedPrefixes: ['media/photos/photo_1/asset_1/original.jpg'],
};

test('concurrent drainers claim a deletion job once', async () => {
  await prisma.storageDeletionJob.create({
    data: { payload, reason: 'concurrency test' },
  });
  let originals = 0;
  let transformed = 0;
  let originalInvalidations = 0;
  let transformedInvalidations = 0;
  const adapters = {
    deleteOriginalKeys: async () => {
      originals += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
    },
    deleteTransformedPrefixes: async () => {
      transformed += 1;
    },
    invalidateOriginalPrefixes: async () => {
      originalInvalidations += 1;
    },
    invalidateTransformedPrefixes: async () => {
      transformedInvalidations += 1;
    },
  };

  const claimed = await Promise.all([
    drainStorageDeletionJobs({ adapters }),
    drainStorageDeletionJobs({ adapters }),
  ]);

  assert.equal(
    claimed.reduce((sum, count) => sum + count, 0),
    1,
  );
  assert.equal(originals, 1);
  assert.equal(transformed, 1);
  assert.equal(originalInvalidations, 1);
  assert.equal(transformedInvalidations, 1);
  const job = await prisma.storageDeletionJob.findFirstOrThrow();
  assert.equal(job.status, StorageDeletionStatus.COMPLETED);
  assert.equal(job.attempts, 1);
  assert.ok(job.completedAt);
});

test('failed deletion records bounded retry state and can succeed later', async () => {
  const now = new Date('2026-07-10T00:00:00.000Z');
  await prisma.storageDeletionJob.create({
    data: { nextAttemptAt: now, payload, reason: 'retry test' },
  });

  await drainStorageDeletionJobs({
    adapters: {
      deleteOriginalKeys: async () => {
        throw new Error('temporary failure\nwith detail');
      },
      deleteTransformedPrefixes: async () => undefined,
      invalidateOriginalPrefixes: async () => undefined,
      invalidateTransformedPrefixes: async () => undefined,
    },
    now,
  });

  const failed = await prisma.storageDeletionJob.findFirstOrThrow();
  assert.equal(failed.status, StorageDeletionStatus.FAILED);
  assert.equal(failed.attempts, 1);
  assert.equal(failed.lastError, 'temporary failure with detail');
  assert.equal(failed.nextAttemptAt.getTime(), now.getTime() + 30_000);

  await drainStorageDeletionJobs({
    adapters: {
      deleteOriginalKeys: async () => undefined,
      deleteTransformedPrefixes: async () => undefined,
      invalidateOriginalPrefixes: async () => undefined,
      invalidateTransformedPrefixes: async () => undefined,
    },
    now: failed.nextAttemptAt,
  });

  const completed = await prisma.storageDeletionJob.findFirstOrThrow();
  assert.equal(completed.status, StorageDeletionStatus.COMPLETED);
  assert.equal(completed.attempts, 2);
});

test('a CDN invalidation failure keeps the deletion job retryable', async () => {
  const now = new Date('2026-07-10T06:00:00.000Z');
  await prisma.storageDeletionJob.create({
    data: { nextAttemptAt: now, payload, reason: 'CDN retry test' },
  });
  let storageDeletions = 0;
  let transformedInvalidations = 0;

  await drainStorageDeletionJobs({
    adapters: {
      deleteOriginalKeys: async () => void (storageDeletions += 1),
      deleteTransformedPrefixes: async () => void (storageDeletions += 1),
      invalidateOriginalPrefixes: async () => {
        throw new Error('CloudFront unavailable');
      },
      invalidateTransformedPrefixes: async () =>
        void (transformedInvalidations += 1),
    },
    now,
  });

  const failed = await prisma.storageDeletionJob.findFirstOrThrow();
  assert.equal(storageDeletions, 2);
  assert.equal(transformedInvalidations, 0);
  assert.equal(failed.status, StorageDeletionStatus.FAILED);
  assert.equal(failed.lastError, 'CloudFront unavailable');
  assert.equal(failed.completedAt, null);
});

test('reclaims a PROCESSING job after its updatedAt lease expires', async () => {
  const now = new Date('2026-07-10T12:00:00.000Z');
  const staleClaim = new Date(
    now.getTime() - STORAGE_DELETION_JOB_LEASE_MS - 1,
  );
  await prisma.storageDeletionJob.create({
    data: {
      attempts: 1,
      payload,
      reason: 'stale processing test',
      status: StorageDeletionStatus.PROCESSING,
      updatedAt: staleClaim,
    },
  });
  let executions = 0;

  const claimed = await drainStorageDeletionJobs({
    adapters: {
      deleteOriginalKeys: async () => void (executions += 1),
      deleteTransformedPrefixes: async () => undefined,
      invalidateOriginalPrefixes: async () => undefined,
      invalidateTransformedPrefixes: async () => undefined,
    },
    now,
  });

  assert.equal(claimed, 1);
  assert.equal(executions, 1);
  const completed = await prisma.storageDeletionJob.findFirstOrThrow();
  assert.equal(completed.status, StorageDeletionStatus.COMPLETED);
  assert.equal(completed.attempts, 2);
  assert.ok(completed.completedAt);
});

test('does not reclaim a PROCESSING job while its lease is fresh', async () => {
  const now = new Date('2026-07-10T12:00:00.000Z');
  const freshClaim = new Date(
    now.getTime() - STORAGE_DELETION_JOB_LEASE_MS + 1,
  );
  await prisma.storageDeletionJob.create({
    data: {
      attempts: 1,
      payload,
      reason: 'fresh processing test',
      status: StorageDeletionStatus.PROCESSING,
      updatedAt: freshClaim,
    },
  });

  const claimed = await drainStorageDeletionJobs({
    adapters: {
      deleteOriginalKeys: async () => {
        throw new Error('fresh lease must not execute');
      },
      deleteTransformedPrefixes: async () => undefined,
      invalidateOriginalPrefixes: async () => undefined,
      invalidateTransformedPrefixes: async () => undefined,
    },
    now,
  });

  assert.equal(claimed, 0);
  const processing = await prisma.storageDeletionJob.findFirstOrThrow();
  assert.equal(processing.status, StorageDeletionStatus.PROCESSING);
  assert.equal(processing.attempts, 1);
  assert.equal(processing.updatedAt.getTime(), freshClaim.getTime());
});

test('an old worker cannot overwrite the state written by a newer claim', async () => {
  const firstNow = new Date('2026-07-10T12:00:00.000Z');
  await prisma.storageDeletionJob.create({
    data: {
      nextAttemptAt: firstNow,
      payload,
      reason: 'lease fencing test',
    },
  });

  let signalFirstStarted!: () => void;
  let releaseFirstWorker!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    signalFirstStarted = resolve;
  });
  const firstMayFinish = new Promise<void>((resolve) => {
    releaseFirstWorker = resolve;
  });
  const firstDrain = drainStorageDeletionJobs({
    adapters: {
      deleteOriginalKeys: async () => {
        signalFirstStarted();
        await firstMayFinish;
      },
      deleteTransformedPrefixes: async () => undefined,
      invalidateOriginalPrefixes: async () => undefined,
      invalidateTransformedPrefixes: async () => undefined,
    },
    now: firstNow,
  });

  await Promise.race([
    firstStarted,
    firstDrain.then(() => {
      throw new Error('The first worker did not claim the deletion job.');
    }),
  ]);
  const secondNow = new Date(
    firstNow.getTime() + STORAGE_DELETION_JOB_LEASE_MS + 1,
  );
  try {
    const secondClaimed = await drainStorageDeletionJobs({
      adapters: {
        deleteOriginalKeys: async () => {
          throw new Error('new worker owns this failure');
        },
        deleteTransformedPrefixes: async () => undefined,
        invalidateOriginalPrefixes: async () => undefined,
        invalidateTransformedPrefixes: async () => undefined,
      },
      now: secondNow,
    });
    assert.equal(secondClaimed, 1);
  } finally {
    releaseFirstWorker();
    await firstDrain;
  }

  const failed = await prisma.storageDeletionJob.findFirstOrThrow();
  assert.equal(failed.status, StorageDeletionStatus.FAILED);
  assert.equal(failed.attempts, 2);
  assert.equal(failed.lastError, 'new worker owns this failure');
  assert.equal(failed.nextAttemptAt.getTime(), secondNow.getTime() + 60_000);
});
