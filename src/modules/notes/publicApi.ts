import { parseCursor, parsePageLimit } from '@/lib/publicApi';

import {
  type GetPublishedNotesPageInput,
  NOTES_MAX_PAGE_SIZE,
  normalizeNotesPageInput,
} from './pageInput';
import { NOTES_PAGE_SIZE } from './types';

const MAX_CATEGORIES = 12;
const MAX_CATEGORY_LENGTH = 80;

export function parseNotesPageSearchParams(searchParams: URLSearchParams) {
  const limitResult = parsePageLimit(searchParams.get('limit'), {
    defaultValue: NOTES_PAGE_SIZE,
    max: NOTES_MAX_PAGE_SIZE,
  });
  if (!limitResult.ok) {
    return { ok: false as const, error: 'Invalid limit.' };
  }

  const cursorResult = parseCursor(searchParams.get('cursor'), 'notes');
  if (!cursorResult.ok) {
    return { ok: false as const, error: 'Invalid cursor.' };
  }

  const categories = searchParams.getAll('category');
  if (
    categories.length > MAX_CATEGORIES ||
    categories.some(
      (category) =>
        category.trim().length === 0 ||
        category.trim().length > MAX_CATEGORY_LENGTH,
    )
  ) {
    return { ok: false as const, error: 'Invalid categories.' };
  }

  return {
    ok: true as const,
    input: normalizeNotesPageInput({
      categories,
      cursor: cursorResult.cursor,
      limit: limitResult.limit,
    } satisfies GetPublishedNotesPageInput),
  };
}
