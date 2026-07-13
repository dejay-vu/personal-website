'use client';

import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type CursorFeedSource<T> = {
  key: string;
  initialPage?: CursorPage<T>;
  loadPage(cursor: string | null, signal: AbortSignal): Promise<CursorPage<T>>;
};

export type CursorFeedError = {
  cause: unknown;
  phase: 'initial' | 'next';
};

export type CursorFeedResult<T> = {
  items: T[];
  isLoading: boolean;
  isExhausted: boolean;
  error: CursorFeedError | null;
  retry(): void;
  sentinelRef: RefObject<HTMLDivElement | null>;
};

type CursorFeedSnapshot<T> = Omit<
  CursorFeedResult<T>,
  'retry' | 'sentinelRef'
> & {
  sourceKey: string;
};

function uniqueItems<T>(items: T[], getId: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = getId(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function seedSnapshot<T>(
  source: CursorFeedSource<T>,
  getId: (item: T) => string,
): CursorFeedSnapshot<T> {
  const initialPage = source.initialPage;
  return {
    error: null,
    isExhausted: initialPage ? initialPage.nextCursor === null : false,
    isLoading: !initialPage,
    items: initialPage ? uniqueItems(initialPage.items, getId) : [],
    sourceKey: source.key,
  };
}

export function useCursorFeed<T>({
  getId,
  rootMargin,
  source,
}: {
  getId: (item: T) => string;
  rootMargin: string;
  source: CursorFeedSource<T>;
}): CursorFeedResult<T> {
  const initial = seedSnapshot(source, getId);
  const [snapshot, setSnapshot] = useState<CursorFeedSnapshot<T>>(initial);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);
  const sourceRef = useRef(source);
  const getIdRef = useRef(getId);
  const generationRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const itemsRef = useRef(initial.items);
  const cursorRef = useRef(source.initialPage?.nextCursor ?? null);
  const exhaustedRef = useRef(initial.isExhausted);
  const errorRef = useRef<CursorFeedError | null>(null);

  const publish = useCallback(() => {
    if (!mountedRef.current) return;
    setSnapshot({
      error: errorRef.current,
      isExhausted: exhaustedRef.current,
      isLoading: loadingRef.current,
      items: itemsRef.current,
      sourceKey: sourceRef.current.key,
    });
  }, []);

  const requestPage = useCallback(
    async (phase: CursorFeedError['phase'], generation: number) => {
      if (
        generation !== generationRef.current ||
        loadingRef.current ||
        exhaustedRef.current
      ) {
        return;
      }

      const activeSource = sourceRef.current;
      const cursor = cursorRef.current;
      const controller = new AbortController();
      requestRef.current = controller;
      loadingRef.current = true;
      errorRef.current = null;
      publish();

      try {
        const page = await activeSource.loadPage(cursor, controller.signal);
        if (
          controller.signal.aborted ||
          generation !== generationRef.current ||
          activeSource.key !== sourceRef.current.key
        ) {
          return;
        }

        const seen = new Set(itemsRef.current.map(getIdRef.current));
        const appended: T[] = [];
        for (const item of page.items) {
          const id = getIdRef.current(item);
          if (seen.has(id)) continue;
          seen.add(id);
          appended.push(item);
        }
        itemsRef.current = [...itemsRef.current, ...appended];
        cursorRef.current = page.nextCursor;
        exhaustedRef.current = page.nextCursor === null;
      } catch (cause) {
        if (controller.signal.aborted || generation !== generationRef.current) {
          return;
        }
        errorRef.current = { cause, phase };
      } finally {
        if (
          generation === generationRef.current &&
          requestRef.current === controller
        ) {
          requestRef.current = null;
          loadingRef.current = false;
          publish();
        }
      }
    },
    [publish],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const activeSource = source;
    sourceRef.current = activeSource;
    getIdRef.current = getId;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    requestRef.current?.abort();
    requestRef.current = null;
    loadingRef.current = false;
    errorRef.current = null;

    const seeded = seedSnapshot(activeSource, getIdRef.current);
    itemsRef.current = seeded.items;
    cursorRef.current = activeSource.initialPage?.nextCursor ?? null;
    exhaustedRef.current = seeded.isExhausted;

    queueMicrotask(() => {
      if (!mountedRef.current || generation !== generationRef.current) return;
      loadingRef.current = seeded.isLoading;
      publish();
      if (!activeSource.initialPage) {
        loadingRef.current = false;
        void requestPage('initial', generation);
      }
    });

    return () => {
      if (generation === generationRef.current) requestRef.current?.abort();
    };
  }, [getId, publish, requestPage, source]);

  const visibleSnapshot =
    snapshot.sourceKey === source.key ? snapshot : seedSnapshot(source, getId);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (
      !sentinel ||
      visibleSnapshot.error ||
      visibleSnapshot.isExhausted ||
      visibleSnapshot.isLoading
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void requestPage('next', generationRef.current);
        }
      },
      { rootMargin },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    requestPage,
    rootMargin,
    visibleSnapshot.error,
    visibleSnapshot.isExhausted,
    visibleSnapshot.isLoading,
    visibleSnapshot.sourceKey,
  ]);

  const retry = useCallback(() => {
    const phase = errorRef.current?.phase;
    if (phase) void requestPage(phase, generationRef.current);
  }, [requestPage]);

  return {
    error: visibleSnapshot.error,
    isExhausted: visibleSnapshot.isExhausted,
    isLoading: visibleSnapshot.isLoading,
    items: visibleSnapshot.items,
    retry,
    sentinelRef,
  };
}
