import type { PhotoListItem } from '@/modules/photos/types';

import { PhotoModal } from './PhotoModal';

export default function PhotoModalPage({ photo }: { photo: PhotoListItem }) {
  return <PhotoModal photo={photo} />;
}
