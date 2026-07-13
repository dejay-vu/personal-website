'use client';

import Image from 'next/image';

import type { PhotoListItem } from '@/modules/photos/types';
import { Button, Modal, useOverlayState } from '@heroui/react';
import clsx from 'clsx';

import { mediaImageLoader } from '@/lib/media';

import { XMarkIcon } from '@/components/ui/Icons';

import { getPhotoAltText } from '../photoAlt';
import { getPhotoModalFrameStyle } from './photoModalFrame';

export type PhotoModalPhase = 'closed' | 'confirmed' | 'opening';

export function PhotoModal({
  isOpen,
  onOpenChange,
  phase,
  photo,
}: {
  isOpen: boolean;
  onOpenChange(isOpen: boolean): void;
  phase: PhotoModalPhase;
  photo: PhotoListItem;
}) {
  const frameStyle = getPhotoModalFrameStyle(photo);
  const state = useOverlayState({
    isOpen,
    onOpenChange,
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
      <Modal.Backdrop
        variant="blur"
        isDismissable
        data-photo-modal-phase={phase}
        data-photo-modal-slug={photo.slug}
        className="z-[80] bg-background/70"
      >
        <Modal.Container placement="center">
          <Modal.Dialog
            aria-label="Photo preview"
            data-photo-modal-phase={phase}
            data-photo-modal-slug={photo.slug}
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
                className="relative h-full w-full overflow-hidden rounded-lg bg-[#020108]"
              >
                <Image
                  data-photo-modal-image
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
