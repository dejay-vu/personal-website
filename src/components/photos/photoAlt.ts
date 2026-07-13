import type { PhotoListItem } from '@/modules/photos/types';

// Photos default to the literal title "untitled" in the DB; treat that
// placeholder as "no title".
export function getPhotoDisplayTitle(photo: PhotoListItem) {
  return photo.title && photo.title !== 'untitled' ? photo.title : null;
}

// Screen readers should get a description, not the "untitled" placeholder.
export function getPhotoAltText(photo: PhotoListItem) {
  const title = getPhotoDisplayTitle(photo);
  if (title) return title;

  const camera = [photo.make, photo.model].filter(Boolean).join(' ');

  return camera ? `Photograph taken with ${camera}` : 'Photograph';
}

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
