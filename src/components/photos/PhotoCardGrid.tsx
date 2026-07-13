import type { CSSProperties } from 'react';

import { type PhotoSearchFilters, buildPhotoURL } from '@/modules/photos/query';
import type { PhotoListItem } from '@/modules/photos/types';

import { PhotoCard } from './PhotoCard';
import { getPhotoDisplayDimensions } from './photoDimensions';

// Roughly the first viewport of tiles. Eager-loading the whole 36-photo
// batch makes every image compete with the LCP image for bandwidth.
const EAGER_PHOTO_COUNT = 9;
const PRIORITY_PHOTO_COUNT = 3;

// Justified rows: every photo carries its true aspect ratio as --ar and the
// CSS does the row math. Completed rows resolve to the same gallery edges;
// the final row stays at the target row height instead of enlarging a sparse
// set of photos to fill a wide viewport.
function getAspectRatio(photo: PhotoListItem) {
  const { width, height } = getPhotoDisplayDimensions(photo);

  return Math.round((width / height) * 10000) / 10000;
}

// Width ≈ rowHeight × ratio; row heights top out around --jg-base × 1.4.
function getSizes(ar: number) {
  if (ar < 1) return '(max-width: 640px) 48vw, (max-width: 1024px) 26vw, 20vw';

  return '(max-width: 640px) 92vw, (max-width: 1024px) 48vw, 36vw';
}

export function PhotoCardGrid({
  filters,
  photos,
  q,
}: {
  filters?: PhotoSearchFilters;
  photos: PhotoListItem[];
  q?: string;
}) {
  return (
    <div className="neon-justified">
      {photos.map((photo, index) => {
        const ar = getAspectRatio(photo);

        return (
          <PhotoCard
            key={photo.slug}
            href={buildPhotoURL({
              filters,
              photoSlug: photo.slug,
              q,
            })}
            eager={index < EAGER_PHOTO_COUNT}
            photo={photo}
            priority={index < PRIORITY_PHOTO_COUNT}
            sizes={getSizes(ar)}
            style={{ '--ar': ar } as CSSProperties}
          />
        );
      })}
    </div>
  );
}
