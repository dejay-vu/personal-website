import type { Prisma } from '@/generated/prisma/client';
import type { PhotoGetPayload } from '@/generated/prisma/models';

export const photoListSelect = {
  createdAt: true,
  id: true,
  slug: true,
  title: true,
  orientation: true,
  width: true,
  height: true,
  make: true,
  model: true,
  lensModel: true,
  exposureTime: true,
  fNumber: true,
  iso: true,
  mediaAsset: {
    select: {
      blurDataURL: true,
      height: true,
      originalKey: true,
      width: true,
    },
  },
} satisfies Prisma.PhotoSelect;

export const photoDetailSelect = {
  ...photoListSelect,
  archivedAt: true,
  capturedAt: true,
  createdAt: true,
  dateTimeOriginal: true,
  updatedAt: true,
  tags: {
    include: {
      tag: true,
    },
    orderBy: {
      tag: {
        label: 'asc',
      },
    },
  },
} satisfies Prisma.PhotoSelect;

export type PhotoListItem = PhotoGetPayload<{
  select: typeof photoListSelect;
}>;

export type PhotoDetail = PhotoGetPayload<{
  select: typeof photoDetailSelect;
}>;

export type PhotosPage = {
  nextCursor: string | null;
  photos: PhotoListItem[];
};

type PhotoModel = PhotoGetPayload<Record<string, never>>;

export type PhotoExif = Pick<
  PhotoModel,
  | 'fileType'
  | 'make'
  | 'model'
  | 'orientation'
  | 'height'
  | 'width'
  | 'brightness'
  | 'exposureBias'
  | 'exposureTime'
  | 'exposureMode'
  | 'exposureProgram'
  | 'fNumber'
  | 'focalLength'
  | 'focalLengthIn35mmFilm'
  | 'iso'
  | 'lensMake'
  | 'lensModel'
  | 'capturedAt'
  | 'dateTimeOriginal'
>;
