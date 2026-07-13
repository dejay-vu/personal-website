'use client';

import { useLayoutEffect } from 'react';

import type { PhotoListItem } from '@/modules/photos/types';

import { usePhotoModalCoordinator } from './PhotoModalCoordinator';

export default function PhotoModalPage({ photo }: { photo: PhotoListItem }) {
  const { routeReady } = usePhotoModalCoordinator();

  useLayoutEffect(() => {
    routeReady(photo);
  }, [photo, routeReady]);

  return null;
}
