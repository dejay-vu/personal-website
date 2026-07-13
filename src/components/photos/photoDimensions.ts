import type { PhotoListItem } from '@/modules/photos/types';

export function getPhotoDisplayDimensions(photo: PhotoListItem) {
  const width = photo.mediaAsset.width ?? photo.width ?? 2560;
  const height = photo.mediaAsset.height ?? photo.height ?? 1440;
  const shouldSwapDimensions = ['left-bottom', 'right-top'].includes(
    photo.orientation ?? '',
  );

  return {
    height: shouldSwapDimensions ? width : height,
    width: shouldSwapDimensions ? height : width,
  };
}
