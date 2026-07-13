import { VENUES } from '@/config/venues';
import { NOTES_PAGE_SIZE, getPublishedNotesPage } from '@/modules/notes';

import NoteEndlessGrid from '@/components/notes/NoteEndlessGrid';
import { HoloSign } from '@/components/ui';

export const dynamic = 'force-static';
export const revalidate = 3600;

export default async function Page() {
  const initialPage = await getPublishedNotesPage({
    limit: NOTES_PAGE_SIZE,
  });

  return (
    <div className="space-y-8">
      <HoloSign>{VENUES.notes.label}</HoloSign>
      <NoteEndlessGrid
        initialPage={initialPage}
        notesPerBatch={NOTES_PAGE_SIZE}
      />
    </div>
  );
}
