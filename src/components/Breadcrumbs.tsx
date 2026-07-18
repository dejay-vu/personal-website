import type { BreadcrumbItem } from '@/lib/seo';

import { RouteLink } from '@/components/ui/RouteLink';

export function Breadcrumbs({ items }: { items: readonly BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mx-auto mb-6 w-full max-w-3xl font-mono text-[11px] uppercase tracking-[0.14em] text-(--neon-dim)"
      data-breadcrumbs
    >
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => {
          const current = index === items.length - 1;

          return (
            <li key={item.href} className="flex min-w-0 items-center gap-2">
              {index > 0 ? (
                <span aria-hidden="true" className="text-(--beam)/60">
                  /
                </span>
              ) : null}
              {current ? (
                <span
                  aria-current="page"
                  className="max-w-[42ch] truncate text-foreground/75"
                >
                  {item.label}
                </span>
              ) : (
                <RouteLink
                  href={item.href}
                  progressLabel={`Loading ${item.label}`}
                  className="transition-colors hover:text-(--neon-ink) focus-visible:text-(--neon-ink) focus-visible:outline-none"
                >
                  {item.label}
                </RouteLink>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
