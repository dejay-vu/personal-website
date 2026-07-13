'use client';

import type { ComponentProps } from 'react';

import Link, { useLinkStatus } from 'next/link';

import { RouteProgress } from './RouteProgress';

function RouteLinkStatus({ label }: { label: string }) {
  const { pending } = useLinkStatus();

  return pending ? <RouteProgress label={label} /> : null;
}

export function RouteLink({
  children,
  progressLabel = 'Loading page',
  ...props
}: ComponentProps<typeof Link> & { progressLabel?: string }) {
  return (
    <Link {...props}>
      {children}
      <RouteLinkStatus label={progressLabel} />
    </Link>
  );
}
