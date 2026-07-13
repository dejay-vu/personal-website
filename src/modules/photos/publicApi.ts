import { parseCursor, parsePageLimit } from '@/lib/publicApi';

import {
  type GetPhotosPageInput,
  PHOTOS_MAX_PAGE_SIZE,
  PHOTOS_PAGE_SIZE,
  normalizePhotosPageInput,
} from './pageInput';
import { getPhotoSearchStateFromParams } from './query';

const CONTROL_QUERY_KEYS = new Set(['cursor', 'limit', 'photo', 'q']);
const FILTER_FIELD_PATTERN = /^[a-z0-9_-]{1,40}$/;
const MAX_FILTER_FIELDS = 12;
const MAX_FILTER_VALUES = 60;
const MAX_FILTER_VALUE_LENGTH = 120;
const MAX_QUERY_LENGTH = 160;

export function parsePhotosPageSearchParams(searchParams: URLSearchParams) {
  const limitResult = parsePageLimit(searchParams.get('limit'), {
    defaultValue: PHOTOS_PAGE_SIZE,
    max: PHOTOS_MAX_PAGE_SIZE,
  });
  if (!limitResult.ok) {
    return { ok: false as const, error: 'Invalid limit.' };
  }

  const cursorResult = parseCursor(searchParams.get('cursor'), 'photos');
  if (!cursorResult.ok) {
    return { ok: false as const, error: 'Invalid cursor.' };
  }

  const qValues = searchParams.getAll('q');
  if (
    qValues.length > 1 ||
    (qValues[0]?.trim().length ?? 0) > MAX_QUERY_LENGTH
  ) {
    return { ok: false as const, error: 'Invalid search query.' };
  }

  const filterFields = [...new Set(searchParams.keys())].filter(
    (key) => !CONTROL_QUERY_KEYS.has(key.trim().toLowerCase()),
  );
  if (
    filterFields.length > MAX_FILTER_FIELDS ||
    filterFields.some(
      (field) => !FILTER_FIELD_PATTERN.test(field.trim().toLowerCase()),
    )
  ) {
    return { ok: false as const, error: 'Invalid photo filters.' };
  }

  const filterValues = filterFields.flatMap((field) =>
    searchParams.getAll(field),
  );
  if (
    filterValues.length > MAX_FILTER_VALUES ||
    filterValues.some(
      (value) =>
        value.trim().length === 0 ||
        value.trim().length > MAX_FILTER_VALUE_LENGTH,
    )
  ) {
    return { ok: false as const, error: 'Invalid photo filters.' };
  }

  const { filters, q } = getPhotoSearchStateFromParams(searchParams);
  const input: GetPhotosPageInput = {
    cursor: cursorResult.cursor,
    filters,
    limit: limitResult.limit,
    q,
  };

  return {
    ok: true as const,
    input: normalizePhotosPageInput(input),
  };
}
