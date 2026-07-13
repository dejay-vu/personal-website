import {
  AdminAuditAction,
  Prisma,
  StorageDeletionStatus,
} from '@/generated/prisma/client';
import type {
  NoteGetPayload,
  PhotoGetPayload,
} from '@/generated/prisma/models';
import { scheduleStorageDeletionDrain } from '@/modules/media/deletionJobs';

import { MEDIA_VARIANT_WIDTHS, getMediaImageURL } from '@/lib/media';
import prisma from '@/lib/prisma';

export type AdminDashboardData = {
  auditLogs: {
    action: AdminAuditAction;
    createdAt: string;
    githubId: string;
    id: string;
    success: boolean;
    summary: string;
    targetId: string | null;
    targetType: string;
  }[];
  deletionJobs: {
    counts: {
      failed: number;
      pending: number;
      processing: number;
    };
    recentFailures: {
      attempts: number;
      id: string;
      lastError: string;
      nextAttemptAt: string;
      reason: string;
      updatedAt: string;
    }[];
  };
  photos: {
    archivedAt: string | null;
    createdAt: string;
    height: number | null;
    id: string;
    originalKey: string;
    slug: string;
    tags: {
      field: string;
      label: string;
      slug: string;
      value: string;
    }[];
    thumbnailUrl: string;
    title: string;
    updatedAt: string;
    width: number | null;
  }[];
  notes: {
    abstract: string;
    archivedAt: string | null;
    categories: { name: string; slug: string }[];
    coverUrl: string;
    createdAt: string;
    id: string;
    published: boolean;
    publishedAt: string;
    readingTime: number;
    seoTitle: string | null;
    slug: string;
    title: string;
    updatedAt: string;
    wordCount: number;
  }[];
};

const adminPhotoSelect = {
  archivedAt: true,
  createdAt: true,
  id: true,
  mediaAsset: {
    select: {
      height: true,
      originalKey: true,
      width: true,
    },
  },
  slug: true,
  tags: {
    select: {
      tag: {
        select: {
          field: true,
          label: true,
          slug: true,
          value: true,
        },
      },
    },
    orderBy: {
      tag: {
        label: 'asc',
      },
    },
  },
  title: true,
  updatedAt: true,
} satisfies Prisma.PhotoSelect;

const adminNoteSelect = {
  abstract: true,
  archivedAt: true,
  categories: {
    select: {
      name: true,
      slug: true,
    },
  },
  coverMedia: {
    select: {
      originalKey: true,
    },
  },
  createdAt: true,
  id: true,
  published: true,
  publishedAt: true,
  readingTime: true,
  seoTitle: true,
  slug: true,
  title: true,
  updatedAt: true,
  wordCount: true,
} satisfies Prisma.NoteSelect;

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  scheduleStorageDeletionDrain();
  const [
    photos,
    notes,
    auditLogs,
    pendingDeletionJobs,
    processingDeletionJobs,
    failedDeletionJobs,
    recentFailures,
  ] = await Promise.all([
    prisma.photo.findMany({
      select: adminPhotoSelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 200,
    }),
    prisma.note.findMany({
      select: adminNoteSelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 100,
    }),
    prisma.adminAuditLog.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 80,
    }),
    prisma.storageDeletionJob.count({
      where: {
        status: StorageDeletionStatus.PENDING,
      },
    }),
    prisma.storageDeletionJob.count({
      where: {
        status: StorageDeletionStatus.PROCESSING,
      },
    }),
    prisma.storageDeletionJob.count({
      where: {
        status: StorageDeletionStatus.FAILED,
      },
    }),
    prisma.storageDeletionJob.findMany({
      where: {
        status: StorageDeletionStatus.FAILED,
        lastError: {
          not: null,
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        attempts: true,
        id: true,
        lastError: true,
        nextAttemptAt: true,
        reason: true,
        updatedAt: true,
      },
      take: 5,
    }),
  ]);
  const photoRows = photos as unknown as PhotoGetPayload<{
    select: typeof adminPhotoSelect;
  }>[];
  const noteRows = notes as unknown as NoteGetPayload<{
    select: typeof adminNoteSelect;
  }>[];
  return {
    auditLogs: auditLogs.map((log) => ({
      action: log.action,
      createdAt: log.createdAt.toISOString(),
      githubId: log.githubId,
      id: log.id,
      success: log.success,
      summary: log.summary,
      targetId: log.targetId,
      targetType: log.targetType,
    })),
    deletionJobs: {
      counts: {
        failed: failedDeletionJobs,
        pending: pendingDeletionJobs,
        processing: processingDeletionJobs,
      },
      recentFailures: recentFailures.map((job) => ({
        attempts: job.attempts,
        id: job.id,
        lastError: job.lastError ?? 'Storage deletion failed.',
        nextAttemptAt: job.nextAttemptAt.toISOString(),
        reason: job.reason,
        updatedAt: job.updatedAt.toISOString(),
      })),
    },
    photos: photoRows.map((photo) => ({
      archivedAt: photo.archivedAt?.toISOString() ?? null,
      createdAt: photo.createdAt.toISOString(),
      height: photo.mediaAsset.height,
      id: photo.id,
      originalKey: photo.mediaAsset.originalKey,
      slug: photo.slug,
      tags: photo.tags.map(({ tag }) => ({
        field: tag.field,
        label: tag.label,
        slug: tag.slug,
        value: tag.value,
      })),
      thumbnailUrl: getMediaImageURL({
        key: photo.mediaAsset.originalKey,
        width: MEDIA_VARIANT_WIDTHS.card,
      }),
      title: photo.title,
      updatedAt: photo.updatedAt.toISOString(),
      width: photo.mediaAsset.width,
    })),
    notes: noteRows.map((note) => ({
      abstract: note.abstract,
      archivedAt: note.archivedAt?.toISOString() ?? null,
      categories: note.categories,
      coverUrl: getMediaImageURL({
        key: note.coverMedia.originalKey,
        width: MEDIA_VARIANT_WIDTHS.card,
      }),
      createdAt: note.createdAt.toISOString(),
      id: note.id,
      published: note.published,
      publishedAt: note.publishedAt.toISOString(),
      readingTime: note.readingTime,
      seoTitle: note.seoTitle,
      slug: note.slug,
      title: note.title,
      updatedAt: note.updatedAt.toISOString(),
      wordCount: note.wordCount,
    })),
  };
}
