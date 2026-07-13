'use client';

import { usePathname, useRouter } from 'next/navigation';

import { APP_ROUTES, VENUES } from '@/config/venues';
import { Button } from '@heroui/react';

import { useQueryString } from '@/utils/hooks';

export function NoteCategories({
  categories,
}: {
  categories: { name: string; slug: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const getAllQueryString = useQueryString('getAll');
  const appendQueryString = useQueryString('append');
  const removeQueryString = useQueryString('remove');

  const categoryQueries = getAllQueryString('category');

  const toggleCategory = (category: string) => {
    // The home page only shows a curated preview — there is nothing to
    // filter in place, so jump to the full Field Notes page with the filter.
    if (pathname === APP_ROUTES.home) {
      router.push(
        `${VENUES.notes.path}?category=${encodeURIComponent(category)}`,
      );
      return;
    }

    const isActive = categoryQueries.includes(category);
    const queryString = isActive
      ? removeQueryString('category', category)
      : appendQueryString('category', category);

    router.push(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((category, index) => {
        const isActive = categoryQueries.includes(category.slug);

        return (
          // Chips render inside the card's <Link>. The chip button stops the
          // click's (synthetic) propagation, so next/link never sees it to
          // preventDefault — without this capture-phase cancel, the browser's
          // NATIVE anchor navigation opens the article on top of the filter
          // toggle. (Press handling fires on pointerup, so it's unaffected.)
          <div
            key={index}
            className="grow-0 shrink-0"
            onClickCapture={(event) => event.preventDefault()}
          >
            <Button
              aria-label={category.name}
              aria-pressed={isActive}
              size="sm"
              variant="tertiary"
              onPress={() => toggleCategory(category.slug)}
              data-active={isActive || undefined}
              className="neon-ticket h-8 max-w-fit min-w-min px-3"
            >
              {'#' + category.name}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
