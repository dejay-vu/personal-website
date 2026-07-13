import { memo } from 'react';

import type { NoteListItem } from '@/modules/notes/types';

import { NoteCard } from './';

// Magazine flow: every 7th note (0, 7, 14…) renders as a full-width feature
// card. Index-derived, so assignments are stable across endless-scroll
// appends. Natural row heights (no auto-rows-fr): standard cards stay uniform
// via their own min-h, and the feature row keeps its shorter height.
export const NoteCardGrid = memo(function NoteCardGrid({
  notes,
}: {
  notes: NoteListItem[];
}) {
  return (
    <div className="neon-storefront-grid grid grid-cols-1 gap-x-4 gap-y-7 md:grid-cols-2 md:gap-x-5 xl:grid-cols-3 xl:gap-x-6">
      {notes.map((note, index) => (
        <NoteCard
          key={note.slug}
          note={note}
          variant={index % 7 === 0 ? 'feature' : 'standard'}
        />
      ))}
    </div>
  );
});
