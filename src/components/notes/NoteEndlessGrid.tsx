'use client';

import { useEffect, useMemo } from 'react';

import { VENUES } from '@/config/venues';
import type { NoteListItem, NotesPage } from '@/modules/notes/types';

import { useQueryString, useResetScrollOnReload } from '@/utils/hooks';

import {
  type CursorFeedSource,
  useCursorFeed,
} from '@/components/feeds/useCursorFeed';

import { ActiveCategoryFilters, NoteCardGrid } from './';

const DEFAULT_NOTES_PER_BATCH = 6;
const NOTE_LOOKAHEAD = '240px 0px';
const getNoteId = (note: NoteListItem) => note.id;

function buildNotesPageURL({
  categories,
  cursor,
  limit,
}: {
  categories: string[];
  cursor?: string | null;
  limit: number;
}) {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (cursor) params.set('cursor', cursor);
  categories.forEach((category) => params.append('category', category));

  return `/api/notes?${params.toString()}`;
}

function RetryFeed({ retry }: { retry: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Retry loading ${VENUES.notes.label}`}
      className="ml-2 cursor-pointer font-mono text-xs font-semibold underline decoration-(--beam)/70 underline-offset-4 outline-(--cyan) focus-visible:outline-2"
      onClick={retry}
    >
      RETRY
    </button>
  );
}

export default function NoteEndlessGrid({
  initialPage,
  notesPerBatch = DEFAULT_NOTES_PER_BATCH,
}: {
  initialPage: NotesPage;
  notesPerBatch?: number;
}) {
  const getAllQueryString = useQueryString('getAll');
  const categoryQueries = useMemo(
    () => getAllQueryString('category'),
    [getAllQueryString],
  );
  const categories = useMemo(
    () =>
      [...new Set(categoryQueries.map((value) => value.trim()))]
        .filter(Boolean)
        .sort(),
    [categoryQueries],
  );
  const isDefaultQuery = categories.length === 0;
  const initialFingerprint = useMemo(
    () =>
      [
        initialPage.nextCursor ?? 'end',
        ...initialPage.notes.map((note) => note.id),
      ].join('|'),
    [initialPage.nextCursor, initialPage.notes],
  );
  const categoryKey = categories.join('|');
  const source = useMemo<CursorFeedSource<NoteListItem>>(
    () => ({
      key: isDefaultQuery
        ? `notes:default:${initialFingerprint}`
        : `notes:categories:${categoryKey}`,
      ...(isDefaultQuery
        ? {
            initialPage: {
              items: initialPage.notes,
              nextCursor: initialPage.nextCursor,
            },
          }
        : {}),
      async loadPage(cursor, signal) {
        const response = await fetch(
          buildNotesPageURL({
            categories,
            cursor,
            limit: notesPerBatch,
          }),
          { signal },
        );
        if (!response.ok) {
          throw new Error(
            `Failed to load ${VENUES.notes.label}: ${response.status}`,
          );
        }
        const page = (await response.json()) as NotesPage;
        return { items: page.notes, nextCursor: page.nextCursor };
      },
    }),
    [
      categories,
      categoryKey,
      initialFingerprint,
      initialPage.nextCursor,
      initialPage.notes,
      isDefaultQuery,
      notesPerBatch,
    ],
  );
  const {
    error,
    isExhausted,
    isLoading,
    items: notes,
    retry,
    sentinelRef,
  } = useCursorFeed({
    getId: getNoteId,
    rootMargin: NOTE_LOOKAHEAD,
    source,
  });

  useResetScrollOnReload();
  useEffect(() => {
    if (error) console.error(error.cause);
  }, [error]);

  const errorCopy = error
    ? error.phase === 'initial'
      ? `Unable to load ${VENUES.notes.label}.`
      : `Unable to load more ${VENUES.notes.label}.`
    : null;

  return (
    <section className="space-y-8" aria-label={`${VENUES.notes.label} list`}>
      <ActiveCategoryFilters />

      {notes.length === 0 ? (
        <div className="neon-empty flex min-h-64 items-center justify-center px-6">
          <p role="status">
            {errorCopy ? (
              <>
                {errorCopy}
                <RetryFeed retry={retry} />
              </>
            ) : isLoading ? (
              `LOADING ${VENUES.notes.label.toUpperCase()}`
            ) : (
              <>
                <span className="neon-empty__sig">NO SIGNAL // </span>
                no {VENUES.notes.label.toLowerCase()} match the selected
                categories
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          <NoteCardGrid notes={notes} />

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
                  LOADING MORE {VENUES.notes.label.toUpperCase()}
                </>
              ) : (
                `MORE ${VENUES.notes.label.toUpperCase()} AVAILABLE · ${notes.length} LOADED`
              )
            ) : (
              <span className="neon-feed-endsign">
                — END OF {VENUES.notes.label.toUpperCase()} · {notes.length} —
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
