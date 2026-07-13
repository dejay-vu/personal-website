'use client';

import Image from 'next/image';

import { buildPhotoURL } from '@/modules/photos/query';
import type { PhotoDetail as PhotoDetailModel } from '@/modules/photos/types';

import { toDate } from '@/lib/date';
import { mediaImageLoader } from '@/lib/media';

import { RouteLink } from '@/components/ui/RouteLink';

import { PhotoCaption } from './PhotoCaption';
import { getPhotoAltText } from './photoAlt';
import { getPhotoDisplayDimensions } from './photoDimensions';

// Most photo tags are EXIF-derived (make/iso/aperture/shutter/…) and already
// summarized in the caption's EXIF line — as tickets they'd be noise. Only
// human-meaningful fields become filter links.
const TICKET_TAG_FIELDS = new Set([
  'country',
  'area',
  'city',
  'location',
  'place',
  'custom',
  'year',
]);
const MAX_TICKET_TAGS = 6;

function getShotDate(photo: PhotoDetailModel) {
  for (const candidate of [
    photo.capturedAt,
    photo.dateTimeOriginal,
    photo.createdAt,
  ]) {
    if (!candidate) continue;
    const date = toDate(candidate);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  return null;
}

export function PhotoDetail({ photo }: { photo: PhotoDetailModel }) {
  const { height, width } = getPhotoDisplayDimensions(photo);
  const shotDate = getShotDate(photo);
  const ticketTags = photo.tags
    .filter(({ tag }) => TICKET_TAG_FIELDS.has(tag.field))
    .slice(0, MAX_TICKET_TAGS);

  return (
    <article className="relative mx-auto flex h-[calc(100dvh-17.5rem)] min-h-0 w-full max-w-[calc(130ch+4rem)] items-center justify-center overflow-hidden sm:h-[calc(100dvh-17rem)]">
      <div className="flex h-full w-full items-center justify-center pb-24 sm:pb-28">
        <Image
          loader={mediaImageLoader}
          src={photo.mediaAsset.originalKey}
          alt={getPhotoAltText(photo)}
          width={width}
          height={height}
          sizes="(max-width: 1400px) 92vw, 1300px"
          priority
          style={{
            backgroundImage: `url(${photo.mediaAsset.blurDataURL})`,
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'cover',
          }}
          className="h-auto max-h-full w-auto max-w-full rounded-lg object-contain shadow-[0_0_50px_color-mix(in_srgb,var(--beam)_14%,transparent)] ring-1 ring-(--beam)/20"
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 text-center">
        <PhotoCaption
          photo={photo}
          as="h1"
          fallbackExif={`${width} x ${height}`}
        />
        {shotDate ? (
          <p className="font-mono text-[11px] tracking-[0.14em] text-(--neon-dim)">
            SHOT {shotDate}
          </p>
        ) : null}
        {ticketTags.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            {ticketTags.map(({ tag }) => (
              <RouteLink
                key={tag.id}
                href={buildPhotoURL({ filters: { [tag.field]: [tag.slug] } })}
                progressLabel="Loading photos"
                className="neon-ticket px-2.5 py-1.5"
              >
                #{tag.label}
              </RouteLink>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
