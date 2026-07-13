import { after } from 'next/server';

import { Prisma, StorageDeletionStatus } from '@/generated/prisma/client';
import { z } from 'zod';

import { awsCloudFrontInvalidatePrefixes } from '@/services/awsCloudFront';
import {
  awsS3DeleteAllVersions,
  awsS3DeleteMany,
  awsS3List,
} from '@/services/awsS3';

import {
  type StorageEnvironment,
  assertStorageDeletionConfigured,
} from './storageConfig';

export { assertStorageDeletionConfigured } from './storageConfig';

const ID_SEGMENT = '[A-Za-z0-9_-]+';
const EXTENSION_SEGMENT = '[a-z0-9]+';
const CANONICAL_MEDIA_TARGET = new RegExp(
  `^media/(?:photos/${ID_SEGMENT}/${ID_SEGMENT}|notes/${ID_SEGMENT}/covers/${ID_SEGMENT}|projects/${ID_SEGMENT}/${ID_SEGMENT})/original\\.${EXTENSION_SEGMENT}$`,
);
const MAX_DRAIN_LIMIT = 20;
const BASE_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;
const MAX_STORAGE_TARGETS_PER_JOB = 100;
export const STORAGE_DELETION_JOB_LEASE_MS = 15 * 60 * 1000;

const canonicalMediaTargetSchema = z
  .string()
  .regex(CANONICAL_MEDIA_TARGET, 'Invalid canonical media target.');

export const storageDeletionPayloadSchema = z
  .object({
    originalKeys: z
      .array(canonicalMediaTargetSchema)
      .max(MAX_STORAGE_TARGETS_PER_JOB),
    transformedPrefixes: z
      .array(canonicalMediaTargetSchema)
      .max(MAX_STORAGE_TARGETS_PER_JOB),
  })
  .transform((payload) => ({
    originalKeys: [...new Set(payload.originalKeys)],
    transformedPrefixes: [...new Set(payload.transformedPrefixes)],
  }));

export type StorageDeletionPayload = z.output<
  typeof storageDeletionPayloadSchema
>;

export type StorageDeletionAdapters = {
  deleteOriginalKeys(keys: string[]): Promise<void>;
  deleteTransformedPrefixes(prefixes: string[]): Promise<void>;
  invalidateOriginalPrefixes(prefixes: string[]): Promise<void>;
  invalidateTransformedPrefixes(prefixes: string[]): Promise<void>;
};

type StorageDeletionServices = {
  deleteAllOriginalVersions: typeof awsS3DeleteAllVersions;
  deleteCurrentObjects: typeof awsS3DeleteMany;
  invalidatePrefixes: typeof awsCloudFrontInvalidatePrefixes;
  listCurrentObjects: typeof awsS3List;
};

type StorageDeletionTransaction = {
  storageDeletionJob: {
    create(args: {
      data: Prisma.StorageDeletionJobCreateInput;
    }): PromiseLike<unknown>;
  };
};

const defaultDeletionServices: StorageDeletionServices = {
  deleteAllOriginalVersions: awsS3DeleteAllVersions,
  deleteCurrentObjects: awsS3DeleteMany,
  invalidatePrefixes: awsCloudFrontInvalidatePrefixes,
  listCurrentObjects: awsS3List,
};

export function createStorageDeletionAdapters({
  environment = process.env,
  services = defaultDeletionServices,
}: {
  environment?: StorageEnvironment;
  services?: StorageDeletionServices;
} = {}): StorageDeletionAdapters {
  return {
    async deleteOriginalKeys(keys) {
      if (keys.length === 0) return;

      const { expectedBucketOwner, originalBucketName } =
        assertStorageDeletionConfigured(environment);
      await services.deleteAllOriginalVersions({
        Bucket: originalBucketName,
        ExpectedBucketOwner: expectedBucketOwner,
        Keys: keys,
      });
    },
    async deleteTransformedPrefixes(prefixes) {
      if (prefixes.length === 0) return;

      const { expectedBucketOwner, transformedBucketName: bucket } =
        assertStorageDeletionConfigured(environment);
      const keys = (
        await Promise.all(
          prefixes.map((prefix) =>
            services.listCurrentObjects(prefix, {
              Bucket: bucket,
              ExpectedBucketOwner: expectedBucketOwner,
            }),
          ),
        )
      ).flat();

      if (keys.length === 0) return;
      await services.deleteCurrentObjects({
        Bucket: bucket,
        ExpectedBucketOwner: expectedBucketOwner,
        Keys: keys,
      });
    },
    async invalidateOriginalPrefixes(prefixes) {
      const { originalDistributionId } =
        assertStorageDeletionConfigured(environment);
      await services.invalidatePrefixes({
        distributionId: originalDistributionId,
        prefixes,
      });
    },
    async invalidateTransformedPrefixes(prefixes) {
      const { transformedDistributionId } =
        assertStorageDeletionConfigured(environment);
      await services.invalidatePrefixes({
        distributionId: transformedDistributionId,
        prefixes,
      });
    },
  };
}

const defaultDeletionAdapters = createStorageDeletionAdapters();

export async function executeStorageDeletionPayload(
  persistedPayload: unknown,
  adapters: StorageDeletionAdapters = defaultDeletionAdapters,
) {
  const payload = storageDeletionPayloadSchema.parse(persistedPayload);

  // Fail before deleting originals when the default storage environment is
  // incomplete. Purge callers can use the same preflight before committing
  // their database transaction.
  if (adapters === defaultDeletionAdapters) {
    assertStorageDeletionConfigured();
  }

  await adapters.deleteOriginalKeys(payload.originalKeys);
  await adapters.deleteTransformedPrefixes(payload.transformedPrefixes);
  await adapters.invalidateOriginalPrefixes(payload.originalKeys);
  await adapters.invalidateTransformedPrefixes(payload.transformedPrefixes);
}

export async function enqueueStorageDeletion(
  transaction: StorageDeletionTransaction,
  {
    payload,
    reason,
  }: {
    payload: StorageDeletionPayload;
    reason: string;
  },
) {
  const parsedPayload = storageDeletionPayloadSchema.parse(payload);
  const normalizedReason = reason.trim();

  if (!normalizedReason)
    throw new Error('Storage deletion reason is required.');

  return transaction.storageDeletionJob.create({
    data: {
      payload: parsedPayload,
      reason: normalizedReason,
    },
  });
}

function retryDelayMs(attempts: number) {
  return Math.min(
    BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempts - 1),
    MAX_RETRY_DELAY_MS,
  );
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, ' ').slice(0, 2_000);
}

type ClaimedDeletionJob = {
  attempts: number;
  id: string;
  payload: Prisma.JsonValue;
  updatedAt: Date;
};

async function claimDeletionJobs(limit: number, now: Date) {
  const { default: prisma } = await import('@/lib/prisma');
  const leaseExpiredBefore = new Date(
    now.getTime() - STORAGE_DELETION_JOB_LEASE_MS,
  );

  return prisma.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      select id
      from storage_deletion_jobs
      where (
        status in ('PENDING', 'FAILED')
        and "nextAttemptAt" <= ${now}
      ) or (
        status = 'PROCESSING'
        and "updatedAt" <= ${leaseExpiredBefore}
      )
      order by
        case
          when status = 'PROCESSING' then "updatedAt"
          else "nextAttemptAt"
        end asc,
        "createdAt" asc,
        id asc
      limit ${limit}
      for update skip locked
    `);
    const ids = rows.map(({ id }) => id);

    if (ids.length === 0) return [];

    await transaction.storageDeletionJob.updateMany({
      where: {
        id: { in: ids },
        OR: [
          {
            status: {
              in: [StorageDeletionStatus.PENDING, StorageDeletionStatus.FAILED],
            },
            nextAttemptAt: { lte: now },
          },
          {
            status: StorageDeletionStatus.PROCESSING,
            updatedAt: { lte: leaseExpiredBefore },
          },
        ],
      },
      data: {
        attempts: { increment: 1 },
        lastError: null,
        status: StorageDeletionStatus.PROCESSING,
        // `updatedAt` doubles as the lease/OCC token. Setting it explicitly to
        // the drain's clock also makes stale-claim tests deterministic.
        updatedAt: now,
      },
    });

    return transaction.storageDeletionJob.findMany({
      where: {
        id: { in: ids },
        status: StorageDeletionStatus.PROCESSING,
        updatedAt: now,
      },
      select: {
        attempts: true,
        id: true,
        payload: true,
        updatedAt: true,
      },
    }) as Promise<ClaimedDeletionJob[]>;
  });
}

export async function drainStorageDeletionJobs({
  adapters = defaultDeletionAdapters,
  limit = 20,
  now = new Date(),
}: {
  adapters?: StorageDeletionAdapters;
  limit?: number;
  now?: Date;
} = {}) {
  const { default: prisma } = await import('@/lib/prisma');
  const boundedLimit = Math.min(
    Math.max(Math.trunc(Number.isFinite(limit) ? limit : 20), 1),
    MAX_DRAIN_LIMIT,
  );
  const jobs = await claimDeletionJobs(boundedLimit, now);

  await Promise.all(
    jobs.map(async (job) => {
      try {
        await executeStorageDeletionPayload(job.payload, adapters);
        await prisma.storageDeletionJob.updateMany({
          where: {
            id: job.id,
            status: StorageDeletionStatus.PROCESSING,
            updatedAt: job.updatedAt,
          },
          data: {
            completedAt: new Date(),
            lastError: null,
            status: StorageDeletionStatus.COMPLETED,
          },
        });
      } catch (error) {
        await prisma.storageDeletionJob.updateMany({
          where: {
            id: job.id,
            status: StorageDeletionStatus.PROCESSING,
            updatedAt: job.updatedAt,
          },
          data: {
            lastError: safeError(error),
            nextAttemptAt: new Date(now.getTime() + retryDelayMs(job.attempts)),
            status: StorageDeletionStatus.FAILED,
          },
        });
      }
    }),
  );

  return jobs.length;
}

export async function retryFailedStorageDeletionJobs({
  now = new Date(),
}: {
  now?: Date;
} = {}) {
  const { default: prisma } = await import('@/lib/prisma');
  const result = await prisma.storageDeletionJob.updateMany({
    where: {
      status: StorageDeletionStatus.FAILED,
    },
    data: {
      nextAttemptAt: now,
    },
  });

  return result.count;
}

export function scheduleStorageDeletionDrain() {
  try {
    after(async () => {
      await drainStorageDeletionJobs().catch((error) => {
        console.warn('Storage deletion drain failed.', error);
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('request scope') ||
        error.message.includes('static generation store'))
    ) {
      return;
    }

    throw error;
  }
}
