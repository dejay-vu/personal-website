import type { KeysetCursor } from '@/lib/keysetCursor';
import { toSlug } from '@/lib/slug';

import { NOTES_PAGE_SIZE } from './types';

export const NOTES_MAX_PAGE_SIZE = 24;

export type GetPublishedNotesPageInput = {
  categories?: string[];
  cursor?: KeysetCursor | null;
  limit?: number;
};

export type CanonicalNotesPageInput = {
  categories: string[];
  cursor: KeysetCursor | null;
  limit: number;
};

function normalizeLimit(limit = NOTES_PAGE_SIZE) {
  if (!Number.isFinite(limit)) {
    return NOTES_PAGE_SIZE;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), NOTES_MAX_PAGE_SIZE);
}

export function normalizeNoteCategories(categories: string[] = []) {
  return [...new Set(categories.map((category) => toSlug(category)))]
    .filter(Boolean)
    .sort();
}

export function normalizeNotesPageInput(
  input: GetPublishedNotesPageInput = {},
): CanonicalNotesPageInput {
  return {
    categories: normalizeNoteCategories(input.categories),
    cursor: input.cursor ?? null,
    limit: normalizeLimit(input.limit),
  };
}

export function isCacheableNotesPageInput(input: CanonicalNotesPageInput) {
  return input.cursor === null && input.categories.length === 0;
}
