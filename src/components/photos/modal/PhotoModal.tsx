'use client';

import { type CSSProperties, useEffect, useRef } from 'react';

import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { VENUES } from '@/config/venues';
import type { PhotoListItem } from '@/modules/photos/types';
import { Button, Modal, useOverlayState } from '@heroui/react';
import clsx from 'clsx';

import { mediaImageLoader } from '@/lib/media';

import { XMarkIcon } from '@/components/ui/Icons';

import { getPhotoAltText } from '../photoAlt';
import { getPhotoDisplayDimensions } from '../photoDimensions';

export function PhotoModal({
  photo,
  closeHref = VENUES.photos.path,
}: {
  photo: PhotoListItem;
  closeHref?: string;
}) {
  const router = useRouter();
  const { height: displayHeight, width: displayWidth } =
    getPhotoDisplayDimensions(photo);
  const aspectRatio = displayWidth / displayHeight;
  const frameStyle = {
    aspectRatio: `${displayWidth} / ${displayHeight}`,
    height: `min(90dvh, ${90 / aspectRatio}vw)`,
    width: `min(90vw, ${90 * aspectRatio}dvh)`,
  } satisfies CSSProperties;
  // useOverlayState fires onOpenChange unconditionally (no change check), so
  // Esc + close-button in quick succession would navigate back twice.
  const hasClosedRef = useRef(false);

  useEffect(() => {
    router.prefetch(closeHref);
  }, [closeHref, router]);

  const state = useOverlayState({
    defaultOpen: true,
    onOpenChange(isOpen) {
      if (!isOpen) {
        if (hasClosedRef.current) return;
        hasClosedRef.current = true;

        if (window.history.length > 1) {
          router.back();
          return;
        }

        router.push(closeHref, {
          scroll: false,
        });
      }
    },
  });

  return (
    <Modal state={state}>
      <Modal.Trigger
        aria-hidden
        tabIndex={-1}
        className="sr-only pointer-events-none"
      >
        Open photo preview
      </Modal.Trigger>
      <Modal.Backdrop variant="blur" isDismissable className="bg-background/70">
        <Modal.Container placement="center">
          <Modal.Dialog
            aria-label="Photo preview"
            style={{
              ...frameStyle,
              maxHeight: 'none',
              maxWidth: 'none',
              overflow: 'visible',
            }}
            className={clsx(
              'items-center justify-center',
              'h-fit w-max overflow-visible sm:my-auto',
              'bg-transparent p-0',
              'shadow-[0_0_60px_color-mix(in_srgb,var(--beam)_20%,transparent)]',
            )}
          >
            <Button
              isIconOnly
              variant="tertiary"
              aria-label="Close photo"
              onPress={() => state.close()}
              className="absolute right-3 top-3 z-20 rounded-full bg-black/50 text-white ring-1 ring-(--beam)/40 hover:bg-(--beam) hover:text-background"
            >
              <XMarkIcon />
            </Button>
            <Modal.Body className="h-full w-full overflow-visible p-0">
              <div
                data-photo-modal-frame
                className="relative h-full w-full overflow-hidden rounded-lg bg-transparent"
              >
                <Image
                  fill
                  loader={mediaImageLoader}
                  src={photo.mediaAsset.originalKey}
                  alt={getPhotoAltText(photo)}
                  sizes="90vw"
                  priority
                  placeholder="blur"
                  blurDataURL={photo.mediaAsset.blurDataURL}
                  className="object-contain"
                />
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
