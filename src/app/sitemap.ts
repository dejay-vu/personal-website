import type { MetadataRoute } from 'next';

import {
  APP_ROUTES,
  VENUES,
  notePath,
  photoPath,
  projectPath,
} from '@/config/venues';
import { getPublishedNoteSitemapEntries } from '@/modules/notes';
import { getPhotoSitemapEntries } from '@/modules/photos';
import { getPublishedProjectSitemapEntries } from '@/modules/projects';

import { absoluteUrl } from '@/lib/seo';

const staticPages = [
  {
    path: APP_ROUTES.home,
    priority: 1,
  },
  {
    path: VENUES.notes.path,
    priority: 0.8,
  },
  {
    path: VENUES.projects.path,
    priority: 0.8,
  },
] as const;

function newestDate(dates: Array<Date | string | null | undefined>) {
  // unstable_cache serializes cached values, so dates may arrive as strings.
  const timestamps = dates
    .filter((date): date is Date | string => Boolean(date))
    .map((date) => new Date(date).getTime())
    .filter((time) => Number.isFinite(time));

  return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [notes, photoEntries, projects] = await Promise.all([
    getPublishedNoteSitemapEntries(),
    getPhotoSitemapEntries(),
    getPublishedProjectSitemapEntries(),
  ]);
  // Real content timestamps only: a request-time `new Date()` teaches
  // crawlers to distrust lastmod. Pages without one simply omit it.
  const newestNoteDate = newestDate(
    notes.map((note) => note.updatedAt ?? note.publishedAt),
  );
  const newestPhotoDate = newestDate(
    photoEntries.photos.map((photo) => photo.updatedAt),
  );
  const newestProjectDate = newestDate(
    projects.map((project) => project.updatedAt ?? project.publishedAt),
  );

  return [
    ...staticPages.map(({ path, priority }) => ({
      url: absoluteUrl(path),
      ...(path === VENUES.notes.path && newestNoteDate
        ? { lastModified: newestNoteDate }
        : {}),
      ...(path === VENUES.projects.path && newestProjectDate
        ? { lastModified: newestProjectDate }
        : {}),
      changeFrequency: 'monthly' as const,
      priority,
    })),
    ...notes.map((note) => ({
      url: absoluteUrl(notePath(note.slug)),
      lastModified: note.updatedAt ?? note.publishedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...projects.map((project) => ({
      url: absoluteUrl(projectPath(project.slug)),
      lastModified: project.updatedAt ?? project.publishedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    {
      url: absoluteUrl(VENUES.photos.path),
      ...(newestPhotoDate ? { lastModified: newestPhotoDate } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
    ...photoEntries.photos.map((photo) => ({
      url: absoluteUrl(photoPath(photo.slug)),
      lastModified: photo.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
  ];
}
