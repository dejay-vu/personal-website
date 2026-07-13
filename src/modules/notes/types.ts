import type { CategoryModel, MediaAssetModel } from '@/generated/prisma/models';
import { z } from 'zod';

export const NOTES_PAGE_SIZE = 6;
export const NOTES_CACHE_TAG = 'notes';
export const markdownContentSchema = z
  .string()
  .refine(
    (content) => content.trim().length > 0,
    'Markdown content is required.',
  );

export type NoteMetadata = {
  title: string;
  seoTitle?: string;
  abstract: string;
  date: string;
  categories: string;
};

export type NoteListItem = {
  id: string;
  slug: string;
  coverMediaId: string;
  title: string;
  seoTitle: string | null;
  abstract: string;
  publishedAt: Date;
  wordCount: number;
  readingTime: number;
  published: boolean;
  archivedAt: Date | null;
  archivedByGithubId: string | null;
  createdAt: Date;
  updatedAt: Date;
  coverMedia: MediaAssetModel;
  categories: Pick<CategoryModel, 'name' | 'slug'>[];
};

export type NoteDetail = NoteListItem & {
  content: string;
};

export type NotesPage = {
  notes: NoteListItem[];
  nextCursor: string | null;
};
