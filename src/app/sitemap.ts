import type { MetadataRoute } from 'next';

import { APP_ROUTES, VENUES, notePath, photoPath } from '@/config/venues';
import { getPublishedNoteSitemapEntries } from '@/modules/notes';
import { getPhotoSitemapEntries } from '@/modules/photos';

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
    priority: 0.5,
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
  const [notes, photoEntries] = await Promise.all([
    getPublishedNoteSitemapEntries(),
    getPhotoSitemapEntries(),
  ]);
  // Real content timestamps only: a request-time `new Date()` teaches
  // crawlers to distrust lastmod. Pages without one simply omit it.
  const newestNoteDate = newestDate(
    notes.map((note) => note.updatedAt ?? note.publishedAt),
  );
  const newestPhotoDate = newestDate(
    photoEntries.photos.map((photo) => photo.updatedAt),
  );

  return [
    ...staticPages.map(({ path, priority }) => ({
      url: absoluteUrl(path),
      ...(path === VENUES.notes.path && newestNoteDate
        ? { lastModified: newestNoteDate }
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
