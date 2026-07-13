'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { VENUES } from '@/config/venues';
import type { NoteListItem } from '@/modules/notes/types';
import type { PhotoListItem } from '@/modules/photos/types';
import clsx from 'clsx';

import { mediaImageLoader } from '@/lib/media';

import styles from './NeonJunction.module.css';
import landing from './NeonLanding.module.css';

type NeonJunctionProps = {
  // Live merchandise for the branch previews: the latest three note titles
  // run the Field Notes marquee, the latest three photos hang in Darkroom.
  notes: NoteListItem[];
  photos: PhotoListItem[];
  notesCount: number;
  photosCount: number;
};

// The departure burst (surge + blackout) runs this long before the route
// change; matches the .leaving surge animation (0.45s).
const DEPART_MS = 450;

export function NeonJunction({
  notes,
  photos,
  notesCount,
  photosCount,
}: NeonJunctionProps) {
  const router = useRouter();
  const busyRef = useRef(false);
  const timerRef = useRef(0);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  // Unmount = the navigation happened; just drop the pending push. No
  // scroll lock is ever taken here (no zoom), so nothing else to restore.
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) setPortalHost(document.body);
    });
    return () => {
      alive = false;
      window.clearTimeout(timerRef.current);
    };
  }, []);

  const enter = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    // Modified clicks (new tab / window / download) keep native <a> behaviour.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (reduce) {
      router.push(href);
      return;
    }
    setLeaving(href);
    timerRef.current = window.setTimeout(() => router.push(href), DEPART_MS);
  };

  const latestNotes = notes.slice(0, 3);
  const latestPhotos = photos.slice(0, 3);

  return (
    <>
      <section id="street" className={styles.junction}>
        <h2 className="sr-only">
          The junction — {VENUES.notes.label}, {VENUES.photos.label} and{' '}
          {VENUES.projects.label}
        </h2>

        <Term
          href={VENUES.notes.path}
          name={VENUES.notes.label}
          holoAt="0.02"
          count={
            <>
              <b>{notesCount}</b> {VENUES.notes.label}
            </>
          }
          ariaLabel={`${VENUES.notes.label} — ${notesCount} engineering notes`}
          leaving={leaving === VENUES.notes.path}
          onEnter={enter}
        >
          {latestNotes.length > 0 && (
            <span className={styles.mqClip}>
              <span className={styles.mq}>
                {[0, 1].map((copy) =>
                  latestNotes.map((note, i) => (
                    <span key={`${copy}-${note.id}`}>
                      {i === 0 && 'LATEST — '}
                      <b>{note.title}</b> · {note.readingTime} MIN
                    </span>
                  )),
                )}
              </span>
            </span>
          )}
        </Term>

        <Term
          href={VENUES.photos.path}
          name={VENUES.photos.label}
          holoAt="0.45"
          count={
            <>
              <b>{photosCount}</b> prints
            </>
          }
          ariaLabel={`${VENUES.photos.label} — photography, ${photosCount} prints`}
          leaving={leaving === VENUES.photos.path}
          onEnter={enter}
        >
          <span className={styles.photoMqClip}>
            <span className={styles.photoMq} data-photo-marquee>
              {[0, 1].map((copy) => (
                <span
                  key={copy}
                  className={styles.photoMqGroup}
                  data-photo-marquee-group
                  aria-hidden={copy === 1 ? true : undefined}
                >
                  {latestPhotos.map((photo) => (
                    <span
                      key={`${copy}-${photo.id}`}
                      className={styles.thumb}
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
                        alt=""
                        loading="lazy"
                        sizes="(max-width: 760px) 30vw, 120px"
                        className={styles.thumbImg}
                      />
                    </span>
                  ))}
                </span>
              ))}
            </span>
          </span>
        </Term>

        <Term
          href={VENUES.projects.path}
          name={VENUES.projects.label}
          holoAt="0.91"
          count={
            <>
              <b>2026</b> opening
            </>
          }
          ariaLabel={`${VENUES.projects.label} — under construction, opening 2026`}
          leaving={leaving === VENUES.projects.path}
          onEnter={enter}
        >
          <span className={styles.hazardline} />
          <span className={styles.soonTag}>装修中 · UNDER CONSTRUCTION</span>
        </Term>
      </section>
      {portalHost
        ? createPortal(
            <div
              data-departure-blackout
              className={clsx(styles.blackout, leaving && styles.blackoutOn)}
              aria-hidden="true"
            />,
            portalHost,
          )
        : null}
    </>
  );
}

// One venue terminal on the projection run. A real <Link> (prefetch +
// native fallbacks); all descendants are <span> so the anchor stays valid
// HTML. The name ([data-vname]) is drawn by the holo canvas; the count pops
// as a holoEl at its title's completion point in the street dwell.
function Term({
  href,
  name,
  holoAt,
  count,
  ariaLabel,
  leaving,
  onEnter,
  children,
}: {
  href: string;
  name: string;
  holoAt: string;
  count: React.ReactNode;
  ariaLabel: string;
  leaving: boolean;
  onEnter: (e: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      data-term
      className={clsx(styles.term, leaving && styles.leaving)}
      aria-label={ariaLabel}
      onClick={(e) => onEnter(e, href)}
    >
      <span className={styles.tname} data-vname>
        {name}
      </span>
      <span
        className={clsx(styles.tcount, landing.holoEl)}
        data-holo-at={holoAt}
      >
        {count}{' '}
        <span className={styles.arw} aria-hidden="true">
          →
        </span>
      </span>
      <span className={styles.tpre} aria-hidden="true">
        <span className={styles.tpreIn}>{children}</span>
      </span>
    </Link>
  );
}
