'use client';

import { memo } from 'react';

import Image from 'next/image';

import clsx from 'clsx';

import { MEDIA_VARIANT_WIDTHS, mediaImageLoader } from '@/lib/media';

export const NoteCoverImage = memo(function NoteCoverImage({
  originalKey,
  alt,
  blurDataURL,
  className,
  priority = false,
  // Match NoteCardGrid's column breakpoints (2 cols at md, 3 at xl).
  sizes = '(max-width: 768px) 84vw, (max-width: 1280px) 45vw, 30vw',
}: {
  originalKey: string;
  alt: string;
  blurDataURL: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <Image
      loader={mediaImageLoader}
      src={originalKey}
      alt={alt}
      placeholder="blur"
      blurDataURL={blurDataURL}
      priority={priority}
      width={MEDIA_VARIANT_WIDTHS.noteCover}
      height={628}
      sizes={sizes}
      className={clsx(
        'block aspect-[1.618/1] h-auto w-full max-w-full rounded-lg object-cover',
        className,
      )}
    />
  );
});
