import type { PhotoDetail, PhotoListItem } from './types';

const PHOTO_LOCATION_FIELDS = [
  'location',
  'place',
  'city',
  'area',
  'country',
] as const;

// Photos default to the literal title "untitled" in the DB; treat that
// placeholder as "no title".
export function getPhotoDisplayTitle(photo: PhotoListItem) {
  const title = photo.title?.trim();

  return title && title.toLowerCase() !== 'untitled' ? title : null;
}

// Screen readers should get a description, not the "untitled" placeholder.
export function getPhotoAltText(photo: PhotoListItem) {
  const title = getPhotoDisplayTitle(photo);
  if (title) return title;

  const camera = [photo.make, photo.model].filter(Boolean).join(' ');

  return camera ? `Photograph taken with ${camera}` : 'Photograph';
}

export function getPhotoContentLocation(photo: PhotoDetail) {
  const labels = PHOTO_LOCATION_FIELDS.flatMap((field) =>
    photo.tags
      .filter(({ tag }) => tag.field === field)
      .map(({ tag }) => tag.label.trim())
      .filter(Boolean),
  );
  const seen = new Set<string>();

  return labels
    .filter((label) => {
      const normalized = label.toLocaleLowerCase('en');
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join(', ');
}

export function getPhotoSeoPresentation(photo: PhotoDetail) {
  const title = getPhotoDisplayTitle(photo);
  const location = getPhotoContentLocation(photo);
  const name =
    title && location
      ? `${title} in ${location}`
      : title || location || getPhotoAltText(photo);

  return {
    description: `${name}, photographed by Junhao Zhang (Jay).`,
    location: location || null,
    name,
  };
}
