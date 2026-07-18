'use client';

import Image from 'next/image';

import { VENUES } from '@/config/venues';
import type { NoteListItem } from '@/modules/notes/types';
import type { PhotoListItem } from '@/modules/photos/types';
import type { ProjectListItem } from '@/modules/projects/types';
import clsx from 'clsx';

import { rememberHomeGateReturn } from '@/lib/homeGateReturn';
import { mediaImageLoader } from '@/lib/media';

import { RouteLink } from '@/components/ui/RouteLink';

import styles from './NeonJunction.module.css';
import landing from './NeonLanding.module.css';

type NeonJunctionProps = {
  // Live merchandise for the branch previews: the latest three note titles
  // run the Field Notes marquee, the latest photos loop through Darkroom,
  // and the newest project sits on The Lab's bench line.
  notes: NoteListItem[];
  photos: PhotoListItem[];
  projects: ProjectListItem[];
  notesCount: number;
  photosCount: number;
  projectsCount: number;
};

export function NeonJunction({
  notes,
  photos,
  projects,
  notesCount,
  photosCount,
  projectsCount,
}: NeonJunctionProps) {
  const enter = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    // Modified clicks (new tab / window / download) keep native <a> behaviour.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    // Let Next's Link own the ordinary navigation. Capturing the return point
    // is synchronous, so there is no animation timer or artificial route wait.
    rememberHomeGateReturn(href);
  };

  const latestNotes = notes.slice(0, 3);
  const latestPhotos = photos;
  const featuredProject = projects.at(0);

  return (
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
        onEnter={enter}
      >
        {latestNotes.length > 0 && (
          <span className={styles.mqClip}>
            <span className={styles.mq} data-venue-marquee="notes">
              {[0, 1].map((copy) => (
                <span
                  key={copy}
                  className={styles.mqGroup}
                  data-venue-marquee-group
                  aria-hidden={copy === 1 ? true : undefined}
                >
                  {latestNotes.map((note, i) => (
                    <span key={`${copy}-${note.id}`}>
                      {i === 0 && 'LATEST — '}
                      <b>{note.title}</b> · {note.readingTime} MIN
                    </span>
                  ))}
                </span>
              ))}
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
        onEnter={enter}
      >
        <span className={styles.photoMqClip}>
          {latestPhotos.length > 0 && (
            <span
              className={styles.photoMq}
              data-photo-marquee
              data-venue-marquee="photos"
            >
              {[0, 1].map((copy) => (
                <span
                  key={copy}
                  className={styles.photoMqGroup}
                  data-photo-marquee-group
                  data-venue-marquee-group
                  aria-hidden={copy === 1 ? true : undefined}
                >
                  {latestPhotos.map((photo) => (
                    <span
                      key={`${copy}-${photo.id}`}
                      className={styles.thumb}
                      data-photo-marquee-item={photo.id}
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
          )}
        </span>
      </Term>

      <Term
        href={VENUES.projects.path}
        name={VENUES.projects.label}
        holoAt="0.91"
        count={
          <>
            <b>{projectsCount}</b>{' '}
            {projectsCount === 1 ? 'instrument' : 'instruments'}
          </>
        }
        ariaLabel={`${VENUES.projects.label} — software projects, ${projectsCount} on the bench`}
        onEnter={enter}
      >
        {featuredProject && (
          <span className={styles.mqClip}>
            <span className={styles.mq} data-venue-marquee="projects">
              {[0, 1].map((copy) => (
                <span
                  key={copy}
                  className={styles.mqGroup}
                  data-venue-marquee-group
                  aria-hidden={copy === 1 ? true : undefined}
                >
                  <span>
                    ON THE BENCH — <b>{featuredProject.name}</b> ·{' '}
                    {featuredProject.pitch}
                  </span>
                </span>
              ))}
            </span>
          </span>
        )}
      </Term>
    </section>
  );
}

// One venue terminal on the projection run. A real RouteLink (prefetch +
// native fallbacks); all descendants are <span> so the anchor stays valid
// HTML. The name ([data-vname]) is drawn by the holo canvas; the count pops
// as a holoEl at its title's completion point in the street dwell.
function Term({
  href,
  name,
  holoAt,
  count,
  ariaLabel,
  onEnter,
  children,
}: {
  href: string;
  name: string;
  holoAt: string;
  count: React.ReactNode;
  ariaLabel: string;
  onEnter: (e: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
  children: React.ReactNode;
}) {
  return (
    <RouteLink
      href={href}
      progressLabel={`Loading ${name}`}
      data-term
      className={styles.term}
      aria-label={ariaLabel}
      onClick={(e) => onEnter(e, href)}
    >
      <span className={styles.tname} data-vname>
        {name}
      </span>
      <span className={styles.tcount} data-term-cta>
        <span
          className={clsx(styles.tmeta, landing.holoEl)}
          data-holo-at={holoAt}
        >
          {count}
        </span>
        <span className={styles.readyCue} data-ready-cue aria-hidden="true">
          ENTER
        </span>
        <span className={styles.arw} aria-hidden="true">
          →
        </span>
      </span>
      <span className={styles.tpre} data-term-preview aria-hidden="true">
        <span className={styles.tpreIn}>{children}</span>
      </span>
    </RouteLink>
  );
}
