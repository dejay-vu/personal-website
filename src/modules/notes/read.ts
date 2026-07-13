import { unstable_cache } from 'next/cache';

import { encodeKeysetCursor } from '@/lib/keysetCursor';
import prisma, { Prisma } from '@/lib/prisma';

import {
  type CanonicalNotesPageInput,
  type GetPublishedNotesPageInput,
  isCacheableNotesPageInput,
  normalizeNoteCategories,
  normalizeNotesPageInput,
} from './pageInput';
import {
  NOTES_CACHE_TAG,
  type NoteDetail,
  type NoteListItem,
  type NotesPage,
} from './types';

export {
  type GetPublishedNotesPageInput,
  NOTES_MAX_PAGE_SIZE,
  normalizeNotesPageInput,
} from './pageInput';
const NOTES_CACHE_VERSION = 'v4';

const noteListSelect = {
  abstract: true,
  archivedAt: true,
  archivedByGithubId: true,
  categories: {
    select: {
      name: true,
      slug: true,
    },
  },
  coverMedia: true,
  coverMediaId: true,
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

const noteDetailSelect = {
  ...noteListSelect,
  content: true,
} satisfies Prisma.NoteSelect;

const noteOrderBy = [
  { publishedAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.NoteOrderByWithRelationInput[];

function buildPublishedNotesWhere(
  categories: string[] = [],
  cursor?: CanonicalNotesPageInput['cursor'],
) {
  const selectedCategories = normalizeNoteCategories(categories);

  return {
    archivedAt: null,
    published: true,
    ...((selectedCategories.length > 0 || cursor) && {
      AND: [
        ...selectedCategories.map((category) => ({
          categories: {
            some: {
              slug: category,
            },
          },
        })),
        ...(cursor
          ? [
              {
                OR: [
                  { publishedAt: { lt: new Date(cursor.timestamp) } },
                  {
                    publishedAt: new Date(cursor.timestamp),
                    id: { lt: cursor.id },
                  },
                ],
              },
            ]
          : []),
      ],
    }),
  } satisfies Prisma.NoteWhereInput;
}

async function findPublishedNotesPage({
  categories = [],
  cursor,
  limit,
}: CanonicalNotesPageInput): Promise<NotesPage> {
  const pageSize = limit;
  const notes = await prisma.note.findMany({
    where: buildPublishedNotesWhere(categories, cursor),
    select: noteListSelect,
    orderBy: noteOrderBy,
    take: pageSize + 1,
  });

  const pageNotes = notes.slice(0, pageSize) as NoteListItem[];
  const hasNextPage = notes.length > pageSize;

  return {
    notes: pageNotes,
    nextCursor: hasNextPage
      ? (() => {
          const lastNote = pageNotes.at(-1);

          return lastNote
            ? encodeKeysetCursor('notes', {
                id: lastNote.id,
                timestamp: new Date(lastNote.publishedAt).toISOString(),
              })
            : null;
        })()
      : null,
  };
}

async function findPublishedNoteBySlug(slug: string) {
  const note = await prisma.note.findUnique({
    where: {
      slug,
    },
    select: noteDetailSelect,
  });

  if (!note?.published || note.archivedAt) {
    return null;
  }

  return note as NoteDetail;
}

export async function publishedNoteExists(slug: string) {
  return Boolean(
    await prisma.note.findFirst({
      where: {
        archivedAt: null,
        published: true,
        slug,
      },
      select: {
        id: true,
      },
    }),
  );
}

async function findPublishedNoteSlugs() {
  return prisma.note.findMany({
    where: {
      archivedAt: null,
      published: true,
    },
    select: {
      slug: true,
    },
    orderBy: noteOrderBy,
  });
}

async function findPublishedNoteSitemapEntries() {
  return prisma.note.findMany({
    where: {
      archivedAt: null,
      published: true,
    },
    select: {
      slug: true,
      publishedAt: true,
      updatedAt: true,
    },
    orderBy: noteOrderBy,
  });
}

async function countPublishedNotes() {
  return prisma.note.count({
    where: {
      archivedAt: null,
      published: true,
    },
  });
}

const getCachedPublishedNotesPage = unstable_cache(
  findPublishedNotesPage,
  ['notes', `${NOTES_CACHE_VERSION}-keyset`, 'published-notes-page'],
  {
    tags: [NOTES_CACHE_TAG],
  },
);

export const getPublishedNotesPage = (
  input: GetPublishedNotesPageInput = {},
) => {
  const normalized = normalizeNotesPageInput(input);

  return process.env.NODE_ENV === 'test' ||
    !isCacheableNotesPageInput(normalized)
    ? findPublishedNotesPage(normalized)
    : getCachedPublishedNotesPage(normalized);
};

export const getPublishedNotesCount = unstable_cache(
  countPublishedNotes,
  ['notes', NOTES_CACHE_VERSION, 'published-notes-count'],
  {
    tags: [NOTES_CACHE_TAG],
  },
);

const getCachedPublishedNoteBySlug = unstable_cache(
  findPublishedNoteBySlug,
  ['notes', NOTES_CACHE_VERSION, 'published-note-by-slug'],
  {
    tags: [NOTES_CACHE_TAG],
  },
);

export const getPublishedNoteBySlug = (...args: [slug: string]) =>
  process.env.NODE_ENV === 'test'
    ? findPublishedNoteBySlug(...args)
    : getCachedPublishedNoteBySlug(...args);

export const getPublishedNoteSlugs = unstable_cache(
  findPublishedNoteSlugs,
  ['notes', NOTES_CACHE_VERSION, 'published-note-slugs'],
  {
    tags: [NOTES_CACHE_TAG],
  },
);

export const getPublishedNoteSitemapEntries = unstable_cache(
  findPublishedNoteSitemapEntries,
  ['notes', NOTES_CACHE_VERSION, 'published-note-sitemap-entries'],
  {
    tags: [NOTES_CACHE_TAG],
  },
);
