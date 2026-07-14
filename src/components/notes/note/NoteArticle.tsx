import type { getPublishedNoteBySlug } from '@/modules/notes';
import clsx from 'clsx';

import { toDate } from '@/lib/date';

import { AuthorByline } from '@/components/AuthorByline';
import { NoteCoverImage } from '@/components/notes';
import { NoteContent } from '@/components/notes/note/NoteContent';

type PublishedNote = NonNullable<
  Awaited<ReturnType<typeof getPublishedNoteBySlug>>
>;

// The canonical Note article body (title, meta, cover, and Markdown). It stays
// a Server Component so the complete article is present in the detail HTML.
export function NoteArticle({
  note,
  markdown,
}: {
  note: PublishedNote;
  markdown: string | null;
}) {
  const dateTime = toDate(note.publishedAt);

  return (
    <article
      className={clsx(
        'neon-prose prose dark:prose-invert m-auto',
        'md:prose-lg lg:prose-xl',
        'prose-img:rounded-lg prose-pre:p-0',
        'prose-headings:text-foreground prose-headings:font-bold',
        'prose-p:text-foreground prose-li:text-foreground',
        'prose-strong:text-foreground prose-strong:font-semibold',
        'prose-a:text-(--neon-ink) prose-a:underline prose-a:decoration-(--beam)/60 hover:prose-a:decoration-(--beam)',
        "prose-a:relative prose-a:after:content-[url('/link.svg')] prose-pre:rounded-2xl",
      )}
    >
      <h1 data-note-title className="font-serif font-extrabold text-pretty">
        {note.title}
      </h1>

      <div className="not-prose flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-[0.14em] text-foreground/55">
        <AuthorByline className="normal-case tracking-[0.08em]" />
        <time dateTime={dateTime.toISOString()}>{dateTime.toDateString()}</time>
        <span>{note.readingTime} min read</span>
        <span>{note.wordCount} words</span>
      </div>

      <NoteCoverImage
        originalKey={note.coverMedia.originalKey}
        alt={note.title}
        blurDataURL={note.coverMedia.blurDataURL}
        priority
        sizes="(max-width: 1024px) 92vw, 800px"
      />

      {markdown ? (
        <NoteContent content={markdown} />
      ) : (
        <p>Note content is temporarily unavailable.</p>
      )}
    </article>
  );
}
