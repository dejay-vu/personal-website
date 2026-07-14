import type { PhotoListItem } from '@/modules/photos/types';

export {
  getPhotoAltText,
  getPhotoDisplayTitle,
  getPhotoSeoPresentation,
} from '@/modules/photos/presentation';

// One-line EXIF readout. `compact` folds make+model into one token and drops
// the lens for grid-card overlays; the full form belongs to the detail page.
export function getPhotoExifSummary(
  photo: PhotoListItem,
  { compact = false }: { compact?: boolean } = {},
) {
  const values = compact
    ? [
        [photo.make, photo.model].filter(Boolean).join(' '),
        photo.fNumber,
        photo.exposureTime,
        photo.iso,
      ]
    : [
        photo.make,
        photo.model,
        photo.lensModel,
        photo.exposureTime,
        photo.fNumber,
        photo.iso,
      ];

  return values.filter(Boolean).join(' · ');
}
