import { NextRequest, NextResponse } from 'next/server';

import { VENUES } from '@/config/venues';
import { publishedNoteExists } from '@/modules/notes/read';
import { publicPhotoExists } from '@/modules/photos/read';

const itemSlug = (pathname: string, venuePath: string) => {
  const prefix = `${venuePath}/`;
  if (!pathname.startsWith(prefix)) return null;

  const slug = pathname.slice(prefix.length);
  return slug && !slug.includes('/') ? slug : null;
};

async function publicItemExists(pathname: string) {
  const noteSlug = itemSlug(pathname, VENUES.notes.path);
  if (noteSlug) {
    return publishedNoteExists(noteSlug);
  }

  const photoSlug = itemSlug(pathname, VENUES.photos.path);
  if (photoSlug) {
    return publicPhotoExists(photoSlug);
  }

  return true;
}

export async function proxy(request: NextRequest) {
  if (await publicItemExists(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return NextResponse.rewrite(new URL('/_not-found', request.url), {
    status: 404,
  });
}

// Matchers must be static literals so Next.js can analyze them at build time.
export const config = {
  matcher: [
    {
      source: '/darkroom/:photoSlug',
      missing: [
        { type: 'header', key: 'rsc' },
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
    {
      source: '/field-notes/:noteSlug',
      missing: [
        { type: 'header', key: 'rsc' },
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
