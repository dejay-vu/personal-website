import clsx from 'clsx';

import { RouteLink } from '@/components/ui/RouteLink';

export function AuthorByline({ className }: { className?: string }) {
  return (
    <p className={clsx(className)} data-author-byline data-byline>
      By{' '}
      <RouteLink
        href="/#about"
        rel="author"
        progressLabel="Loading author profile"
        className="text-(--neon-ink) underline decoration-(--beam)/50 underline-offset-4 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
      >
        Junhao Zhang (Jay)
      </RouteLink>
    </p>
  );
}
