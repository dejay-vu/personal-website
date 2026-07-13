import type { CSSProperties } from 'react';

import type { PhotoListItem } from '@/modules/photos/types';

import { getPhotoDisplayDimensions } from '../photoDimensions';

export function getPhotoModalFrameStyle(photo: PhotoListItem): CSSProperties {
  const { height, width } = getPhotoDisplayDimensions(photo);
  const aspectRatio = width / height;

  return {
    aspectRatio: `${width} / ${height}`,
    height: `min(90dvh, ${90 / aspectRatio}vw)`,
    width: `min(90vw, ${90 * aspectRatio}dvh)`,
  };
}
