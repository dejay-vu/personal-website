import { revalidatePath, revalidateTag } from 'next/cache';

import { notePath } from '@/config/venues';
import {
  AdminAuditAction,
  AdminUploadKind,
  AdminUploadStatus,
} from '@/generated/prisma/client';
import { writeAdminAudit } from '@/modules/admin/audit';
import {
  AdminDomainError,
  AdminRetryableUploadError,
  isPrismaUniqueConstraintError,
  isPrismaUniqueConstraintOn,
} from '@/modules/admin/errors';
import { ensureAdminSlug } from '@/modules/admin/slug';
import {
  assertStorageDeletionConfigured,
  enqueueStorageDeletion,
  scheduleStorageDeletionDrain,
} from '@/modules/media/deletionJobs';
import { buildNoteCoverOriginalKey } from '@/modules/media/storageKeys';
import { NOTES_CACHE_TAG } from '@/modules/notes/types';
import { randomUUID } from 'crypto';
import getReadingTime from 'reading-time';

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

const SEO_TITLE_MAX_LENGTH = 60;

export type NoteEditorInput = {
  abstract: string;
  categories: string[];
  content: string;
  published: boolean;
  publishedAt: string;
  seoTitle?: string | null;
  slug: string;
  title: string;
};

type NoteCreateEditorInput = NoteEditorInput & {
  coverUploadId: string;
};

type PreparedNoteCover = {
  blurDataURL: string;
  height: number | null;
  mediaAssetId: string;
  mimeType: string;
  originalKey: string;
  sha256: string;
  sizeBytes: number;
  width: number | null;
};

function loadAdminUploadCapabilities() {
  return import('@/modules/admin/uploads');
}

function normalizeNoteEditorInput(input: NoteEditorInput) {
  const title = input.title.trim();
  const seoTitle = input.seoTitle?.trim() ?? '';
  const abstract = input.abstract.trim();
  const content = input.content;
  const categories = [
    ...new Set(input.categories.map((category) => category.trim())),
  ]
    .filter(Boolean)
    .map((category) => ({
      name: category,
      slug: toSlug(category),
    }));
  const publishedAt = new Date(input.publishedAt);
  const slug = ensureAdminSlug(input.slug, 'Slug');

  if (!title || !abstract || !content.trim() || categories.length === 0) {
    throw new AdminDomainError(
      'Title, abstract, markdown content, and categories are required.',
    );
  }

  if (seoTitle.length > SEO_TITLE_MAX_LENGTH) {
    throw new AdminDomainError(
      `SEO title must be ${SEO_TITLE_MAX_LENGTH} characters or fewer.`,
    );
  }

  if (Number.isNaN(publishedAt.valueOf())) {
    throw new AdminDomainError(`Invalid publish date for ${title}.`);
  }

  if (
    Buffer.byteLength(content, 'utf8') > ADMIN_UPLOAD_LIMITS.maxMarkdownBytes
  ) {
    throw new AdminDomainError(
      `Markdown content must be ${Math.round(
        ADMIN_UPLOAD_LIMITS.maxMarkdownBytes / 1024,
      )} KB or less.`,
    );
  }

  if (categories.some((category) => !category.slug)) {
    throw new AdminDomainError('Categories must contain valid text.');
  }

  const { minutes, words: wordCount } = getReadingTime(content);

  return {
    abstract,
    categories,
    content,
    published: input.published,
    publishedAt,
    readingTime: Math.ceil(minutes),
    seoTitle: seoTitle || null,
    slug,
    title,
    wordCount,
  };
}

async function assertAdminNoteSlugAvailable(slug: string) {
  const duplicate = await prisma.note.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
    },
  });

  if (duplicate) {
    throw new AdminRetryableUploadError(`Note slug already exists: ${slug}`);
  }
}

export async function preflightAdminNoteCreation({
  input,
}: {
  input: NoteEditorInput;
}) {
  const normalized = normalizeNoteEditorInput(input);

  await assertAdminNoteSlugAvailable(normalized.slug);

  return {
    slug: normalized.slug,
  };
}

export async function prepareAdminNoteCreation({
  githubId,
  input,
}: {
  githubId: string;
  input: NoteCreateEditorInput;
}) {
  const result = await preflightAdminNoteCreation({ input });
  const uploads = await loadAdminUploadCapabilities();

  await uploads.clearRetryableUploadError({
    githubId,
    kind: AdminUploadKind.NOTE_COVER,
    uploadId: input.coverUploadId,
  });

  return result;
}

function getImageDimensions(buffer: Buffer) {
  try {
    const exif = extractExif(buffer);
    return {
      height: exif.height,
      width: exif.width,
    };
  } catch {
    return {
      height: null,
      width: null,
    };
  }
}

function revalidateNotes() {
  runCacheRevalidation(() => {
    revalidateTag(NOTES_CACHE_TAG, 'max');
  });
}

function revalidateNotePaths(...slugs: string[]) {
  runCacheRevalidation(() => {
    for (const slug of new Set(slugs)) {
      revalidatePath(notePath(slug));
    }
  });
}

async function getNoteByOriginalKey(originalKey: string) {
  const asset = await prisma.mediaAsset.findUnique({
    where: {
      originalKey,
    },
    include: {
      noteCover: {
        include: {
          categories: true,
          coverMedia: true,
        },
      },
    },
  });

  return asset?.noteCover ?? null;
}

export async function getAdminNoteEditor({ id }: { id: string }) {
  const note = await prisma.note.findUnique({
    where: {
      id,
    },
    include: {
      categories: {
        select: {
          name: true,
          slug: true,
        },
      },
      coverMedia: true,
    },
  });

  if (!note) throw new AdminDomainError('Note was not found.', 404);

  return {
    abstract: note.abstract,
    categories: note.categories.map((category) => category.name),
    content: note.content,
    coverUrl: getMediaImageURL({
      key: note.coverMedia.originalKey,
      width: MEDIA_VARIANT_WIDTHS.card,
    }),
    id: note.id,
    published: note.published,
    publishedAt: note.publishedAt.toISOString().slice(0, 10),
    seoTitle: note.seoTitle ?? '',
    slug: note.slug,
    title: note.title,
  };
}

export async function commitAdminNoteCreation({
  cover,
  githubId,
  input,
  noteId,
  uploadIntentId,
}: {
  cover: PreparedNoteCover;
  githubId: string;
  input: NoteCreateEditorInput;
  noteId: string;
  uploadIntentId: string;
}) {
  const normalized = normalizeNoteEditorInput(input);
  const uploads = await loadAdminUploadCapabilities();

  return prisma.$transaction(async (transaction) => {
    const note = await transaction.note.create({
      data: {
        abstract: normalized.abstract,
        categories: {
          connectOrCreate: normalized.categories.map((category) => ({
            create: category,
            where: {
              slug: category.slug,
            },
          })),
        },
        content: normalized.content,
        coverMedia: {
          create: {
            blurDataURL: cover.blurDataURL,
            height: cover.height,
            id: cover.mediaAssetId,
            mimeType: cover.mimeType,
            originalKey: cover.originalKey,
            sha256: cover.sha256,
            sizeBytes: cover.sizeBytes,
            width: cover.width,
          },
        },
        id: noteId,
        published: normalized.published,
        publishedAt: normalized.publishedAt,
        readingTime: normalized.readingTime,
        seoTitle: normalized.seoTitle,
        slug: normalized.slug,
        title: normalized.title,
        wordCount: normalized.wordCount,
      },
      include: {
        categories: true,
        coverMedia: true,
      },
    });

    await writeAdminAudit(transaction, {
      action: AdminAuditAction.UPLOAD,
      githubId,
      metadata: {
        coverImageKey: cover.originalKey,
        coverUploadId: input.coverUploadId,
      },
      summary: `Created note "${note.title}"`,
      targetId: note.id,
      targetType: 'note',
    });

    await uploads.finalizeUploadIntent(transaction, {
      finalKey: cover.originalKey,
      githubId,
      kind: AdminUploadKind.NOTE_COVER,
      sha256: cover.sha256,
      uploadId: input.coverUploadId,
      uploadIntentId,
    });

    return note;
  });
}

export async function createAdminNoteFromEditor({
  githubId,
  input,
}: {
  githubId: string;
  input: NoteCreateEditorInput;
}) {
  const uploads = await loadAdminUploadCapabilities();
  const coverIntent = await uploads.getUploadIntent({
    githubId,
    kind: AdminUploadKind.NOTE_COVER,
    uploadId: input.coverUploadId,
  });

  if (coverIntent.status === AdminUploadStatus.FINALIZED) {
    if (!coverIntent.finalKey) {
      const error = new AdminDomainError(
        'Finalized upload is missing its final key.',
        409,
      );
      await uploads.markUploadIntentFailed(coverIntent.uploadId, error, {
        finalized: true,
      });
      throw error;
    }

    const existingNote = await getNoteByOriginalKey(coverIntent.finalKey);

    if (!existingNote) {
      const error = new AdminDomainError(
        'Finalized upload no longer has a note record.',
        409,
      );
      await uploads.markUploadIntentFailed(coverIntent.uploadId, error, {
        finalized: true,
      });
      throw error;
    }

    revalidateNotes();
    revalidateNotePaths(existingNote.slug);
    return existingNote;
  }

  if (coverIntent.status !== AdminUploadStatus.STAGED) {
    throw new AdminDomainError('Upload intent is no longer staged.');
  }

  const uploadedFinalKeys: string[] = [];

  try {
    const normalized = normalizeNoteEditorInput(input);

    await assertAdminNoteSlugAvailable(normalized.slug);

    await uploads.assertStagedUploadObject({
      intent: coverIntent,
      maxBytes: ADMIN_UPLOAD_LIMITS.maxImageBytes,
    });

    const { buffer: coverBuffer } = await uploads.readStagedUploadBuffer(
      coverIntent.stagingKey,
    );
    const coverMimeType = uploads.detectImageMimeType(coverBuffer);

    if (!coverMimeType) {
      throw new AdminDomainError('Cover upload is not a supported image.');
    }

    const noteId = randomUUID();
    const mediaAssetId = randomUUID();
    const coverImageKey = buildNoteCoverOriginalKey({
      extension: getMediaExtensionFromMimeType(coverMimeType),
      mediaAssetId,
      noteId,
    });

    await uploads.assertS3KeyAvailable(coverImageKey);
    await uploads.copyStagedUpload({
      finalKey: coverImageKey,
      stagingKey: coverIntent.stagingKey,
    });
    uploadedFinalKeys.push(coverImageKey);

    const coverImageBlurDataURL = await generateblurDataURL(
      getMediaImageURL({
        key: coverImageKey,
        quality: 60,
        width: MEDIA_VARIANT_WIDTHS.blur,
      }),
    );
    const coverImageDimensions = getImageDimensions(coverBuffer);
    const coverSha = uploads.sha256(coverBuffer);

    const cover: PreparedNoteCover = {
      blurDataURL: coverImageBlurDataURL,
      height: coverImageDimensions.height,
      mediaAssetId,
      mimeType: coverMimeType,
      originalKey: coverImageKey,
      sha256: coverSha,
      sizeBytes: coverBuffer.length,
      width: coverImageDimensions.width,
    };
    const note = await commitAdminNoteCreation({
      cover,
      githubId,
      input,
      noteId,
      uploadIntentId: coverIntent.id,
    });
    await uploads.runCommittedBookkeeping(`Note ${note.id}`, async () => {
      await uploads
        .deleteStagingObject(coverIntent.stagingKey)
        .catch(() => undefined);
      revalidateNotes();
      revalidateNotePaths(note.slug);
      uploads.prewarmMediaVariantsInBackground({
        key: coverImageKey,
        label: `Note ${note.id}`,
        widths: [...MEDIA_PREWARM_WIDTHS, MEDIA_VARIANT_WIDTHS.noteCover],
      });
      uploads.prewarmMediaVariantsInBackground({
        format: 'jpeg',
        key: coverImageKey,
        label: `Note ${note.id} OG image`,
        widths: [MEDIA_VARIANT_WIDTHS.noteCover],
      });
    });

    return note;
  } catch (error) {
    const uploadError = isPrismaUniqueConstraintOn(error, 'slug')
      ? new AdminRetryableUploadError(
          `Note slug already exists: ${ensureAdminSlug(input.slug, 'Slug')}`,
        )
      : error;

    await uploads.markUploadIntentFailed(coverIntent.uploadId, uploadError);
    await uploads.cleanupUploadedKeys(uploadedFinalKeys);
    throw uploadError;
  }
}

export async function replaceAdminNoteCoverFromUpload({
  githubId,
  noteId,
  uploadId,
}: {
  githubId: string;
  noteId: string;
  uploadId: string;
}) {
  const uploads = await loadAdminUploadCapabilities();
  const intent = await uploads.getUploadIntent({
    githubId,
    kind: AdminUploadKind.NOTE_COVER,
    uploadId,
  });

  if (intent.status === AdminUploadStatus.FINALIZED) {
    if (!intent.finalKey) {
      const error = new AdminDomainError(
        'Finalized upload is missing its final key.',
        409,
      );
      await uploads.markUploadIntentFailed(intent.uploadId, error, {
        finalized: true,
      });
      throw error;
    }

    const existing = await getNoteByOriginalKey(intent.finalKey);
    if (!existing || existing.id !== noteId) {
      const error = new AdminDomainError(
        'Finalized upload no longer matches this note.',
        409,
      );
      await uploads.markUploadIntentFailed(intent.uploadId, error, {
        finalized: true,
      });
      throw error;
    }

    return existing;
  }

  if (intent.status !== AdminUploadStatus.STAGED) {
    throw new AdminDomainError('Upload intent is no longer staged.', 409);
  }

  const current = await prisma.note.findUnique({
    where: { id: noteId },
    include: { coverMedia: true },
  });
  if (!current) throw new AdminDomainError('Note was not found.', 404);

  const uploadedFinalKeys: string[] = [];

  try {
    await uploads.assertStagedUploadObject({
      intent,
      maxBytes: ADMIN_UPLOAD_LIMITS.maxImageBytes,
    });
    const { buffer } = await uploads.readStagedUploadBuffer(intent.stagingKey);
    const mimeType = uploads.detectImageMimeType(buffer);
    if (!mimeType) {
      throw new AdminDomainError('Cover upload is not a supported image.');
    }

    const mediaAssetId = randomUUID();
    const originalKey = buildNoteCoverOriginalKey({
      extension: getMediaExtensionFromMimeType(mimeType),
      mediaAssetId,
      noteId,
    });

    await uploads.assertS3KeyAvailable(originalKey);
    await uploads.copyStagedUpload({
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
    const dimensions = getImageDimensions(buffer);
    const mediaSha = uploads.sha256(buffer);
    const payload = {
      originalKeys: [current.coverMedia.originalKey],
      transformedPrefixes: [current.coverMedia.originalKey],
    };

    const updated = await prisma.$transaction(async (transaction) => {
      await transaction.mediaAsset.create({
        data: {
          blurDataURL,
          height: dimensions.height,
          id: mediaAssetId,
          mimeType,
          originalKey,
          sha256: mediaSha,
          sizeBytes: buffer.length,
          width: dimensions.width,
        },
      });
      const note = await transaction.note.update({
        where: { id: noteId },
        data: { coverMediaId: mediaAssetId },
        include: { categories: true, coverMedia: true },
      });
      await writeAdminAudit(transaction, {
        action: AdminAuditAction.SET_COVER,
        githubId,
        metadata: {
          newMediaAssetId: mediaAssetId,
          previousMediaAssetId: current.coverMediaId,
          uploadId,
        },
        summary: `Replaced cover for note "${current.title}"`,
        targetId: noteId,
        targetType: 'note',
      });
      await enqueueStorageDeletion(transaction, {
        payload,
        reason: `Replace cover for note ${noteId}`,
      });
      await transaction.mediaAsset.delete({
        where: { id: current.coverMediaId },
      });
      await uploads.finalizeUploadIntent(transaction, {
        finalKey: originalKey,
        githubId,
        kind: AdminUploadKind.NOTE_COVER,
        sha256: mediaSha,
        uploadId,
        uploadIntentId: intent.id,
      });
      return note;
    });

    await uploads.runCommittedBookkeeping(`Note ${noteId} cover`, async () => {
      await uploads
        .deleteStagingObject(intent.stagingKey)
        .catch(() => undefined);
      scheduleStorageDeletionDrain();
      revalidateNotes();
      revalidateNotePaths(updated.slug);
      uploads.prewarmMediaVariantsInBackground({
        key: originalKey,
        label: `Note ${noteId} cover`,
        widths: [...MEDIA_PREWARM_WIDTHS, MEDIA_VARIANT_WIDTHS.noteCover],
      });
    });

    return updated;
  } catch (error) {
    await uploads.markUploadIntentFailed(uploadId, error);
    await uploads.cleanupUploadedKeys(uploadedFinalKeys);
    throw error;
  }
}

export async function updateAdminNoteFromEditor({
  githubId,
  id,
  input,
}: {
  githubId: string;
  id: string;
  input: NoteEditorInput;
}) {
  const normalized = normalizeNoteEditorInput(input);
  const current = await prisma.note.findUnique({
    where: {
      id,
    },
  });

  if (!current) throw new AdminDomainError('Note was not found.', 404);

  if (normalized.slug !== current.slug) {
    const duplicate = await prisma.note.findUnique({
      where: {
        slug: normalized.slug,
      },
      select: {
        id: true,
      },
    });

    if (duplicate && duplicate.id !== id) {
      throw new AdminDomainError(
        `Note slug already exists: ${normalized.slug}`,
        409,
      );
    }
  }

  const updated = await prisma
    .$transaction(async (transaction) => {
      const note = await transaction.note.update({
        where: {
          id,
        },
        data: {
          abstract: normalized.abstract,
          content: normalized.content,
          published: normalized.published,
          publishedAt: normalized.publishedAt,
          readingTime: normalized.readingTime,
          seoTitle: normalized.seoTitle,
          slug: normalized.slug,
          title: normalized.title,
          wordCount: normalized.wordCount,
          categories: {
            set: [],
            connectOrCreate: normalized.categories.map((category) => ({
              where: { slug: category.slug },
              create: category,
            })),
          },
        },
        include: {
          categories: true,
          coverMedia: true,
        },
      });

      await writeAdminAudit(transaction, {
        action: AdminAuditAction.UPDATE,
        githubId,
        metadata: {
          previousSlug: current.slug,
          slug: note.slug,
        },
        summary: `Updated note "${note.title}"`,
        targetId: id,
        targetType: 'note',
      });

      return note;
    })
    .catch((error: unknown) => {
      if (isPrismaUniqueConstraintError(error)) {
        throw new AdminDomainError(
          `Note slug already exists: ${normalized.slug}`,
          409,
        );
      }

      throw error;
    });

  revalidateNotes();
  revalidateNotePaths(current.slug, updated.slug);

  return updated;
}

export async function updateAdminNoteStatus({
  action,
  githubId,
  id,
}: {
  action: 'archive' | 'publish' | 'restore' | 'unpublish';
  githubId: string;
  id: string;
}) {
  const note = await prisma.note.findUnique({
    where: {
      id,
    },
  });

  if (!note) throw new AdminDomainError('Note was not found.', 404);

  await prisma.$transaction(async (transaction) => {
    if (action === 'archive') {
      await transaction.note.update({
        where: { id },
        data: {
          archivedAt: new Date(),
          archivedByGithubId: githubId,
        },
      });
      await writeAdminAudit(transaction, {
        action: AdminAuditAction.ARCHIVE,
        githubId,
        summary: `Archived note "${note.title}"`,
        targetId: id,
        targetType: 'note',
      });
    }

    if (action === 'restore') {
      await transaction.note.update({
        where: { id },
        data: {
          archivedAt: null,
          archivedByGithubId: null,
        },
      });
      await writeAdminAudit(transaction, {
        action: AdminAuditAction.RESTORE,
        githubId,
        summary: `Restored note "${note.title}"`,
        targetId: id,
        targetType: 'note',
      });
    }

    if (action === 'publish' || action === 'unpublish') {
      const published = action === 'publish';

      await transaction.note.update({
        where: { id },
        data: { published },
      });
      await writeAdminAudit(transaction, {
        action: published
          ? AdminAuditAction.PUBLISH
          : AdminAuditAction.UNPUBLISH,
        githubId,
        summary: `${published ? 'Published' : 'Unpublished'} note "${note.title}"`,
        targetId: id,
        targetType: 'note',
      });
    }
  });

  revalidateNotes();
  revalidateNotePaths(note.slug);
}

export async function purgeAdminNote({
  githubId,
  id,
}: {
  githubId: string;
  id: string;
}) {
  const note = await prisma.note.findUnique({
    where: {
      id,
    },
    include: {
      coverMedia: true,
    },
  });

  if (!note) throw new AdminDomainError('Note was not found.', 404);
  if (!note.archivedAt) {
    throw new AdminDomainError('Archive the note before purging it.');
  }

  assertStorageDeletionConfigured();

  const payload = {
    originalKeys: [note.coverMedia.originalKey],
    transformedPrefixes: [note.coverMedia.originalKey],
  };

  await prisma.$transaction(async (transaction) => {
    await transaction.note.update({
      where: { id },
      data: { categories: { set: [] } },
    });
    await transaction.note.delete({ where: { id } });
    await transaction.mediaAsset.delete({ where: { id: note.coverMediaId } });
    await writeAdminAudit(transaction, {
      action: AdminAuditAction.PURGE,
      githubId,
      metadata: payload,
      summary: `Purged note "${note.title}" and queued all-version storage deletion`,
      targetId: id,
      targetType: 'note',
    });
    await enqueueStorageDeletion(transaction, {
      payload,
      reason: `Purge note ${id}`,
    });
  });

  scheduleStorageDeletionDrain();
  revalidateNotes();
  revalidateNotePaths(note.slug);
}

export async function swapAdminNoteCover({
  githubId,
  newMediaAssetId,
  noteId,
}: {
  githubId: string;
  newMediaAssetId: string;
  noteId: string;
}) {
  const result = await prisma.$transaction(async (transaction) => {
    const note = await transaction.note.findUnique({
      where: { id: noteId },
      include: { coverMedia: true },
    });

    if (!note) throw new AdminDomainError('Note was not found.', 404);
    if (note.coverMediaId === newMediaAssetId) return { note, queued: false };

    const nextCover = await transaction.mediaAsset.findUnique({
      where: { id: newMediaAssetId },
    });

    if (!nextCover) {
      throw new AdminDomainError('Replacement cover was not found.', 404);
    }

    const updated = await transaction.note.update({
      where: { id: noteId },
      data: { coverMediaId: newMediaAssetId },
      include: { categories: true, coverMedia: true },
    });
    const payload = {
      originalKeys: [note.coverMedia.originalKey],
      transformedPrefixes: [note.coverMedia.originalKey],
    };

    await writeAdminAudit(transaction, {
      action: AdminAuditAction.SET_COVER,
      githubId,
      metadata: {
        newMediaAssetId,
        previousMediaAssetId: note.coverMediaId,
      },
      summary: `Replaced cover for note "${note.title}"`,
      targetId: noteId,
      targetType: 'note',
    });
    await enqueueStorageDeletion(transaction, {
      payload,
      reason: `Replace cover for note ${noteId}`,
    });
    await transaction.mediaAsset.delete({ where: { id: note.coverMediaId } });

    return { note: updated, queued: true };
  });

  if (result.queued) scheduleStorageDeletionDrain();
  revalidateNotes();
  revalidateNotePaths(result.note.slug);

  return result.note;
}
