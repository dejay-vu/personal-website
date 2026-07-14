import { revalidatePath, revalidateTag } from 'next/cache';

import { VENUES } from '@/config/venues';
import {
  AdminAuditAction,
  AdminUploadKind,
  AdminUploadStatus,
} from '@/generated/prisma/client';
import { writeAdminAudit } from '@/modules/admin/audit';
import {
  AdminDomainError,
  AdminRetryableUploadError,
  isPrismaUniqueConstraintOn,
} from '@/modules/admin/errors';
import { ensureAdminSlug } from '@/modules/admin/slug';
import {
  assertS3KeyAvailable,
  assertStagedUploadObject,
  cleanupUploadedKeys,
  clearRetryableUploadError,
  copyStagedUpload,
  deleteStagingObject,
  detectImageMimeType,
  getUploadIntent,
  markUploadIntentFailed,
  markUploadIntentFinalized,
  prewarmMediaVariantsInBackground,
  readStagedUploadBuffer,
  runCommittedBookkeeping,
  sha256,
} from '@/modules/admin/uploads';
import {
  assertStorageDeletionConfigured,
  enqueueStorageDeletion,
  scheduleStorageDeletionDrain,
} from '@/modules/media/deletionJobs';
import { buildPhotoOriginalKey } from '@/modules/media/storageKeys';
import type { PhotoExif } from '@/modules/photos/types';
import { randomUUID } from 'crypto';

import { ADMIN_UPLOAD_LIMITS } from '@/lib/adminUpload';
import { runCacheRevalidation } from '@/lib/cacheRevalidation';
import {
  MEDIA_PREWARM_WIDTHS,
  MEDIA_VARIANT_WIDTHS,
  getMediaExtensionFromMimeType,
  getMediaImageURL,
} from '@/lib/media';
import prisma from '@/lib/prisma';
import { toSlug } from '@/lib/slug';

import { extractExif, generateblurDataURL } from '@/utils/imageHelpers';

export type PhotoFinalizePreflightInput = {
  slug: string;
  tags?: string[];
  title: string;
};

type PhotoFinalizeInput = PhotoFinalizePreflightInput & {
  uploadId: string;
};

type PhotoUpdateInput =
  | {
      action: 'archive' | 'restore';
    }
  | {
      action: 'update';
      slug: string;
      tags?: string[];
      title: string;
    };

const emptyExif: PhotoExif = {
  brightness: null,
  capturedAt: null,
  dateTimeOriginal: null,
  exposureBias: null,
  exposureMode: null,
  exposureProgram: null,
  exposureTime: null,
  fNumber: null,
  fileType: null,
  focalLength: null,
  focalLengthIn35mmFilm: null,
  height: null,
  iso: null,
  lensMake: null,
  lensModel: null,
  make: null,
  model: null,
  orientation: null,
  width: null,
};

function safeExtractExif(buffer: Buffer) {
  try {
    return extractExif(buffer);
  } catch {
    return emptyExif;
  }
}

type NormalizedPhotoTag = {
  field: string;
  label: string;
  slug: string;
  value: string;
};

function normalizePhotoTag({
  field,
  label,
  value,
}: {
  field: string;
  label?: string | null;
  value: string;
}): NormalizedPhotoTag | null {
  const normalizedField = toSlug(field || 'custom');
  const normalizedValue = value.trim();
  const slug = toSlug(normalizedValue);

  if (!normalizedField || !normalizedValue || !slug) return null;

  return {
    field: normalizedField,
    label: label?.trim() || normalizedValue,
    slug,
    value: normalizedValue,
  };
}

function parseManualPhotoTag(rawTag: string) {
  const trimmed = rawTag.trim();
  const separatorIndex = trimmed.indexOf(':');

  if (separatorIndex > 0) {
    const field = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1);

    return normalizePhotoTag({
      field,
      value,
    });
  }

  return normalizePhotoTag({
    field: 'custom',
    value: trimmed,
  });
}

function getExifPhotoTags(exif: PhotoExif) {
  const tags = [
    normalizePhotoTag({ field: 'fileType', value: exif.fileType ?? '' }),
    normalizePhotoTag({ field: 'make', value: exif.make ?? '' }),
    normalizePhotoTag({ field: 'model', value: exif.model ?? '' }),
    normalizePhotoTag({ field: 'lensMake', value: exif.lensMake ?? '' }),
    normalizePhotoTag({ field: 'lens', value: exif.lensModel ?? '' }),
    normalizePhotoTag({ field: 'iso', value: exif.iso ?? '' }),
    normalizePhotoTag({ field: 'aperture', value: exif.fNumber ?? '' }),
    normalizePhotoTag({ field: 'shutter', value: exif.exposureTime ?? '' }),
    normalizePhotoTag({ field: 'focalLength', value: exif.focalLength ?? '' }),
    normalizePhotoTag({
      field: 'focalLength35mm',
      value: exif.focalLengthIn35mmFilm ?? '',
    }),
    normalizePhotoTag({
      field: 'exposureMode',
      value: exif.exposureMode ?? '',
    }),
    normalizePhotoTag({
      field: 'exposureProgram',
      value: exif.exposureProgram ?? '',
    }),
    normalizePhotoTag({ field: 'orientation', value: exif.orientation ?? '' }),
    normalizePhotoTag({
      field: 'year',
      value:
        (exif.dateTimeOriginal ?? exif.capturedAt)?.getFullYear().toString() ??
        '',
    }),
  ];

  return tags.filter((tag): tag is NormalizedPhotoTag => Boolean(tag));
}

function normalizePhotoTags({
  exif,
  manualTags = [],
}: {
  exif?: PhotoExif;
  manualTags?: string[];
}) {
  const tagMap = new Map<string, NormalizedPhotoTag>();
  const tags = [
    ...manualTags
      .map(parseManualPhotoTag)
      .filter((tag): tag is NormalizedPhotoTag => Boolean(tag)),
    ...(exif ? getExifPhotoTags(exif) : []),
  ];

  for (const tag of tags) {
    tagMap.set(`${tag.field}:${tag.slug}`, tag);
  }

  return [...tagMap.values()];
}

function createPhotoTagAssignments(tags: NormalizedPhotoTag[]) {
  return tags.map((tag) => ({
    tag: {
      connectOrCreate: {
        create: tag,
        where: {
          field_slug: {
            field: tag.field,
            slug: tag.slug,
          },
        },
      },
    },
  }));
}

function revalidatePhotos() {
  runCacheRevalidation(() => {
    revalidateTag('photos', 'max');
    revalidatePath(VENUES.photos.path);
    revalidatePath('/sitemap.xml');
  });
}

function normalizePhotoFinalizeInput(input: PhotoFinalizePreflightInput) {
  const title = input.title.trim();
  const slug = ensureAdminSlug(input.slug, 'Slug');

  if (!title) {
    throw new AdminDomainError('Photo title is required.');
  }

  return {
    slug,
    title,
  };
}

export async function preflightAdminPhotoFinalizations({
  inputs,
}: {
  inputs: PhotoFinalizePreflightInput[];
}) {
  const normalized = inputs.map(normalizePhotoFinalizeInput);
  const slugs = normalized.map(({ slug }) => slug);
  const duplicateBatchSlug = slugs.find(
    (slug, index) => slugs.indexOf(slug) !== index,
  );

  if (duplicateBatchSlug) {
    throw new AdminRetryableUploadError(
      `Photo slug appears more than once in this upload: ${duplicateBatchSlug}`,
    );
  }

  const duplicate = await prisma.photo.findFirst({
    where: {
      slug: {
        in: slugs,
      },
    },
    select: {
      slug: true,
    },
  });

  if (duplicate) {
    throw new AdminRetryableUploadError(
      `Photo slug already exists: ${duplicate.slug}`,
    );
  }

  return normalized;
}

export async function prepareAdminPhotoFinalization({
  githubId,
  input,
}: {
  githubId: string;
  input: PhotoFinalizeInput;
}) {
  const [normalized] = await preflightAdminPhotoFinalizations({
    inputs: [input],
  });

  await clearRetryableUploadError({
    githubId,
    kind: AdminUploadKind.PHOTO,
    uploadId: input.uploadId,
  });

  return normalized;
}

async function getPhotoByOriginalKey(originalKey: string) {
  const asset = await prisma.mediaAsset.findUnique({
    where: {
      originalKey,
    },
    include: {
      photo: {
        include: {
          mediaAsset: true,
          tags: {
            include: {
              tag: true,
            },
          },
        },
      },
    },
  });

  return asset?.photo ?? null;
}

export async function finalizePhoto({
  githubId,
  input,
}: {
  githubId: string;
  input: PhotoFinalizeInput;
}) {
  const intent = await getUploadIntent({
    githubId,
    kind: AdminUploadKind.PHOTO,
    uploadId: input.uploadId,
  });
  let originalKeyForRecovery: string | null = null;
  let mediaShaForRecovery: string | null = null;
  const uploadedFinalKeys: string[] = [];

  try {
    if (intent.status === AdminUploadStatus.FINALIZED) {
      if (!intent.finalKey) {
        throw new AdminDomainError(
          'Finalized upload is missing its final key.',
        );
      }

      const existingPhoto = await getPhotoByOriginalKey(intent.finalKey);

      if (!existingPhoto) {
        throw new AdminDomainError(
          'Finalized upload no longer has a photo record.',
          409,
        );
      }

      return existingPhoto;
    }

    const [normalized] = await preflightAdminPhotoFinalizations({
      inputs: [input],
    });
    const { slug, title } = normalized;

    await assertStagedUploadObject({
      intent,
      maxBytes: ADMIN_UPLOAD_LIMITS.maxImageBytes,
    });

    const { buffer } = await readStagedUploadBuffer(intent.stagingKey);
    const detectedMimeType = detectImageMimeType(buffer);

    if (!detectedMimeType) {
      throw new AdminDomainError('Uploaded file is not a supported image.');
    }

    const photoId = randomUUID();
    const mediaAssetId = randomUUID();
    const originalKey = buildPhotoOriginalKey({
      extension: getMediaExtensionFromMimeType(detectedMimeType),
      mediaAssetId,
      photoId,
    });
    originalKeyForRecovery = originalKey;
    const mediaSha = sha256(buffer);
    mediaShaForRecovery = mediaSha;
    await assertS3KeyAvailable(originalKey);
    await copyStagedUpload({
      finalKey: originalKey,
      stagingKey: intent.stagingKey,
    });
    uploadedFinalKeys.push(originalKey);

    const blurDataURL = await generateblurDataURL(
      getMediaImageURL({
        key: originalKey,
        quality: 60,
        width: MEDIA_VARIANT_WIDTHS.blur,
      }),
    );
    const exif = safeExtractExif(buffer);
    const tags = normalizePhotoTags({
      exif,
      manualTags: input.tags,
    });

    prewarmMediaVariantsInBackground({
      key: originalKey,
      label: 'Photo finalize',
      widths: [
        ...MEDIA_PREWARM_WIDTHS,
        MEDIA_VARIANT_WIDTHS.card,
        MEDIA_VARIANT_WIDTHS.modal,
      ],
    });
    prewarmMediaVariantsInBackground({
      format: 'jpeg',
      key: originalKey,
      label: 'Photo OG image',
      widths: [MEDIA_VARIANT_WIDTHS.noteCover],
    });

    const photo = await prisma.photo.create({
      data: {
        id: photoId,
        ...exif,
        mediaAsset: {
          create: {
            id: mediaAssetId,
            blurDataURL,
            height: exif.height,
            mimeType: detectedMimeType,
            originalKey,
            sha256: mediaSha,
            sizeBytes: buffer.length,
            width: exif.width,
          },
        },
        slug,
        tags: {
          create: createPhotoTagAssignments(tags),
        },
        title,
      },
      include: {
        mediaAsset: true,
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    await runCommittedBookkeeping(`Photo ${photo.id}`, async () => {
      await markUploadIntentFinalized({
        finalKey: originalKey,
        sha: mediaSha,
        uploadId: intent.uploadId,
      });
      await deleteStagingObject(intent.stagingKey).catch(() => undefined);
      await prisma.$transaction((transaction) =>
        writeAdminAudit(transaction, {
          action: AdminAuditAction.UPLOAD,
          githubId,
          metadata: {
            originalKey,
            slug,
            tags,
            uploadId: intent.uploadId,
          },
          summary: `Uploaded photo "${photo.title}"`,
          targetId: photo.id,
          targetType: 'photo',
        }),
      );
      revalidatePhotos();
    });

    return photo;
  } catch (error) {
    if (originalKeyForRecovery) {
      const recoveryKey = originalKeyForRecovery;
      const recoveredPhoto = await getPhotoByOriginalKey(recoveryKey);

      if (recoveredPhoto) {
        await runCommittedBookkeeping(
          `Photo ${recoveredPhoto.id}`,
          async () => {
            await markUploadIntentFinalized({
              finalKey: recoveryKey,
              sha:
                mediaShaForRecovery ?? recoveredPhoto.mediaAsset.sha256 ?? '',
              uploadId: intent.uploadId,
            });
            await deleteStagingObject(intent.stagingKey).catch(() => undefined);
            revalidatePhotos();
          },
        );

        return recoveredPhoto;
      }
    }

    const uploadError = isPrismaUniqueConstraintOn(error, 'slug')
      ? new AdminRetryableUploadError(
          `Photo slug already exists: ${ensureAdminSlug(input.slug, 'Slug')}`,
        )
      : error;

    await markUploadIntentFailed(intent.uploadId, uploadError, {
      finalized: intent.status === AdminUploadStatus.FINALIZED,
    });
    await cleanupUploadedKeys(uploadedFinalKeys);
    throw uploadError;
  }
}

export async function updateAdminPhoto({
  githubId,
  id,
  input,
}: {
  githubId: string;
  id: string;
  input: PhotoUpdateInput;
}) {
  const photo = await prisma.photo.findUnique({
    where: {
      id,
    },
    include: {
      mediaAsset: true,
      tags: {
        include: {
          tag: true,
        },
      },
    },
  });

  if (!photo) throw new AdminDomainError('Photo was not found.', 404);

  if (input.action === 'update') {
    const title = input.title.trim();
    const slug = ensureAdminSlug(input.slug, 'Slug');

    if (!title) {
      throw new AdminDomainError('Photo title is required.');
    }

    if (slug !== photo.slug) {
      const duplicate = await prisma.photo.findUnique({
        where: {
          slug,
        },
        select: {
          id: true,
        },
      });

      if (duplicate && duplicate.id !== id) {
        throw new AdminDomainError(`Photo slug already exists: ${slug}`, 409);
      }
    }

    const tags = normalizePhotoTags({
      exif: photo,
      manualTags: input.tags,
    });

    await prisma.$transaction(async (transaction) => {
      await transaction.photo.update({
        where: { id },
        data: {
          slug,
          tags: {
            deleteMany: {},
            create: createPhotoTagAssignments(tags),
          },
          title,
        },
      });
      await writeAdminAudit(transaction, {
        action: AdminAuditAction.UPDATE,
        githubId,
        metadata: {
          originalKey: photo.mediaAsset.originalKey,
          previousSlug: photo.slug,
          previousTitle: photo.title,
          slug,
          tags,
          title,
        },
        summary: `Updated photo "${photo.title}" to "${title}"`,
        targetId: id,
        targetType: 'photo',
      });
    });
  }

  if (input.action === 'archive' || input.action === 'restore') {
    const archived = input.action === 'archive';

    await prisma.$transaction(async (transaction) => {
      await transaction.photo.update({
        where: { id },
        data: {
          archivedAt: archived ? new Date() : null,
          archivedByGithubId: archived ? githubId : null,
        },
      });
      await writeAdminAudit(transaction, {
        action: archived ? AdminAuditAction.ARCHIVE : AdminAuditAction.RESTORE,
        githubId,
        summary: `${archived ? 'Archived' : 'Restored'} photo "${photo.title}"`,
        targetId: id,
        targetType: 'photo',
      });
    });
  }

  revalidatePhotos();
}

export async function purgeAdminPhoto({
  githubId,
  id,
}: {
  githubId: string;
  id: string;
}) {
  const photo = await prisma.photo.findUnique({
    where: {
      id,
    },
    include: {
      mediaAsset: true,
    },
  });

  if (!photo) throw new AdminDomainError('Photo was not found.', 404);
  if (!photo.archivedAt) {
    throw new AdminDomainError('Archive the photo before purging it.');
  }

  assertStorageDeletionConfigured();

  const payload = {
    originalKeys: [photo.mediaAsset.originalKey],
    transformedPrefixes: [photo.mediaAsset.originalKey],
  };

  await prisma.$transaction(async (transaction) => {
    await transaction.photo.delete({ where: { id } });
    await transaction.mediaAsset.delete({ where: { id: photo.mediaAssetId } });
    await writeAdminAudit(transaction, {
      action: AdminAuditAction.PURGE,
      githubId,
      metadata: payload,
      summary: `Purged photo "${photo.title}" and queued all-version storage deletion`,
      targetId: id,
      targetType: 'photo',
    });
    await enqueueStorageDeletion(transaction, {
      payload,
      reason: `Purge photo ${id}`,
    });
  });

  scheduleStorageDeletionDrain();
  revalidatePhotos();
}
