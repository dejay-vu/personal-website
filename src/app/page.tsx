import { preload } from 'react-dom';

import { getPublishedNotesCount, getPublishedNotesPage } from '@/modules/notes';
import { getPhotosCount, getPhotosPage } from '@/modules/photos';
import {
  getPublishedProjects,
  getPublishedProjectsCount,
} from '@/modules/projects';

import { createPersonJsonLd, createWebsiteJsonLd } from '@/lib/seo';

import { JsonLd } from '@/components/JsonLd';
import { NeonLanding } from '@/components/home';

// The single page previews the feeds at the neon-spine junction (latest
// note titles run the Field Notes marquee, latest photos run through the
// Darkroom row, the newest project sits on The Lab's bench line) and enters
// the full venue pages through the branch signs. Statically rendered +
// revalidated hourly; underlying note/photo reads are unstable_cache'd on
// the 'notes'/'photos' tags, so admin edits invalidate this page too
// (project data is compiled in and changes with deploys).
export const dynamic = 'force-static';
export const revalidate = 3600;

// The Field Notes marquee cycles the three latest note titles.
const HOME_NOTES_PREVIEW = 3;
// A longer unique sequence keeps the duplicated seamless-loop group outside
// the viewport instead of showing the same three prints side by side.
const HOME_PHOTOS_PREVIEW = 9;

export default async function Home() {
  preload('/background.webp', {
    as: 'image',
    fetchPriority: 'high',
    type: 'image/webp',
  });

  const [
    notesPage,
    photosPage,
    notesCount,
    photosCount,
    projects,
    projectsCount,
  ] = await Promise.all([
    getPublishedNotesPage({ limit: HOME_NOTES_PREVIEW }),
    getPhotosPage({ filters: {}, limit: HOME_PHOTOS_PREVIEW }),
    getPublishedNotesCount(),
    getPhotosCount(),
    getPublishedProjects(),
    getPublishedProjectsCount(),
  ]);

  return (
    <>
      <JsonLd data={[createPersonJsonLd(), createWebsiteJsonLd()]} />
      <NeonLanding
        notes={notesPage.notes}
        photos={photosPage.photos}
        projects={projects}
        notesCount={notesCount}
        photosCount={photosCount}
        projectsCount={projectsCount}
      />
    </>
  );
}
