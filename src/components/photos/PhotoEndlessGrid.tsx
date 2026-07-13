'use client';

import { useEffect, useMemo } from 'react';

import { useSearchParams } from 'next/navigation';

import { VENUES } from '@/config/venues';
import {
  type PhotoSearchFilters,
  getPhotoSearchStateFromParams,
} from '@/modules/photos/query';
import type { PhotoListItem, PhotosPage } from '@/modules/photos/types';

import { useResetScrollOnReload } from '@/utils/hooks';

import {
  type CursorFeedSource,
  useCursorFeed,
} from '@/components/feeds/useCursorFeed';

import { PhotoCardGrid } from './PhotoCardGrid';

const DEFAULT_PHOTOS_PER_BATCH = 36;
const PHOTO_LOOKAHEAD = '800px 0px';
const getPhotoId = (photo: PhotoListItem) => photo.id;

function buildPhotosPageURL({
  cursor,
  filters,
  limit,
  q,
}: {
  cursor?: string | null;
  filters: PhotoSearchFilters;
  limit: number;
  q?: string;
}) {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (cursor) params.set('cursor', cursor);
  if (q) params.set('q', q);
  for (const [field, values] of Object.entries(filters)) {
    values.forEach((value) => params.append(field, value));
  }

  return `/api/photos?${params.toString()}`;
}

function RetryFeed({ retry }: { retry: () => void }) {
  return (
    <button
      type="button"
      aria-label="Retry loading photos"
      className="ml-2 cursor-pointer font-mono text-xs font-semibold underline decoration-(--beam)/70 underline-offset-4 outline-(--cyan) focus-visible:outline-2"
      onClick={retry}
    >
      RETRY
    </button>
  );
}

export default function PhotoEndlessGrid({
  initialPage,
  photosPerBatch = DEFAULT_PHOTOS_PER_BATCH,
}: {
  initialPage: PhotosPage;
  photosPerBatch?: number;
}) {
  const searchParams = useSearchParams();
  const rawQueryKey = useMemo(() => searchParams.toString(), [searchParams]);
  const search = useMemo(
    () => getPhotoSearchStateFromParams(new URLSearchParams(rawQueryKey)),
    [rawQueryKey],
  );
  const q = search.q?.trim() || undefined;
  const filters = useMemo<PhotoSearchFilters>(
    () =>
      Object.fromEntries(
        Object.entries(search.filters)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([field, values]) => [
            field,
            [
              ...new Set(values.map((value) => value.trim()).filter(Boolean)),
            ].sort(),
          ]),
      ),
    [search.filters],
  );
  const filterKey = useMemo(
    () => JSON.stringify(Object.entries(filters)),
    [filters],
  );
  const isDefaultQuery = !q && Object.keys(filters).length === 0;
  const initialFingerprint = useMemo(
    () =>
      [
        initialPage.nextCursor ?? 'end',
        ...initialPage.photos.map((photo) => photo.id),
      ].join('|'),
    [initialPage.nextCursor, initialPage.photos],
  );
  const source = useMemo<CursorFeedSource<PhotoListItem>>(
    () => ({
      key: isDefaultQuery
        ? `photos:default:${initialFingerprint}`
        : `photos:search:${q ?? ''}:${filterKey}`,
      ...(isDefaultQuery
        ? {
            initialPage: {
              items: initialPage.photos,
              nextCursor: initialPage.nextCursor,
            },
          }
        : {}),
      async loadPage(cursor, signal) {
        const response = await fetch(
          buildPhotosPageURL({
            cursor,
            filters,
            limit: photosPerBatch,
            q,
          }),
          { signal },
        );
        if (!response.ok) {
          throw new Error(`Failed to load photos: ${response.status}`);
        }
        const page = (await response.json()) as PhotosPage;
        return { items: page.photos, nextCursor: page.nextCursor };
      },
    }),
    [
      filterKey,
      filters,
      initialFingerprint,
      initialPage.nextCursor,
      initialPage.photos,
      isDefaultQuery,
      photosPerBatch,
      q,
    ],
  );
  const {
    error,
    isExhausted,
    isLoading,
    items: photos,
    retry,
    sentinelRef,
  } = useCursorFeed({
    getId: getPhotoId,
    rootMargin: PHOTO_LOOKAHEAD,
    source,
  });

  useResetScrollOnReload();
  useEffect(() => {
    if (error) console.error(error.cause);
  }, [error]);

  const errorCopy = error
    ? error.phase === 'initial'
      ? `Unable to load ${VENUES.photos.label} photos.`
      : 'Unable to load more photos.'
    : null;

  if (photos.length === 0) {
    return (
      <div className="neon-empty flex min-h-64 items-center justify-center px-6">
        <p role="status">
          {errorCopy ? (
            <>
              {errorCopy}
              <RetryFeed retry={retry} />
            </>
          ) : isLoading ? (
            `LOADING ${VENUES.photos.label.toUpperCase()}`
          ) : (
            <>
              <span className="neon-empty__sig">NO SIGNAL // </span>
              no photos match this search
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-8" aria-label={`${VENUES.photos.label} photos`}>
      <PhotoCardGrid filters={filters} photos={photos} q={q} />

      <div
        ref={sentinelRef}
        className="neon-feed-status min-h-16 py-4"
        aria-live="polite"
      >
        {errorCopy ? (
          <>
            {errorCopy}
            <RetryFeed retry={retry} />
          </>
        ) : !isExhausted ? (
          isLoading ? (
            <>
              <span className="neon-feed-status__dots">
                <span />
                <span />
                <span />
              </span>
              LOADING MORE PHOTOS
            </>
          ) : (
            `MORE PHOTOS AVAILABLE · ${photos.length} LOADED`
          )
        ) : (
          <span className="neon-feed-endsign">
            — END OF {VENUES.photos.label.toUpperCase()} · {photos.length} —
          </span>
        )}
      </div>
    </section>
  );
}
