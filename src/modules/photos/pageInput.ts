import type { KeysetCursor } from '@/lib/keysetCursor';
import { toSlug } from '@/lib/slug';

import type { PhotoSearchFilters } from './query';

export const PHOTOS_PAGE_SIZE = 36;
export const PHOTOS_MAX_PAGE_SIZE = 36;

export type GetPhotosPageInput = {
  cursor?: KeysetCursor | null;
  filters?: PhotoSearchFilters;
  limit?: number;
  q?: string | null;
};

export type CanonicalPhotosPageInput = {
  cursor: KeysetCursor | null;
  filters: PhotoSearchFilters;
  limit: number;
  q: string | null;
};

function normalizePageSize(limit?: number) {
  if (!limit || !Number.isFinite(limit)) return PHOTOS_PAGE_SIZE;

  return Math.min(Math.max(Math.trunc(limit), 1), PHOTOS_MAX_PAGE_SIZE);
}

export function normalizePhotoFilterEntries(filters: PhotoSearchFilters = {}) {
  const valuesByField = new Map<string, Set<string>>();

  for (const [rawField, values] of Object.entries(filters)) {
    const field = rawField.trim().toLowerCase();
    if (!field) continue;

    const slugs = values.map((value) => toSlug(value)).filter(Boolean);
    if (slugs.length === 0) continue;

    const merged = valuesByField.get(field) ?? new Set<string>();
    slugs.forEach((slug) => merged.add(slug));
    valuesByField.set(field, merged);
  }

  return [...valuesByField.entries()]
    .map(([field, slugs]) => ({ field, slugs: [...slugs].sort() }))
    .sort((left, right) => left.field.localeCompare(right.field));
}

export function isCacheablePhotosPageInput(input: CanonicalPhotosPageInput) {
  return (
    input.cursor === null &&
    input.q === null &&
    Object.keys(input.filters).length === 0
  );
}

export function normalizePhotosPageInput(
  input: GetPhotosPageInput = {},
): CanonicalPhotosPageInput {
  return {
    cursor: input.cursor ?? null,
    filters: Object.fromEntries(
      normalizePhotoFilterEntries(input.filters).map(({ field, slugs }) => [
        field,
        slugs,
      ]),
    ),
    limit: normalizePageSize(input.limit),
    q: input.q?.trim() || null,
  };
}
