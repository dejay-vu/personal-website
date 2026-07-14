import { unstable_cache } from 'next/cache';

import { encodeKeysetCursor } from '@/lib/keysetCursor';
import prisma, { Prisma } from '@/lib/prisma';
import { toSlug } from '@/lib/slug';

import {
  type CanonicalPhotosPageInput,
  type GetPhotosPageInput,
  isCacheablePhotosPageInput,
  normalizePhotoFilterEntries,
  normalizePhotosPageInput,
} from './pageInput';
import type { PhotoSearchFilters } from './query';
import {
  type PhotoDetail,
  type PhotosPage,
  photoDetailSelect,
  photoListSelect,
} from './types';

export {
  type GetPhotosPageInput,
  PHOTOS_MAX_PAGE_SIZE,
  PHOTOS_PAGE_SIZE,
  normalizePhotosPageInput,
} from './pageInput';
const PHOTOS_CACHE_VERSION = 'v4';

const photoOrderBy = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.PhotoOrderByWithRelationInput[];

export type PhotoSitemapEntries = {
  photos: {
    mediaAsset: {
      originalKey: string;
    };
    slug: string;
    updatedAt: Date;
  }[];
};

function getTextSearchWhere(q?: string): Prisma.PhotoWhereInput | null {
  const query = q?.trim();

  if (!query) return null;

  return {
    OR: [
      {
        title: {
          contains: query,
          mode: 'insensitive',
        },
      },
      {
        slug: {
          contains: toSlug(query) || query,
          mode: 'insensitive',
        },
      },
      {
        make: {
          contains: query,
          mode: 'insensitive',
        },
      },
      {
        model: {
          contains: query,
          mode: 'insensitive',
        },
      },
      {
        lensModel: {
          contains: query,
          mode: 'insensitive',
        },
      },
      {
        iso: {
          contains: query,
          mode: 'insensitive',
        },
      },
      {
        fNumber: {
          contains: query,
          mode: 'insensitive',
        },
      },
      {
        exposureTime: {
          contains: query,
          mode: 'insensitive',
        },
      },
      {
        focalLength: {
          contains: query,
          mode: 'insensitive',
        },
      },
      {
        tags: {
          some: {
            tag: {
              OR: [
                {
                  label: {
                    contains: query,
                    mode: 'insensitive',
                  },
                },
                {
                  value: {
                    contains: query,
                    mode: 'insensitive',
                  },
                },
                {
                  slug: {
                    contains: toSlug(query) || query,
                    mode: 'insensitive',
                  },
                },
              ],
            },
          },
        },
      },
    ],
  };
}

function getFilterWhere(filters?: PhotoSearchFilters) {
  const entries = normalizePhotoFilterEntries(filters);

  if (entries.length === 0) return [];

  return entries.map(({ field, slugs }) => {
    if (field === 'tag') {
      return {
        tags: {
          some: {
            tag: {
              slug: {
                in: slugs,
              },
            },
          },
        },
      } satisfies Prisma.PhotoWhereInput;
    }

    return {
      tags: {
        some: {
          tag: {
            field,
            slug: {
              in: slugs,
            },
          },
        },
      },
    } satisfies Prisma.PhotoWhereInput;
  });
}

function getPhotoWhere({
  cursor,
  filters,
  q,
}: {
  cursor?: CanonicalPhotosPageInput['cursor'];
  filters?: PhotoSearchFilters;
  q?: string;
}) {
  const and: Prisma.PhotoWhereInput[] = [{ archivedAt: null }];
  const textWhere = getTextSearchWhere(q);

  if (textWhere) and.push(textWhere);
  and.push(...getFilterWhere(filters));
  if (cursor) {
    const createdAt = new Date(cursor.timestamp);

    and.push({
      OR: [
        { createdAt: { lt: createdAt } },
        {
          createdAt,
          id: { lt: cursor.id },
        },
      ],
    });
  }

  return {
    AND: and,
  } satisfies Prisma.PhotoWhereInput;
}

async function findPhotosPage({
  cursor,
  filters,
  limit,
  q,
}: CanonicalPhotosPageInput): Promise<PhotosPage> {
  const pageSize = limit;
  const photos = await prisma.photo.findMany({
    where: getPhotoWhere({ cursor, filters, q: q ?? undefined }),
    select: photoListSelect,
    orderBy: photoOrderBy,
    take: pageSize + 1,
  });

  const hasNextPage = photos.length > pageSize;
  const pagePhotos = hasNextPage ? photos.slice(0, pageSize) : photos;

  return {
    nextCursor: hasNextPage
      ? (() => {
          const lastPhoto = pagePhotos.at(-1);

          return lastPhoto
            ? encodeKeysetCursor('photos', {
                id: lastPhoto.id,
                timestamp: lastPhoto.createdAt.toISOString(),
              })
            : null;
        })()
      : null,
    photos: pagePhotos,
  };
}

async function findPhotoBySlug(slug: string): Promise<PhotoDetail | null> {
  const photo = await prisma.photo.findUnique({
    where: {
      slug,
    },
    select: photoDetailSelect,
  });

  if (photo?.archivedAt) return null;

  return photo;
}

export async function publicPhotoExists(slug: string) {
  return Boolean(
    await prisma.photo.findFirst({
      where: {
        archivedAt: null,
        slug,
      },
      select: {
        id: true,
      },
    }),
  );
}

async function findPhotoSitemapEntries(): Promise<PhotoSitemapEntries> {
  const photos = await prisma.photo.findMany({
    where: {
      archivedAt: null,
    },
    select: {
      mediaAsset: {
        select: {
          originalKey: true,
        },
      },
      slug: true,
      updatedAt: true,
    },
    orderBy: photoOrderBy,
  });

  return {
    photos,
  };
}

async function countPhotos() {
  return prisma.photo.count({
    where: {
      archivedAt: null,
    },
  });
}

const getCachedPhotosPage = unstable_cache(
  findPhotosPage,
  ['photos', `${PHOTOS_CACHE_VERSION}-keyset`, 'photos-page'],
  {
    tags: ['photos'],
  },
);

export const getPhotosPage = (input: GetPhotosPageInput = {}) => {
  const normalized = normalizePhotosPageInput(input);

  return process.env.NODE_ENV === 'test' ||
    !isCacheablePhotosPageInput(normalized)
    ? findPhotosPage(normalized)
    : getCachedPhotosPage(normalized);
};

export const getPhotosCount = unstable_cache(
  countPhotos,
  ['photos', PHOTOS_CACHE_VERSION, 'photos-count'],
  {
    tags: ['photos'],
  },
);

export const getPhotoBySlug = unstable_cache(
  findPhotoBySlug,
  ['photos', PHOTOS_CACHE_VERSION, 'photo-by-slug'],
  {
    tags: ['photos'],
  },
);

export const getPhotoSitemapEntries = unstable_cache(
  findPhotoSitemapEntries,
  ['photos', PHOTOS_CACHE_VERSION, 'sitemap-entries'],
  {
    tags: ['photos'],
  },
);
