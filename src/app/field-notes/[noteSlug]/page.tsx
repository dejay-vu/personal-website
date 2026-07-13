import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { notePath } from '@/config/venues';
import { getPublishedNoteBySlug, getPublishedNoteSlugs } from '@/modules/notes';

import { toDate } from '@/lib/date';
import { getMediaImageURL } from '@/lib/media';
import {
  absoluteUrl,
  createArticleMetadata,
  createNotePostingJsonLd,
} from '@/lib/seo';

import { JsonLd } from '@/components/JsonLd';
import { NoteArticle } from '@/components/notes/note/NoteArticle';

function getNoteMetadataTitle(note: {
  seoTitle?: null | string;
  title: string;
}) {
  return note.seoTitle ?? note.title;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ noteSlug: string }>;
}): Promise<Metadata | undefined> {
  const { noteSlug } = await params;
  const note = await getPublishedNoteBySlug(noteSlug);
  if (!note) notFound();
  const publishedAt = toDate(note.publishedAt);
  const updatedAt = toDate(note.updatedAt);
  const image = getMediaImageURL({
    key: note.coverMedia.originalKey,
    width: 1200,
    format: 'jpeg',
  });
  const coverWidth = note.coverMedia.width;
  const coverHeight = note.coverMedia.height;
  const imageHeight =
    coverWidth && coverHeight
      ? Math.round((1200 * coverHeight) / coverWidth)
      : 630;

  return createArticleMetadata({
    // Bare title: the root layout's title.template appends the site name.
    title: getNoteMetadataTitle(note),
    description: note.abstract,
    path: notePath(note.slug),
    image: {
      url: image,
      width: 1200,
      height: imageHeight,
      alt: note.title,
    },
    publishedTime: publishedAt,
    modifiedTime: updatedAt,
    tags: note.categories.map((category) => category.name),
  });
}

export const dynamicParams = true;

export async function generateStaticParams() {
  const notes = await getPublishedNoteSlugs();

  return notes.map(({ slug }) => ({ noteSlug: slug }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ noteSlug: string }>;
}) {
  const { noteSlug } = await params;
  const note = await getPublishedNoteBySlug(noteSlug);
  if (!note) notFound();

  const image = getMediaImageURL({
    key: note.coverMedia.originalKey,
    width: 1200,
  });
  const url = absoluteUrl(notePath(note.slug));

  return (
    <>
      <JsonLd data={createNotePostingJsonLd({ image, note, url })} />
      <NoteArticle note={note} markdown={note.content} />
    </>
  );
}
