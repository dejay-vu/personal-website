'use client';

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { usePathname, useRouter } from 'next/navigation';

import { VENUES, photoPath } from '@/config/venues';
import type { PhotoListItem } from '@/modules/photos/types';

import { PhotoModal, type PhotoModalPhase } from './PhotoModal';

type PhotoModalSession = {
  backIssued: boolean;
  closeRequested: boolean;
  epoch: number;
  originHref: string;
  originPath: string;
  phase: PhotoModalPhase;
  photo: PhotoListItem;
  routeCommitted: boolean;
  targetPath: string;
};

type PhotoModalCoordinatorValue = {
  begin(photo: PhotoListItem, href: string): number;
  navigationSettled(targetPath: string, epoch: number): void;
  routeReady(photo: PhotoListItem): void;
};

const PhotoModalCoordinatorContext =
  createContext<PhotoModalCoordinatorValue | null>(null);

function currentHref() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function PhotoModalCoordinator({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const epochRef = useRef(0);
  const previousPathRef = useRef(pathname);
  const sessionRef = useRef<PhotoModalSession | null>(null);
  const isOpenRef = useRef(false);
  const [session, setSession] = useState<PhotoModalSession | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const replaceSession = useCallback((next: PhotoModalSession | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const updateSession = useCallback(
    (update: (current: PhotoModalSession) => PhotoModalSession | null) => {
      const current = sessionRef.current;
      if (!current) return null;
      const next = update(current);
      if (next === current) return current;
      replaceSession(next);
      return next;
    },
    [replaceSession],
  );

  const updateOpen = useCallback((next: boolean) => {
    if (isOpenRef.current === next) return;
    isOpenRef.current = next;
    setIsOpen(next);
  }, []);

  const begin = useCallback(
    (photo: PhotoListItem, href: string) => {
      const target = new URL(href, window.location.href);
      const origin = new URL(currentHref(), window.location.href);
      epochRef.current += 1;
      const epoch = epochRef.current;
      replaceSession({
        backIssued: false,
        closeRequested: false,
        epoch,
        originHref: `${origin.pathname}${origin.search}${origin.hash}`,
        originPath: origin.pathname,
        phase: 'opening',
        photo,
        routeCommitted: window.location.pathname === target.pathname,
        targetPath: target.pathname,
      });
      updateOpen(true);

      return epoch;
    },
    [replaceSession, updateOpen],
  );

  const navigationSettled = useCallback(
    (targetPath: string, epoch: number) => {
      const current = sessionRef.current;
      if (
        !current ||
        current.epoch !== epoch ||
        current.targetPath !== targetPath ||
        current.closeRequested
      ) {
        return;
      }

      if (window.location.pathname === targetPath) {
        if (current.phase === 'confirmed') {
          updateSession((value) => ({ ...value, routeCommitted: true }));
          return;
        }

        // The URL committed without mounting PhotoModalPage. This is the
        // intercepted-route rejection path (for example, a stale card whose
        // photo was unpublished). Never leave the optimistic modal covering
        // the route result.
        updateSession((value) => ({
          ...value,
          backIssued: true,
          closeRequested: true,
          phase: 'closed',
        }));
        updateOpen(false);
        router.replace(current.originHref, { scroll: false });
        return;
      }

      if (!current.routeCommitted && current.phase === 'opening') {
        updateSession((value) => ({
          ...value,
          closeRequested: true,
          phase: 'closed',
        }));
        updateOpen(false);
      }
    },
    [router, updateOpen, updateSession],
  );

  const routeReady = useCallback(
    (photo: PhotoListItem) => {
      const targetPath = photoPath(photo.slug);
      const current = sessionRef.current;

      if (current?.targetPath === targetPath) {
        if (current.closeRequested) {
          // Closing a confirmed modal can briefly leave its bridge mounted
          // while Back is in flight. Never treat a bridge re-render as
          // Forward. A real Forward is identified by the pathname transition
          // below. A canceled optimistic navigation that arrives late is
          // corrected back to its exact origin URL.
          if (
            !current.routeCommitted &&
            window.location.pathname === targetPath &&
            !current.backIssued
          ) {
            updateSession((value) => ({ ...value, backIssued: true }));
            router.replace(current.originHref, { scroll: false });
          }
          return;
        }

        // Keep the card-supplied photo object. It already contains everything
        // the modal needs, and preserving it keeps the Image DOM mounted.
        updateSession((value) => ({
          ...value,
          phase: 'confirmed',
          routeCommitted: true,
        }));
        return;
      }

      // A newer optimistic click wins over an older bridge completing late.
      if (current?.phase === 'opening' && !current.closeRequested) return;

      // For confirmed/closed sessions, the bridge matching the committed
      // pathname is authoritative. This lets history or an external client
      // navigation move directly from photo A to photo B.
      if (window.location.pathname !== targetPath) return;

      epochRef.current += 1;
      replaceSession({
        backIssued: false,
        closeRequested: false,
        epoch: epochRef.current,
        originHref: VENUES.photos.path,
        originPath: VENUES.photos.path,
        phase: 'confirmed',
        photo,
        routeCommitted: true,
        targetPath,
      });
      updateOpen(true);
    },
    [replaceSession, router, updateOpen, updateSession],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        const current = sessionRef.current;
        if (current && !current.closeRequested) updateOpen(true);
        return;
      }

      if (!isOpenRef.current) return;
      updateOpen(false);

      const current = sessionRef.current;
      if (!current || current.closeRequested) return;

      const routeCommitted =
        current.routeCommitted ||
        window.location.pathname === current.targetPath;
      updateSession((value) => ({
        ...value,
        backIssued: routeCommitted,
        closeRequested: true,
        phase: 'closed',
        routeCommitted,
      }));

      if (routeCommitted) {
        router.back();
        return;
      }

      // Dispatching a newer replace cancels an unresolved App Router
      // navigation without accidentally going back past the photo grid.
      router.replace(current.originHref, { scroll: false });
    },
    [router, updateOpen, updateSession],
  );

  useLayoutEffect(() => {
    const previousPath = previousPathRef.current;
    previousPathRef.current = pathname;
    const current = sessionRef.current;
    if (!current) return;

    if (pathname === current.targetPath) {
      if (current.closeRequested && !current.routeCommitted) {
        if (!current.backIssued) {
          updateSession((value) => ({ ...value, backIssued: true }));
          router.replace(current.originHref, { scroll: false });
        }
        return;
      }

      if (
        previousPath !== current.targetPath &&
        current.phase === 'closed' &&
        current.routeCommitted
      ) {
        updateSession((value) => ({
          ...value,
          backIssued: false,
          closeRequested: false,
          phase: 'confirmed',
        }));
        updateOpen(true);
        return;
      }
      return;
    }

    if (previousPath === current.targetPath && current.routeCommitted) {
      updateSession((value) => ({
        ...value,
        closeRequested: true,
        phase: 'closed',
      }));
      updateOpen(false);
      return;
    }

    if (
      !current.routeCommitted &&
      current.phase === 'opening' &&
      pathname !== current.originPath
    ) {
      updateSession((value) => ({
        ...value,
        closeRequested: true,
        phase: 'closed',
      }));
      updateOpen(false);
    }
  }, [pathname, router, updateOpen, updateSession]);

  const value = useMemo(
    () => ({ begin, navigationSettled, routeReady }),
    [begin, navigationSettled, routeReady],
  );

  return (
    <PhotoModalCoordinatorContext.Provider value={value}>
      <span
        hidden
        data-photo-modal-coordinator
        data-photo-modal-phase={session?.phase ?? 'idle'}
        data-photo-modal-target={session?.targetPath}
      />
      {children}
      {session ? (
        <PhotoModal
          isOpen={isOpen}
          onOpenChange={handleOpenChange}
          phase={session.phase}
          photo={session.photo}
        />
      ) : null}
    </PhotoModalCoordinatorContext.Provider>
  );
}

export function usePhotoModalCoordinator() {
  const context = useContext(PhotoModalCoordinatorContext);
  if (!context) {
    throw new Error(
      'usePhotoModalCoordinator must be used inside PhotoModalCoordinator.',
    );
  }

  return context;
}
