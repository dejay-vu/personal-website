import { VENUES } from '@/config/venues';
import { PHOTOS_PAGE_SIZE, getPhotosPage } from '@/modules/photos';

import PhotoEndlessGrid from '@/components/photos/PhotoEndlessGrid';
import { PhotoSearchField } from '@/components/photos/PhotoSearchField';
import { HoloSign } from '@/components/ui';

export const dynamic = 'force-static';
export const revalidate = 3600;

export default async function Page() {
  const initialPage = await getPhotosPage({
    filters: {},
    limit: PHOTOS_PAGE_SIZE,
  });

  return (
    <article className="space-y-6">
      <div className="flex flex-col items-center gap-5">
        <HoloSign>{VENUES.photos.label}</HoloSign>
        <PhotoSearchField />
      </div>
      <PhotoEndlessGrid initialPage={initialPage} />
    </article>
  );
}
