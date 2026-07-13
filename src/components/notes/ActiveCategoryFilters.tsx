'use client';

import { usePathname, useRouter } from 'next/navigation';

import { useQueryString } from '@/utils/hooks';

// Active category filters as removable neon tickets. Rendered above the
// notes feed (home embed + /field-notes) so an applied filter is always
// visible and reversible — including when it matches zero notes.
export function ActiveCategoryFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const getAllQueryString = useQueryString('getAll');
  const removeQueryString = useQueryString('remove');
  const deleteQueryString = useQueryString('delete');

  const categories = [...new Set(getAllQueryString('category'))];

  if (categories.length === 0) return null;

  const navigate = (queryString: string) => {
    router.push(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  };

  return (
    <div className="neon-filter-row">
      <span className="neon-filter-row__label">FILTERS //</span>
      {categories.map((slug) => (
        <button
          key={slug}
          type="button"
          className="neon-ticket cursor-pointer px-2.5 py-1.5"
          data-active="true"
          aria-label={`Remove filter ${slug}`}
          onClick={() => navigate(removeQueryString('category', slug))}
        >
          #{slug} <span aria-hidden="true">×</span>
        </button>
      ))}
      {categories.length > 1 && (
        <button
          type="button"
          className="neon-filter-row__clear"
          onClick={() => navigate(deleteQueryString('category'))}
        >
          Clear all
        </button>
      )}
    </div>
  );
}
