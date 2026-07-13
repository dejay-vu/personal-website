import { VENUES, photoPath } from '@/config/venues';

const CONTROL_QUERY_KEYS = new Set(['cursor', 'limit', 'photo', 'q']);

export type PhotoSearchFilters = Record<string, string[]>;

export function getPhotoSearchState(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const q = getFirstQueryValue(searchParams.q);
  const filters: PhotoSearchFilters = {};

  for (const [key, rawValue] of Object.entries(searchParams)) {
    const field = key.trim().toLowerCase();

    if (!field || CONTROL_QUERY_KEYS.has(field)) continue;

    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    const normalizedValues = values
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));

    if (normalizedValues.length > 0) {
      filters[field] = [...(filters[field] ?? []), ...normalizedValues];
    }
  }

  return {
    filters,
    q,
  };
}

export function getPhotoSearchStateFromParams(searchParams: URLSearchParams) {
  const queryEntries: Record<string, string | string[]> = {};

  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    queryEntries[key] = values.length > 1 ? values : (values[0] ?? '');
  }

  return getPhotoSearchState(queryEntries);
}

export function getFirstQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]?.trim() || undefined;

  return value?.trim() || undefined;
}

export function buildPhotoURL({
  filters,
  photoSlug,
  q,
}: {
  filters?: PhotoSearchFilters;
  photoSlug?: string;
  q?: string;
}) {
  const params = new URLSearchParams();

  if (q?.trim()) params.set('q', q.trim());

  for (const [field, values] of Object.entries(filters ?? {})) {
    for (const value of values) {
      if (value.trim()) params.append(field, value.trim());
    }
  }

  const queryString = params.toString();

  if (photoSlug) {
    const base = photoPath(photoSlug);
    return queryString ? `${base}?${queryString}` : base;
  }

  return queryString
    ? `${VENUES.photos.path}?${queryString}`
    : VENUES.photos.path;
}
