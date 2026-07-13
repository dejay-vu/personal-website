import { after } from 'next/server';

import { AdminUploadKind, AdminUploadStatus } from '@/generated/prisma/client';
import { buildStagingKey } from '@/modules/media/storageKeys';
import { createHash, randomUUID } from 'crypto';

import { ADMIN_UPLOAD_LIMITS } from '@/lib/adminUpload';
import { prewarmMediaVariants } from '@/lib/media';
import prisma from '@/lib/prisma';

import {
  awsS3Copy,
  awsS3CreatePresignedPost,
  awsS3DeleteAllVersions,
  awsS3GetBuffer,
  awsS3Head,
} from '@/services/awsS3';

import { AdminDomainError, getAdminUploadFailure } from './errors';

const PRESIGNED_POST_EXPIRES_SECONDS = 10 * 60;
const STALE_UPLOAD_INTENT_MS = (PRESIGNED_POST_EXPIRES_SECONDS + 5 * 60) * 1000;

const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export type AdminUploadFileInput = {
  kind: AdminUploadKind;
  name: string;
  size: number;
  type?: string | null;
};

function sanitizeFilename(filename: string) {
  const sanitized = filename
    .replace(/[^\w.() -]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return sanitized || 'upload';
}

function normalizeDeclaredMimeType(file: AdminUploadFileInput) {
  return file.type?.trim().toLowerCase() || 'application/octet-stream';
}

function assertPresignFile(file: AdminUploadFileInput) {
  if (!file.name.trim()) {
    throw new AdminDomainError('Missing filename.');
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new AdminDomainError(`${file.name} is empty.`);
  }

  const maxBytes = ADMIN_UPLOAD_LIMITS.maxImageBytes;

  if (file.size > maxBytes) {
    throw new AdminDomainError(
      `${file.name} is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`,
    );
  }

  const declaredType = normalizeDeclaredMimeType(file);

  if (!IMAGE_MIME_TYPES.includes(declaredType as ImageMimeType)) {
    throw new AdminDomainError(`${file.name} is not a supported image type.`);
  }

  return declaredType;
}

function hasPrefix(buffer: Buffer, bytes: number[]) {
  if (buffer.length < bytes.length) return false;

  return bytes.every((byte, index) => buffer[index] === byte);
}

export function detectImageMimeType(buffer: Buffer): ImageMimeType | null {
  if (hasPrefix(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString('ascii') === 'ftyp' &&
    buffer.subarray(8, 32).toString('ascii').includes('avif')
  ) {
    return 'image/avif';
  }

  return null;
}

export function sha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function getUploadStatuses({
  githubId,
  uploadIds,
}: {
  githubId: string;
  uploadIds: string[];
}) {
  const uniqueUploadIds = [...new Set(uploadIds)].slice(0, 24);

  if (uniqueUploadIds.length === 0) return [];

  const intents = await prisma.adminUploadIntent.findMany({
    where: {
      githubId,
      uploadId: {
        in: uniqueUploadIds,
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      error: true,
      finalKey: true,
      finalizedAt: true,
      kind: true,
      originalName: true,
      status: true,
      uploadId: true,
      updatedAt: true,
    },
  });

  return intents.map((intent) => ({
    error: intent.error,
    finalKey: intent.finalKey,
    finalizedAt: intent.finalizedAt?.toISOString() ?? null,
    kind: intent.kind,
    originalName: intent.originalName,
    retryable:
      intent.status === AdminUploadStatus.STAGED && Boolean(intent.error),
    status: intent.status,
    uploadId: intent.uploadId,
    updatedAt: intent.updatedAt.toISOString(),
  }));
}

export async function getUploadIntent({
  githubId,
  kind,
  uploadId,
}: {
  githubId: string;
  kind: AdminUploadKind;
  uploadId: string;
}) {
  const intent = await prisma.adminUploadIntent.findUnique({
    where: {
      uploadId,
    },
  });

  if (!intent || intent.githubId !== githubId || intent.kind !== kind) {
    throw new AdminDomainError('Upload intent was not found.', 404);
  }

  return intent;
}

type UploadIntentTransactionClient = {
  adminUploadIntent: {
    updateMany(args: {
      data: {
        error: null;
        finalKey: string;
        finalizedAt: Date;
        sha256: string;
        status: AdminUploadStatus;
      };
      where: {
        githubId: string;
        id: string;
        kind: AdminUploadKind;
        status: AdminUploadStatus;
        uploadId: string;
      };
    }): PromiseLike<{ count: number }>;
  };
};

export async function finalizeUploadIntent(
  transaction: UploadIntentTransactionClient,
  {
    finalKey,
    githubId,
    kind,
    sha256,
    uploadId,
    uploadIntentId,
  }: {
    finalKey: string;
    githubId: string;
    kind: AdminUploadKind;
    sha256: string;
    uploadId: string;
    uploadIntentId: string;
  },
) {
  const finalized = await transaction.adminUploadIntent.updateMany({
    where: {
      githubId,
      id: uploadIntentId,
      kind,
      status: AdminUploadStatus.STAGED,
      uploadId,
    },
    data: {
      error: null,
      finalKey,
      finalizedAt: new Date(),
      sha256,
      status: AdminUploadStatus.FINALIZED,
    },
  });

  if (finalized.count !== 1) {
    throw new AdminDomainError('Upload intent is no longer staged.', 409);
  }
}

function getUploadFailureUpdate(error: unknown) {
  const failure = getAdminUploadFailure(error);

  if (failure.retryable) {
    return {
      error: failure.message,
    };
  }

  return {
    error: failure.message,
    status: AdminUploadStatus.FAILED,
  };
}

export async function markUploadIntentFailed(
  uploadId: string,
  error: unknown,
  { finalized = false }: { finalized?: boolean } = {},
) {
  const failure = getAdminUploadFailure(error);

  await prisma.adminUploadIntent
    .updateMany({
      where: {
        uploadId,
        status: finalized
          ? AdminUploadStatus.FINALIZED
          : AdminUploadStatus.STAGED,
      },
      data: finalized
        ? {
            error: failure.message,
            status: AdminUploadStatus.FAILED,
          }
        : getUploadFailureUpdate(error),
    })
    .catch((persistenceError) => {
      console.warn(
        `Failed to persist upload error state for ${uploadId}.`,
        persistenceError,
      );
    });
}

export async function clearRetryableUploadError({
  githubId,
  kind,
  uploadId,
}: {
  githubId: string;
  kind: AdminUploadKind;
  uploadId: string;
}) {
  await prisma.adminUploadIntent.updateMany({
    where: {
      githubId,
      kind,
      status: AdminUploadStatus.STAGED,
      uploadId,
    },
    data: {
      error: null,
    },
  });
}

export async function markUploadIntentFinalized({
  finalKey,
  sha,
  uploadId,
}: {
  finalKey: string;
  sha: string;
  uploadId: string;
}) {
  await prisma.adminUploadIntent.update({
    where: {
      uploadId,
    },
    data: {
      error: null,
      finalKey,
      finalizedAt: new Date(),
      sha256: sha,
      status: AdminUploadStatus.FINALIZED,
    },
  });
}

export async function assertStagedUploadObject({
  intent,
  maxBytes,
}: {
  intent: Awaited<ReturnType<typeof getUploadIntent>>;
  maxBytes: number;
}) {
  if (intent.status !== AdminUploadStatus.STAGED) {
    throw new AdminDomainError('Upload intent is no longer staged.');
  }

  const head = await awsS3Head({
    Key: intent.stagingKey,
  });

  if (head.contentLength <= 0) {
    throw new AdminDomainError('Uploaded object is empty.');
  }

  if (head.contentLength > maxBytes) {
    throw new AdminDomainError('Uploaded object exceeds the allowed size.');
  }

  return head;
}

export async function readStagedUploadBuffer(stagingKey: string) {
  return awsS3GetBuffer({ Key: stagingKey });
}

export async function copyStagedUpload({
  finalKey,
  stagingKey,
}: {
  finalKey: string;
  stagingKey: string;
}) {
  return awsS3Copy({
    CopySourceKey: stagingKey,
    Key: finalKey,
  });
}

export async function deleteStagingObject(key: string) {
  return awsS3DeleteAllVersions({ Keys: [key] });
}

function isMissingS3Object(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as {
    $metadata?: { httpStatusCode?: number };
    name?: string;
  };

  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchKey'
  );
}

export async function assertS3KeyAvailable(key: string) {
  try {
    await awsS3Head({ Key: key });
  } catch (error) {
    if (isMissingS3Object(error)) return;

    throw error;
  }

  throw new AdminDomainError(`Target S3 key already exists: ${key}`);
}

export async function cleanupUploadedKeys(keys: string[]) {
  await Promise.allSettled(
    keys.map((key) =>
      retryS3Mutation(() => awsS3DeleteAllVersions({ Keys: [key] })),
    ),
  );
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function retryS3Mutation<T>(task: () => Promise<T>) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;

      if (attempt < 2) {
        await wait(250 * (attempt + 1));
      }
    }
  }

  throw lastError;
}

export async function cleanupExpiredUploads({
  deleteObject = (key: string) =>
    retryS3Mutation(() => awsS3DeleteAllVersions({ Keys: [key] })),
  limit = 50,
  now = new Date(),
}: {
  deleteObject?: (key: string) => Promise<unknown>;
  limit?: number;
  now?: Date;
} = {}) {
  const cutoff = new Date(now.getTime() - STALE_UPLOAD_INTENT_MS);
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const intents = await prisma.adminUploadIntent.findMany({
    where: {
      createdAt: {
        lt: cutoff,
      },
      status: {
        in: [AdminUploadStatus.STAGED, AdminUploadStatus.FAILED],
      },
    },
    orderBy: [{ updatedAt: 'asc' }, { createdAt: 'asc' }],
    take: boundedLimit,
  });

  await Promise.all(
    intents.map(async (intent) => {
      try {
        await deleteObject(intent.stagingKey);
        await prisma.adminUploadIntent.updateMany({
          where: {
            id: intent.id,
            status: {
              in: [AdminUploadStatus.STAGED, AdminUploadStatus.FAILED],
            },
          },
          data: {
            error: intent.error ?? 'Upload expired before finalize.',
            status: AdminUploadStatus.ABORTED,
          },
        });
      } catch (error) {
        await prisma.adminUploadIntent.updateMany({
          where: {
            id: intent.id,
            status: {
              in: [AdminUploadStatus.STAGED, AdminUploadStatus.FAILED],
            },
          },
          data: {
            error: `Staging cleanup failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        });
      }
    }),
  );
}

export async function createUploadPresigns({
  files,
  githubId,
}: {
  files: AdminUploadFileInput[];
  githubId: string;
}) {
  void cleanupExpiredUploads().catch((error) => {
    console.warn('Expired admin upload cleanup failed.', error);
  });

  if (files.length === 0) {
    throw new AdminDomainError('Select at least one file.');
  }

  if (files.length > ADMIN_UPLOAD_LIMITS.maxPhotoBatchFiles) {
    throw new AdminDomainError(
      `Upload up to ${ADMIN_UPLOAD_LIMITS.maxPhotoBatchFiles} files at a time.`,
    );
  }

  return Promise.all(
    files.map(async (file) => {
      const mimeType = assertPresignFile(file);
      const uploadId = randomUUID();
      const filename = sanitizeFilename(file.name);
      const stagingKey = buildStagingKey(uploadId);

      await prisma.adminUploadIntent.create({
        data: {
          githubId,
          kind: file.kind,
          mimeType,
          originalName: filename,
          sizeBytes: Math.trunc(file.size),
          stagingKey,
          uploadId,
        },
      });

      const presigned = await awsS3CreatePresignedPost({
        Conditions: [
          ['content-length-range', 1, ADMIN_UPLOAD_LIMITS.maxImageBytes],
          { 'Content-Type': mimeType },
          { 'x-amz-meta-upload-id': uploadId },
          { 'x-amz-meta-github-id': githubId },
        ],
        Expires: PRESIGNED_POST_EXPIRES_SECONDS,
        Fields: {
          'Content-Type': mimeType,
          'x-amz-meta-github-id': githubId,
          'x-amz-meta-original-name': encodeURIComponent(filename),
          'x-amz-meta-upload-id': uploadId,
        },
        Key: stagingKey,
      });

      return {
        expiresIn: PRESIGNED_POST_EXPIRES_SECONDS,
        fields: presigned.fields,
        kind: file.kind,
        maxBytes: ADMIN_UPLOAD_LIMITS.maxImageBytes,
        originalName: filename,
        stagingKey,
        uploadId,
        url: presigned.url,
      };
    }),
  );
}

export async function runCommittedBookkeeping(
  label: string,
  task: () => Promise<void>,
) {
  try {
    await task();
  } catch (error) {
    console.warn(`${label} committed, but bookkeeping failed.`, error);
  }
}

export function prewarmMediaVariantsInBackground({
  format,
  key,
  label,
  widths,
}: {
  format?: 'auto' | 'jpeg';
  key: string;
  label: string;
  widths: number[];
}) {
  const prewarmPromise = prewarmMediaVariants({
    format,
    key,
    widths,
  }).catch((error) => {
    console.warn(`${label} committed, but media prewarm failed.`, error);
  });

  try {
    after(prewarmPromise);
  } catch {
    // No request scope (scripts/tests) — the promise still runs in-process.
  }
}
