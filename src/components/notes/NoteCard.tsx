import Link from 'next/link';

import { notePath } from '@/config/venues';
import type { NoteListItem } from '@/modules/notes/types';
import clsx from 'clsx';

import { toDate } from '@/lib/date';

import { NoteCategories, NoteCoverImage, NoteTitle } from './';

// Storefront card. `feature` renders the magazine-flow headline treatment:
// full grid width, cover left / content right on md+ (falls back to the
// standard vertical card below md).
export function NoteCard({
  note,
  variant = 'standard',
}: {
  note: NoteListItem;
  variant?: 'feature' | 'standard';
}) {
  // Notes arriving through /api/notes carry a string date despite the
  // Prisma Date type; the ISO slice is deterministic on server and client.
  const published = toDate(note.publishedAt).toISOString().slice(0, 10);
  const feature = variant === 'feature';

  return (
    <article
      className={clsx('neon-card min-w-0', feature && 'md:col-span-full')}
    >
      <Link
        href={notePath(note.slug)}
        aria-label={note.title}
        className={clsx(
          'flex h-full min-h-130 flex-col p-3 outline-(--card-hue) focus-visible:outline-2 focus-visible:-outline-offset-2 sm:p-4',
          feature &&
            'md:min-h-80 md:flex-row md:items-stretch md:gap-6 xl:min-h-88',
        )}
      >
        <div
          className={clsx(
            'neon-card__window shrink-0',
            feature && 'md:w-[55%]',
          )}
        >
          <NoteCoverImage
            originalKey={note.coverMedia.originalKey}
            alt={note.title}
            blurDataURL={note.coverMedia.blurDataURL}
            className={clsx(
              'rounded-none',
              feature && 'md:aspect-auto md:h-full',
            )}
            sizes={
              feature
                ? '(max-width: 768px) 84vw, (max-width: 1280px) 52vw, 660px'
                : undefined
            }
          />
        </div>

        <div
          className={clsx(
            'flex min-h-0 flex-1 flex-col',
            feature && 'md:min-w-0',
          )}
        >
          <p className="neon-card__meta">
            {published} · {note.readingTime} MIN READ
            {feature ? ' · FEATURED' : ''}
          </p>

          <div className="flex min-h-0 flex-1 flex-col gap-3 pt-2">
            <NoteTitle
              title={note.title}
              className={
                feature ? 'md:line-clamp-3 md:min-h-0 md:text-2xl' : undefined
              }
            />

            <p
              className={clsx(
                'line-clamp-3 min-h-21 text-[0.95rem] leading-7 text-foreground/85',
                feature && 'md:line-clamp-4 md:min-h-0',
              )}
            >
              {note.abstract}
            </p>

            <div className="mt-auto max-h-19 overflow-hidden pt-1">
              <NoteCategories categories={note.categories} />
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
