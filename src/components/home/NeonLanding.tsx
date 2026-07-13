'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

import {
  DESKTOP_FX_MEDIA_QUERY,
  MOBILE_LITE_MEDIA_QUERY,
} from '@/config/media';
import type { NoteListItem } from '@/modules/notes/types';
import type { PhotoListItem } from '@/modules/photos/types';
import { useGSAP } from '@gsap/react';

import { CjkDisplayFont, DisplayFont } from '@/styles/fonts';

import {
  clearHomeGateReturn,
  getHomeGateScrollRestore,
} from '@/lib/homeGateReturn';

import { ContactForm } from '@/components/contact';
import { NeonWordmark } from '@/components/ui';
import { GitHubIcon, InstagramIcon, LinkedInIcon } from '@/components/ui/Icons';

import { NeonHud } from './NeonHud';
import { NeonJunction } from './NeonJunction';
import styles from './NeonLanding.module.css';
import type { HoloHandle } from './neonHolo';
import { startRain } from './neonRain';
import { initNeonScroll } from './neonScroll';

type NeonLandingProps = {
  // Previews live at the neon-spine junction (latest note titles run the
  // Field Notes marquee, latest photos run through the Darkroom row) —
  // the full feeds live on /field-notes and /darkroom, entered via the branches.
  notes: NoteListItem[];
  photos: PhotoListItem[];
  notesCount: number;
  photosCount: number;
};

// The landing's sections (the venue sections collapsed into the single
// #street junction). The HUD's sector list navigates them; this drives the
// active-sector observer. Deep pages use a minimal "← GATE" return instead.
const HOME_SECTION_IDS = [
  'home',
  'about',
  'timeline',
  'street',
  'contact',
] as const;

const TIMELINE: { year: string; title: string; note: string }[] = [
  {
    year: '2024',
    title: 'PhD, University of Oxford',
    note: 'decoding the universe · rowing the Thames · tea breaks',
  },
  {
    year: '2022',
    title: 'Software Engineer, AMD',
    note: 'enhanced GPU performance · became a debugging ninja',
  },
  {
    year: '2020',
    title: 'MSc, Imperial College London',
    note: 'mastered machine learning · found the secret coffee spots',
  },
  {
    year: '2018',
    title: 'BEng, University of Liverpool',
    note: 'advanced engineering · a solid Beatles playlist',
  },
  {
    year: '2016',
    title: 'BEng, Xi’an Jiaotong-Liverpool University',
    note: 'fundamentals · late-night study hacks',
  },
];

const SOCIALS: { label: string; href: string; Icon: React.ComponentType }[] = [
  { label: 'GitHub', href: 'https://github.com/dejay-vu', Icon: GitHubIcon },
  {
    label: 'LinkedIn',
    href: 'https://linkedin.com/in/junhao-zh',
    Icon: LinkedInIcon,
  },
  {
    label: 'Instagram',
    href: 'https://instagram.com/dejayyvu',
    Icon: InstagramIcon,
  },
];

// Home committed dark: refine the site design tokens to neon so the embedded
// HeroUI ContactForm (which styles via bg-background / border-foreground /
// focus-within:border-accent) adopts the neon palette.
const NEON_TOKENS: React.CSSProperties = {
  ['--background' as string]: '#0b0714',
  ['--foreground' as string]: '#eae4ff',
  ['--accent' as string]: '#ff2e88',
  ['--accent-foreground' as string]: '#07040d',
  ['--accent-hover' as string]: '#ff5ba0',
  ['--accent-soft' as string]: '#1a0f2a',
};

// A scroll "track": the pinned child stays centred in the viewport while you
// scroll through the (taller) track — during that dwell only the fixed
// background keeps moving. The sign inside assembles as a sliced hologram on
// the fixed canvas (neonHolo.ts), driven by the dwell's scroll progress.
function Track({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.track} data-track>
      <div className={styles.pin} data-pin>
        <div className={styles.pinInner} data-pin-inner>
          {children}
        </div>
      </div>
    </div>
  );
}

export function NeonLanding({
  notes,
  photos,
  notesCount,
  photosCount,
}: NeonLandingProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bgImageRef = useRef<HTMLDivElement>(null);
  const rainFarRef = useRef<HTMLCanvasElement>(null);
  const rainNearRef = useRef<HTMLCanvasElement>(null);
  const heroTrackRef = useRef<HTMLDivElement>(null);
  const heroCoreRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const contactSignRef = useRef<HTMLHeadingElement>(null);
  // The lazily-loaded HOLO canvas layer: the scroll ticker feeds it progress
  // frames through this ref once (and if) it mounts.
  const fxHostRef = useRef<HTMLDivElement>(null);
  const holoRef = useRef<HoloHandle | null>(null);
  const gateScrollRestoreRef = useRef<number | null | undefined>(undefined);

  useLayoutEffect(() => {
    if (gateScrollRestoreRef.current === undefined) {
      gateScrollRestoreRef.current = getHomeGateScrollRestore();
    }
    const scrollY = gateScrollRestoreRef.current;
    if (scrollY === null) return;

    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    const restore = () => {
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, scrollY);
      root.style.scrollBehavior = previousBehavior;
    };

    // Next applies its own history scroll after the route commits. Restore in
    // the layout phase and for two following frames so its approximation cannot
    // overwrite the exact position captured at Street departure. The ref keeps
    // the value across React's development Strict Mode effect replay; storage is
    // cleared only after the stable restore actually completes.
    restore();
    let settleFrame = 0;
    const restoreFrame = window.requestAnimationFrame(() => {
      restore();
      settleFrame = window.requestAnimationFrame(() => {
        restore();
        clearHomeGateReturn();
        gateScrollRestoreRef.current = null;
      });
    });

    return () => {
      window.cancelAnimationFrame(restoreFrame);
      window.cancelAnimationFrame(settleFrame);
    };
  }, []);

  // Rain (far + near depth layers). Phones keep one low-resolution, 24fps
  // layer; reduced motion keeps both canvases still and empty.
  useEffect(() => {
    const far = rainFarRef.current;
    const near = rainNearRef.current;
    if (!far || !near) return;

    const mobileLite = window.matchMedia(MOBILE_LITE_MEDIA_QUERY);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let cleanups: Array<() => void> = [];

    const stop = () => {
      cleanups.forEach((cleanup) => cleanup());
      cleanups = [];
    };
    const start = () => {
      stop();
      if (reducedMotion.matches) return;

      if (mobileLite.matches) {
        cleanups.push(
          startRain(far, {
            count: 64,
            speed: 9,
            len: 16,
            width: 1,
            alpha: 0.38,
            wind: 0.18,
            tint: 0.08,
            maxDpr: 1,
            maxFps: 24,
            ignoreSmallHeightResizes: true,
          }),
        );
        return;
      }

      cleanups.push(
        startRain(far, {
          count: 260,
          speed: 9,
          len: 16,
          width: 1.1,
          alpha: 0.5,
          wind: 0.18,
          tint: 0.1,
        }),
        startRain(near, {
          count: 55,
          speed: 18,
          len: 42,
          width: 2.4,
          alpha: 0.28,
          wind: 0.22,
          tint: 0.16,
        }),
      );
    };

    start();
    mobileLite.addEventListener('change', start);
    reducedMotion.addEventListener('change', start);
    return () => {
      mobileLite.removeEventListener('change', start);
      reducedMotion.removeEventListener('change', start);
      stop();
    };
  }, []);

  // Active HUD sector link. The current id is mirrored onto
  // <html data-neon-sector> and sessionStorage so the layout.tsx boot script
  // can restore the highlight BEFORE first paint on a refresh — otherwise it
  // flashes back to the SSR default for the pre-hydration frame.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const links = new Map<string, HTMLElement>();
    root
      .querySelectorAll<HTMLElement>('[data-navlink]')
      .forEach((a) => links.set(a.dataset.navlink ?? '', a));
    // Centre-band test (like the sign observer below): the section crossing
    // the middle 10% of the viewport is "current". A visibility-ratio
    // threshold can never fire for the tall embedded feeds (notes/photos),
    // whose visible fraction stays far below it.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          links.forEach((a) => {
            a.classList.remove('on');
            a.removeAttribute('aria-current');
          });
          const hit = links.get(entry.target.id);
          hit?.classList.add('on');
          hit?.setAttribute('aria-current', 'true');
          document.documentElement.setAttribute(
            'data-neon-sector',
            entry.target.id,
          );
          try {
            sessionStorage.setItem('neonSector', entry.target.id);
          } catch {
            /* best-effort */
          }
        }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );
    HOME_SECTION_IDS.forEach((id) => {
      const s = document.getElementById(id);
      if (s) io.observe(s);
    });
    return () => {
      io.disconnect();
      document.documentElement.removeAttribute('data-neon-sector');
    };
  }, []);

  // HUD nav clicks on the pinned sections: the natural #anchor lands
  // mid-dwell (title half-assembled, rows half-popped) from above, and
  // top-aligned from below. Jump to the track's RELEASE point instead —
  // section centred in the viewport, everything fully projected.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.(
        'a[data-navlink]',
      ) as HTMLAnchorElement | null;
      if (!a) return;
      const id = a.dataset.navlink;
      if (id !== 'about' && id !== 'timeline' && id !== 'street') return;
      if (window.matchMedia(MOBILE_LITE_MEDIA_QUERY).matches) return;
      // The mobile/coarse-pointer layout is unpinned, so its native anchor is
      // already the right destination. Desktop jumps to the track release.
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const track = document
        .getElementById(id)
        ?.closest<HTMLElement>('[data-track]');
      if (!track) return;
      e.preventDefault();
      const top =
        track.getBoundingClientRect().top +
        window.scrollY +
        track.offsetHeight -
        window.innerHeight;
      window.scrollTo({ top, behavior: 'smooth' });
      history.pushState(null, '', `#${id}`);
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, []);

  // The page as one projection, handed to GSAP: ScrollTriggers own the pin
  // dwells (title assembly + content pops ride their progress) while a
  // shared gsap.ticker owns the window-band signs (venues, CONTACT), the
  // background pan, the HUD readout and the HOLO canvas feed. Pinning
  // stays CSS sticky — see neonScroll.ts.
  useGSAP(
    () => {
      const root = rootRef.current;
      const bgImage = bgImageRef.current;
      const rainNear = rainNearRef.current;
      const heroTrack = heroTrackRef.current;
      const heroCore = heroCoreRef.current;
      const zone = zoneRef.current;
      const contactSign = contactSignRef.current;
      if (
        !root ||
        !bgImage ||
        !rainNear ||
        !heroTrack ||
        !heroCore ||
        !zone ||
        !contactSign
      ) {
        return;
      }
      return initNeonScroll({
        root,
        bgImage,
        rainNear,
        heroTrack,
        heroCore,
        heroLetters: Array.from(
          heroCore.querySelectorAll<HTMLElement>('.neon-wordmark__letter'),
        ),
        zone,
        contactSign,
        holo: holoRef,
      });
    },
    { scope: rootRef },
  );

  // The HOLO canvas is desktop-only. Coarse-pointer/mobile devices keep the
  // DOM titles in flow, eliminating the compositor-vs-main-thread lag that
  // made titles detach from their copy while touch scrolling.
  useEffect(() => {
    const host = fxHostRef.current;
    const heroCore = heroCoreRef.current;
    const root = rootRef.current;
    if (!host || !heroCore || !root) return;
    const desktopFx = window.matchMedia(DESKTOP_FX_MEDIA_QUERY);
    const letters = Array.from(
      heroCore.querySelectorAll<HTMLElement>('.neon-wordmark__letter'),
    );
    if (letters.length === 0) return;
    const signEls: Record<string, HTMLElement> = {};
    const about = root.querySelector<HTMLElement>('#about [data-sign]');
    const timeline = root.querySelector<HTMLElement>('#timeline [data-sign]');
    const contact = root.querySelector<HTMLElement>('#contact [data-sign]');
    if (about) signEls.about = about;
    if (timeline) signEls.timeline = timeline;
    if (contact) signEls.contact = contact;
    root
      .querySelectorAll<HTMLElement>('#street [data-term] [data-vname]')
      .forEach((name, i) => {
        if (i <= 2) signEls[`street${i}`] = name;
      });
    let disposed = false;
    let handle: HoloHandle | null = null;
    let generation = 0;

    const sync = () => {
      generation += 1;
      const currentGeneration = generation;
      handle?.destroy();
      handle = null;
      holoRef.current = null;
      if (!desktopFx.matches) return;

      import('./neonHolo')
        .then((mod) => {
          if (
            disposed ||
            currentGeneration !== generation ||
            !desktopFx.matches
          ) {
            return;
          }
          handle = mod.createHolo(host, {
            heroLetterEls: letters,
            signEls,
            narrow: false,
          });
          holoRef.current = handle;
        })
        .catch(() => {
          // Import failure → the DOM stays fully lit; scrolling still works.
        });
    };

    sync();
    desktopFx.addEventListener('change', sync);
    return () => {
      disposed = true;
      generation += 1;
      desktopFx.removeEventListener('change', sync);
      holoRef.current = null;
      handle?.destroy();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={`${styles.neon} ${DisplayFont.variable} ${CjkDisplayFont.variable} dark`}
      data-theme="dark"
      style={NEON_TOKENS}
    >
      <div className={styles.bgFixedWrap} aria-hidden="true">
        <div className={styles.bg} />
        <div ref={bgImageRef} className={styles.bgImage} />
        <div className={styles.scrim} />
      </div>
      <canvas ref={rainFarRef} className={styles.rainFar} aria-hidden="true" />
      <canvas
        ref={rainNearRef}
        className={styles.rainNear}
        aria-hidden="true"
      />
      <div className={styles.vig} aria-hidden="true" />
      <div ref={fxHostRef} className={styles.fx} aria-hidden="true" />

      <main className={styles.main}>
        {/* HERO — pinned for one viewport of scroll: DEJAYVU holds centred
            while the canvas peels it apart as horizontal hologram slices
            that withdraw upward (chromatic fringes, registration jitter);
            scrolling back reassembles it. At rest the DOM wordmark IS the
            mark — the canvas takes over only once scroll moves. */}
        <div ref={heroTrackRef} className={styles.heroTrack} id="home">
          <header className={styles.hero}>
            <div ref={heroCoreRef} className={styles.heroCore}>
              <div className={styles.brand} aria-label="DeJayVu">
                <NeonWordmark />
              </div>
            </div>
          </header>
        </div>

        {/* THE PROJECTION RUN — every sign from here to CONTACT materialises
            as a sliced hologram when the projection front reaches it. */}
        <div ref={zoneRef} className={styles.zone}>
          {/* ABOUT */}
          <Track>
            <section className={`${styles.blk} ${styles.zoneBlk}`} id="about">
              <div className={styles.head}>
                <h2 className={styles.sign} data-sign>
                  ABOUT
                </h2>
              </div>
              <p
                className={`${styles.bio} ${styles.holoEl}`}
                data-holo-at="0.45"
              >
                I’m Junhao Zhang — a Machine Learning Engineer who geeks out
                over <b>GPU programming</b> and advanced computing systems,
                making machines think faster and smarter. I’ve tuned Llama2-70B
                and shipped performance for{' '}
                <b>Huggingface, Alibaba &amp; Microsoft</b>. Off the clock I’m
                up a mountain, under a reef, or behind a camera lens.
              </p>
            </section>
          </Track>

          {/* TIMELINE — the rows holo-pop one by one at fixed dwell
              thresholds (mockup timing), folding back on reverse scrub. */}
          <Track>
            <section
              className={`${styles.blk} ${styles.zoneBlk}`}
              id="timeline"
            >
              <div className={styles.head}>
                <h2 className={styles.sign} data-sign>
                  TIMELINE
                </h2>
              </div>
              <div className={styles.tl}>
                {TIMELINE.map((item, i) => (
                  <div
                    key={item.year}
                    className={`${styles.tlRow} ${styles.holoEl}`}
                    data-holo-at={(0.3 + i * 0.12).toFixed(2)}
                  >
                    <span className={styles.yr}>{item.year}</span>
                    <span className={styles.t}>
                      {item.title}
                      <small>{item.note}</small>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </Track>

          {/* THE JUNCTION — Field Notes / Darkroom / The Lab, pinned like
            About/Timeline: the three venue names slice-assemble sequentially
            through the dwell, counts pop as each title completes. Narrow
            unpins (window mode) via the shared .track/.pin media rules. */}
          <Track>
            <NeonJunction
              notes={notes}
              photos={photos}
              notesCount={notesCount}
              photosCount={photosCount}
            />
          </Track>

          {/* CONTACT — the terminus; the last sign the projection reaches */}
          <section
            className={`${styles.blk} ${styles.zoneBlk} ${styles.contactWrap} ${styles.contactSection}`}
            id="contact"
          >
            <div className={`${styles.head} ${styles.contactHead}`}>
              <h2 ref={contactSignRef} className={styles.sign} data-sign>
                CONTACT
              </h2>
            </div>
            <div
              className={`${styles.formArea} ${styles.holoEl}`}
              data-holo-at="0.6"
            >
              <ContactForm />
            </div>
            <div
              className={`${styles.socials} ${styles.holoEl}`}
              data-holo-at="0.6"
            >
              {SOCIALS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                >
                  <Icon />
                </a>
              ))}
            </div>
            <footer
              className={`${styles.foot} ${styles.holoEl}`}
              data-holo-at="0.6"
            >
              © 2026 JUNHAO ZHANG · 张俊豪 — ALL RIGHTS RESERVED
            </footer>
          </section>
        </div>
      </main>

      <NeonHud />
    </div>
  );
}
