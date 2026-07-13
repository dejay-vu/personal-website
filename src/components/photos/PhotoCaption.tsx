import type { PhotoListItem } from '@/modules/photos/types';
import clsx from 'clsx';

import {
  getPhotoAltText,
  getPhotoDisplayTitle,
  getPhotoExifSummary,
} from './photoAlt';

// Full title + EXIF caption for the canonical photo detail page.
export function PhotoCaption({
  photo,
  as = 'p',
  className,
  fallbackExif,
}: {
  photo: PhotoListItem;
  as?: 'h1' | 'p';
  className?: string;
  fallbackExif?: string;
}) {
  const Heading = as;
  const title = getPhotoDisplayTitle(photo);
  const exif = getPhotoExifSummary(photo) || fallbackExif;

  if (!title && !exif && as !== 'h1') return null;

  return (
    <div className={clsx('flex flex-col gap-2 text-center', className)}>
      {title ? (
        <Heading
          className="text-xl font-semibold text-foreground sm:text-2xl"
          style={{
            textShadow:
              '0 0 16px color-mix(in srgb, var(--beam) 45%, transparent)',
          }}
        >
          {title}
        </Heading>
      ) : as === 'h1' ? (
        // Placeholder-titled photos still need a page heading for structure;
        // keep it for screen readers only.
        <h1 className="sr-only">{getPhotoAltText(photo)}</h1>
      ) : null}
      {exif ? (
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-(--neon-dim)">
          {exif}
        </p>
      ) : null}
    </div>
  );
}
