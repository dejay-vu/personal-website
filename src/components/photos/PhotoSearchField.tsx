'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { VENUES } from '@/config/venues';
import { SearchField } from '@heroui/react';

export function PhotoSearchField() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const queryKey = useMemo(() => searchParams.toString(), [searchParams]);
  const currentQuery = searchParams.get('q') ?? '';
  const [value, setValue] = useState(currentQuery);

  useEffect(() => {
    let isMounted = true;

    queueMicrotask(() => {
      if (isMounted) {
        setValue(currentQuery);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [currentQuery]);

  useEffect(() => {
    if (value.trim() === currentQuery) return;

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(queryKey);
      const nextValue = value.trim();

      params.delete('cursor');

      if (nextValue) {
        params.set('q', nextValue);
      } else {
        params.delete('q');
      }

      const queryString = params.toString();

      // Stay on the current page (home embeds the photo feed too) — the
      // endless grid reads ?q from the URL wherever it's mounted.
      startTransition(() => {
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
          scroll: false,
        });
      });
    }, 260);

    return () => window.clearTimeout(timeout);
  }, [currentQuery, pathname, queryKey, router, value]);

  return (
    <SearchField
      aria-label={`Search ${VENUES.photos.label}`}
      value={value}
      onChange={setValue}
      className="w-fit max-w-full"
    >
      <SearchField.Group
        data-pending={isPending || undefined}
        className="neon-search-group group px-3.5 font-mono text-sm text-(--neon-ink) outline-none"
      >
        <SearchField.SearchIcon className="size-4 text-(--beam)/70 transition-colors duration-200 group-focus-within:text-(--beam) group-hover:text-(--beam)" />
        <SearchField.Input
          className="w-[min(280px,calc(100vw-8rem))] bg-transparent font-mono text-sm outline-none placeholder:text-xs placeholder:uppercase placeholder:tracking-[0.14em] placeholder:text-(--neon-dim)"
          placeholder="Search..."
        />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
}
