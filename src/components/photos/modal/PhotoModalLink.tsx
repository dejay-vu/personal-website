'use client';

import { type RefObject, useEffect, useRef } from 'react';

import Link, { useLinkStatus } from 'next/link';

import { photoPath } from '@/config/venues';
import type { PhotoListItem } from '@/modules/photos/types';

import { usePhotoModalCoordinator } from './PhotoModalCoordinator';

function PhotoModalNavigationStatus({
  epochRef,
  targetPath,
}: {
  epochRef: RefObject<number | null>;
  targetPath: string;
}) {
  const { pending } = useLinkStatus();
  const { navigationSettled } = usePhotoModalCoordinator();
  const sawPendingRef = useRef(false);

  useEffect(() => {
    if (pending) {
      sawPendingRef.current = true;
      return;
    }

    if (!sawPendingRef.current) return;
    sawPendingRef.current = false;
    const epoch = epochRef.current;
    epochRef.current = null;
    if (epoch !== null) navigationSettled(targetPath, epoch);
  }, [epochRef, navigationSettled, pending, targetPath]);

  return null;
}

export function PhotoModalLink({
  ariaLabel,
  children,
  className,
  href,
  photo,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  className: string;
  href: string;
  photo: PhotoListItem;
}) {
  const { begin } = usePhotoModalCoordinator();
  const navigationEpochRef = useRef<number | null>(null);
  const targetPath = photoPath(photo.slug);

  return (
    <Link
      href={href}
      scroll={false}
      aria-label={ariaLabel}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        navigationEpochRef.current = begin(photo, href);
      }}
      className={className}
    >
      {children}
      <PhotoModalNavigationStatus
        epochRef={navigationEpochRef}
        targetPath={targetPath}
      />
    </Link>
  );
}
