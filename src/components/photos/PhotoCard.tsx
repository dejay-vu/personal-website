import type { CSSProperties } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import type { PhotoListItem } from '@/modules/photos/types';
import clsx from 'clsx';

import { mediaImageLoader } from '@/lib/media';

import {
  getPhotoAltText,
  getPhotoDisplayTitle,
  getPhotoExifSummary,
} from './photoAlt';

export function PhotoCard({
  breaker = false,
  className,
  eager = false,
  featured = false,
  href,
  photo,
  priority = false,
  sizes = '(max-width: 768px) 84vw, (max-width: 1280px) 42vw, 28vw',
  style,
}: {
  breaker?: boolean;
  className?: string;
  eager?: boolean;
  featured?: boolean;
  href: string;
  photo: PhotoListItem;
  priority?: boolean;
  sizes?: string;
  style?: CSSProperties;
}) {
  // The photo is the hero: expose browsing metadata at the decision point,
  // while the lightbox remains image-only and the detail page stays rich.
  const title = getPhotoDisplayTitle(photo);
  const exif = getPhotoExifSummary(photo, { compact: true });

  return (
    <article
      className={clsx('neon-tile min-w-0', className)}
      data-featured={featured || undefined}
      data-breaker={breaker || undefined}
      style={style}
    >
      <Link
        href={href}
        scroll={false}
        aria-label={getPhotoAltText(photo)}
        className="group block h-full outline-(--card-hue) focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        <div
          className="relative h-full w-full overflow-hidden bg-foreground/5 bg-cover bg-center"
          style={{
            backgroundImage: `url(${photo.mediaAsset.blurDataURL})`,
          }}
        >
          <Image
            fill
            loader={mediaImageLoader}
            src={photo.mediaAsset.originalKey}
            placeholder="blur"
            blurDataURL={photo.mediaAsset.blurDataURL}
            alt={getPhotoAltText(photo)}
            priority={priority}
            loading={priority ? undefined : eager ? 'eager' : 'lazy'}
            sizes={sizes}
            className="z-0 object-cover"
          />
          {(title || exif) && (
            <div
              data-photo-card-metadata
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-[#07040d]/85 via-[#07040d]/40 to-transparent px-3 pb-2.5 pt-9 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
            >
              {title ? (
                <p className="truncate text-[0.8rem] font-semibold leading-tight text-white">
                  {title}
                </p>
              ) : null}
              {exif ? (
                <p className="mt-0.5 truncate font-mono text-[0.7rem] uppercase leading-tight tracking-[0.12em] text-(--neon-dim)">
                  {exif}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </Link>
    </article>
  );
}
