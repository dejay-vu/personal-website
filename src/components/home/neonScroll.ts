import { MOBILE_LITE_MEDIA_QUERY } from '@/config/media';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import styles from './NeonLanding.module.css';
import type {
  HoloFrame,
  HoloHandle,
  HoloRect,
  HoloRefreshData,
  HoloSignKey,
  HoloSignState,
} from './neonHolo';

// The page as one projection, orchestrated by GSAP — the mockup's model.
// Every title is ALWAYS the canvas hologram: there is no separate DOM
// "steady" state, so a title looks identical whether it is assembling,
// fully assembled, or withdrawing (this is why the 0%↔1% jump on DEJAYVU is
// gone). The DOM text is only the pre-canvas fallback (no-JS / reduced
// motion / textures-not-yet-baked); the root's `data-fx` gate — set the
// moment the canvas is ready — hides it so the canvas takes over.
//
// - PINNED titles (About/Timeline, CSS sticky — never ScrollTrigger
//   pin:true) assemble from their track's scrub progress and stay drawn at
//   p=1 through release (live rect while they scroll off).
// - WINDOW titles (venue names, CONTACT) assemble as they cross the
//   lower-middle viewport band: p = ((0.82·vh) − centre) / (0.35·vh) — and
//   disassemble when scrolled back.
// - Section CONTENT (bio, timeline rows, contact form) holo-pops at fixed
//   thresholds (DOM opacity glitch), reversibly.
//
// Layer split: geometry is measured ONLY in ScrollTrigger's refresh cycle
// (window titles' y is the one per-frame value, and it is pure math);
// a gsap.ticker callback owns the window-band math, the background pan, the
// HUD readout and the canvas feed.

export type NeonScrollElements = {
  root: HTMLElement;
  bgImage: HTMLElement;
  rainNear: HTMLElement;
  heroTrack: HTMLElement; // the hero's sticky dwell (100svh + 100vh)
  heroCore: HTMLElement;
  heroLetters: HTMLElement[]; // ALL wordmark letters
  zone: HTMLElement;
  contactSign: HTMLElement;
  holo: { current: HoloHandle | null }; // lazily-mounted canvas layer
};

// The HUD readout is written as CSS custom properties on <html> (rendered by
// NeonHud via ::after content), NOT textContent — so the layout.tsx boot
// script can restore the last value BEFORE first paint on a refresh (the
// element itself doesn't exist that early). JSON.stringify quotes the string
// for CSS `content`.
const setHudVar = (name: string, storageKey: string, text: string) => {
  document.documentElement.style.setProperty(name, JSON.stringify(text));
  try {
    sessionStorage.setItem(storageKey, text);
  } catch {
    /* storage disabled — best-effort */
  }
};
const setHudPct = (text: string) =>
  setHudVar('--neon-hud-pct', 'neonHudPct', text);
const setHudStatus = (text: string) =>
  setHudVar('--neon-hud-status', 'neonHudStatus', text);

// A content element that holo-pops (bio, timeline rows, contact form…):
// driven by its section's progress on desktop, by its own viewport position
// on narrow. Reversible.
type HoloEl = {
  el: HTMLElement;
  thr: number; // progress threshold (data-holo-at)
  on: boolean;
  docTop: number; // narrow window fallback geometry
  h: number;
};

type ScrubTarget = {
  key: 'about' | 'timeline';
  sec: HTMLElement;
  track: HTMLElement | null;
  pin: HTMLElement | null;
  sign: HTMLElement;
  st: ScrollTrigger | null; // the track's assembly trigger (desktop only)
  viewRect: HoloRect; // the title's PINNED viewport rect (canvas feed)
  liveRect: HoloRect; // live rect while it rises pre-pin / scrolls off post-pin
  preF: number; // trigger progress at which the pin actually engages
  shown: number; // title assembly p (canvas + activation)
  fd: number; // dwell fraction post-engagement (content pops + STABLE)
  els: HoloEl[];
};

// A title assembled by viewport position (mockup 'window' mode).
type WindowSign = {
  key: HoloSignKey;
  sign: HTMLElement; // the text node the texture is baked from
  term: HTMLAnchorElement | null; // Street activation target; null for CONTACT
  rect: HoloRect; // x/w/h refresh-cached; y recomputed per frame (math)
  docTop: number;
  p: number;
};

// The three venue titles now assemble off ONE pinned track (like about /
// timeline) but staggered, so they slice in sequentially through the dwell.
// `wins` are the SAME three street WindowSign objects, so the per-tick live
// rect read (needed because hover expands rows in flow) is untouched.
type StreetScrub = {
  track: HTMLElement | null;
  st: ScrollTrigger | null;
  wins: WindowSign[];
  els: HoloEl[];
  preF: number;
  fd: number;
};

type Geometry = {
  vh: number;
  bgMaxPan: number; // background pan span (bgImage height − viewport)
  docMax: number; // scrollable height (scrollHeight − vh), refresh-cached
};

const DAMP = 0.14; // background pan easing

// Uniform rhythm: every pinned title's assembly starts PIN_START_PCT% of a
// viewport BEFORE the pin engages, so the dead "tail" after each release is
// filled by the next title already slicing in low in the viewport — the same
// 68vh dark-travel between every consecutive section.
const PIN_START_PCT = 32;
const PIN_START = `top ${PIN_START_PCT}%`;
const PRE_ENGAGE_VH = PIN_START_PCT / 100; // pin engages this far into the trigger
const ASSEMBLY_VH = 0.35; // a title slices in over this much scroll (== windowP band)
const STREET_STEP = 0.3; // per-venue stagger over the street trigger progress
const STREET_SPAN = 0.34; // each venue's assembly span

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

// The mockup's window-band assembly: 0 below the 82%-viewport line, 1 once
// the element's centre has risen 35vh above it.
const windowP = (vh: number, centerV: number) =>
  clamp01((vh * 0.82 - centerV) / (vh * 0.35));

// Pin-track progress → { pin-engagement fraction, dwell fraction }. The pin
// engages PRE_ENGAGE_VH into the trigger; content pops (fd) run over the
// post-engagement dwell so their existing data-holo-at thresholds pop at the
// identical scroll offsets as before the pre-roll was added.
const trackFractions = (self: ScrollTrigger, vh: number) => {
  const span = self.end - self.start;
  const preF = span > 0 ? (PRE_ENGAGE_VH * vh) / span : 0;
  const denom = 1 - preF || 1;
  return { preF, span, fd: (f: number) => clamp01((f - preF) / denom) };
};

export function initNeonScroll(els: NeonScrollElements): () => void {
  gsap.registerPlugin(ScrollTrigger);
  // Mobile browser chrome changes the visual viewport during ordinary touch
  // scrolling. Never let those height-only resizes start a refresh cycle.
  ScrollTrigger.config({ ignoreMobileResize: true });

  const holoElsOf = (scope: Element): HoloEl[] =>
    Array.from(scope.querySelectorAll<HTMLElement>('[data-holo-at]')).map(
      (el) => ({
        el,
        thr: parseFloat(el.dataset.holoAt ?? '') || 0.3,
        on: false,
        docTop: 0,
        h: 0,
      }),
    );

  const scrubs: ScrubTarget[] = [];
  (['about', 'timeline'] as const).forEach((id) => {
    const sec = els.root.querySelector<HTMLElement>(`#${id}`);
    const sign = sec?.querySelector<HTMLElement>('[data-sign]');
    if (!sec || !sign) return;
    const track = sec.closest<HTMLElement>('[data-track]');
    scrubs.push({
      key: id,
      sec,
      sign,
      track,
      pin: track?.querySelector<HTMLElement>('[data-pin]') ?? null,
      st: null,
      viewRect: { x: 0, y: 0, w: 0, h: 0 },
      liveRect: { x: 0, y: 0, w: 0, h: 0 },
      preF: 0,
      shown: -1,
      fd: -1,
      els: holoElsOf(sec),
    });
  });

  // The three venue names (live-rect group — hover expands their rows) + the
  // CONTACT title. Street is now a pinned scrub on desktop; contact stays a
  // window-band sign. All four still read live rects each tick.
  const streetWins: WindowSign[] = [];
  els.root
    .querySelectorAll<HTMLAnchorElement>('#street [data-term]')
    .forEach((term, i) => {
      const name = term.querySelector<HTMLElement>('[data-vname]');
      if (!name || i > 2) return;
      streetWins.push({
        key: `street${i}` as HoloSignKey,
        sign: name,
        term,
        rect: { x: 0, y: 0, w: 0, h: 0 },
        docTop: 0,
        p: 0,
      });
    });
  const contactWin: WindowSign = {
    key: 'contact',
    sign: els.contactSign,
    term: null,
    rect: { x: 0, y: 0, w: 0, h: 0 },
    docTop: 0,
    p: 0,
  };
  const windowSigns: WindowSign[] = [...streetWins, contactWin];

  const streetSec = els.root.querySelector<HTMLElement>('#street');
  const streetScrub: StreetScrub = {
    track: streetSec?.closest<HTMLElement>('[data-track]') ?? null,
    st: null,
    wins: streetWins,
    els: streetSec ? holoElsOf(streetSec) : [],
    preF: 0,
    fd: -1,
  };

  const contactSec = els.root.querySelector<HTMLElement>('#contact');
  const contactEls = contactSec ? holoElsOf(contactSec) : [];

  const setElOn = (e: HoloEl, on: boolean) => {
    if (e.on === on) return;
    e.on = on;
    e.el.classList.toggle(styles.holoElOn, on);
  };

  const releaseProjectionReadiness = () => {
    for (const scrub of scrubs) scrub.sign.removeAttribute('data-projected');
    for (const win of windowSigns) {
      win.sign.removeAttribute('data-projected');
      if (win.term) {
        win.term.removeAttribute('data-projected');
        win.term.inert = false;
      }
    }
  };

  // The canvas progress is also the DOM interaction authority. Keep the
  // transparent fallback nodes present for geometry/texture baking, but only
  // expose selection and venue activation once the corresponding projection
  // has fully settled.
  const publishProjectionReadiness = (restricted: boolean) => {
    if (!restricted) {
      releaseProjectionReadiness();
      return;
    }

    for (const scrub of scrubs) {
      scrub.sign.toggleAttribute('data-projected', scrub.shown >= 0.999);
    }
    for (const win of windowSigns) {
      const projected = win.p >= 0.999;
      win.sign.toggleAttribute('data-projected', projected);
      if (win.term) {
        win.term.toggleAttribute('data-projected', projected);
        win.term.inert = !projected;
      }
    }
  };

  // Pin-title application (desktop): the title's canvas assembly `shown`
  // (window-band rate, completes ~3vh into the dwell) and the section
  // content's dwell-fraction pops `fd` ride the same track progress but on
  // separate curves.
  const applyAssembly = (s: ScrubTarget, self: ScrollTrigger) => {
    const vh = window.innerHeight;
    const f = Math.round(self.progress * 1000) / 1000;
    const { preF, span, fd } = trackFractions(self, vh);
    s.preF = preF;
    s.shown = clamp01((f * span) / (ASSEMBLY_VH * vh));
    s.fd = fd(f);
    for (const e of s.els) setElOn(e, s.fd >= e.thr);
  };

  // Street track: three venue titles slice in sequentially (staggered over
  // the trigger progress), counts pop on dwell fraction.
  const applyStreet = (self: ScrollTrigger) => {
    const f = Math.round(self.progress * 1000) / 1000;
    const { preF, fd } = trackFractions(self, window.innerHeight);
    streetScrub.preF = preF;
    streetScrub.fd = fd(f);
    for (let i = 0; i < streetScrub.wins.length; i++) {
      streetScrub.wins[i].p = clamp01((f - STREET_STEP * i) / STREET_SPAN);
    }
    for (const e of streetScrub.els) setElOn(e, streetScrub.fd >= e.thr);
  };

  let geom: Geometry | null = null;
  let wasLocked = false;
  let refreshedWhileLocked = false;
  const heroRects: HoloRect[] = [];
  let holoData: HoloRefreshData | null = null;
  let lastHandle: HoloHandle | null = null;
  let heroCanvasOn = false;
  let fxArmed = false;
  let hudPctShown = -1;
  let hudLabelShown = '';

  // All rect measurement lives here, run only on ScrollTrigger's refresh
  // cycle (init, resize, fonts, content growth) — never per frame (except
  // window-title y, which is pure math off the cached docTop).
  const measureGeometry = (narrow: boolean) => {
    const vh = window.innerHeight;
    const y = window.scrollY;

    for (const s of scrubs) {
      const sr = s.sign.getBoundingClientRect();
      if (!narrow) {
        // The title's viewport rect DURING the dwell: the pin sits at the
        // viewport top then, so the offset within the pin is the view y.
        const pinR = (s.pin ?? s.sec).getBoundingClientRect();
        s.viewRect.x = sr.left;
        s.viewRect.y = sr.top - pinR.top;
        s.viewRect.w = sr.width;
        s.viewRect.h = sr.height;
      } else {
        // Unpinned: window-mode geometry (doc offset; y is per-frame math).
        s.viewRect.x = sr.left;
        s.viewRect.y = sr.top + y; // docTop, converted per frame
        s.viewRect.w = sr.width;
        s.viewRect.h = sr.height;
        for (const e of s.els) {
          const r = e.el.getBoundingClientRect();
          e.docTop = r.top + y;
          e.h = r.height;
        }
      }
    }

    for (const ws of windowSigns) {
      const r = ws.sign.getBoundingClientRect();
      ws.rect.x = r.left;
      ws.rect.w = r.width;
      ws.rect.h = r.height;
      ws.docTop = r.top + y;
    }

    // Hero letters: pinned viewport rects. The hero is stuck at the viewport
    // top for the whole dwell band, so these are constants during it; if the
    // refresh ran past the band, undo the scroll-away shift.
    const htR = els.heroTrack.getBoundingClientRect();
    const heroStuckMax = htR.top + y + els.heroTrack.offsetHeight - vh;
    const heroShift = Math.max(0, y - heroStuckMax);
    heroRects.length = 0;
    for (const el of els.heroLetters) {
      const r = el.getBoundingClientRect();
      heroRects.push({
        x: r.left,
        y: r.top + heroShift,
        w: r.width,
        h: r.height,
      });
    }

    geom = {
      vh,
      bgMaxPan: Math.max(0, els.bgImage.offsetHeight - vh),
      docMax: Math.max(1, document.documentElement.scrollHeight - vh),
    };

    // Hand the fresh rects to the canvas layer (it re-rasters textures).
    // Only the SIZE matters for baking; window-mode y is refreshed per
    // frame by the engine before each draw.
    const signRects: HoloRefreshData['signRects'] = {};
    for (const s of scrubs) {
      signRects[s.key] = narrow
        ? { ...s.viewRect, y: s.viewRect.y - y }
        : s.viewRect;
    }
    for (const ws of windowSigns) {
      signRects[ws.key] = { ...ws.rect, y: ws.docTop - y };
    }
    holoData = {
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      heroLetters: heroRects,
      signRects,
    };
    els.holo.current?.refresh(holoData);
    lastHandle = els.holo.current;
  };

  const mm = gsap.matchMedia();
  mm.add(
    {
      motion: '(prefers-reduced-motion: no-preference)',
      reduce: '(prefers-reduced-motion: reduce)',
      narrow: '(max-width: 720px)',
      mobileLite: MOBILE_LITE_MEDIA_QUERY,
    },
    (ctx) => {
      const { mobileLite, motion, narrow } = ctx.conditions as {
        mobileLite: boolean;
        motion: boolean;
        narrow: boolean;
      };
      let alive = true;

      if (!motion || mobileLite) {
        // Reduced motion and touch/mobile use the in-flow DOM projection:
        // no ScrollTriggers, refreshes, ticker, per-frame geometry, parallax,
        // or fixed title canvas.
        document.documentElement.removeAttribute('data-neon-fx');
        document.documentElement.style.removeProperty('--neon-bg-y');
        els.bgImage.style.removeProperty('transform');
        setHudPct('PROJ 100%');
        setHudStatus('ALL SECTORS — STABLE');
        releaseProjectionReadiness();
        return () => {
          alive = false;
        };
      }

      for (const s of scrubs) s.shown = -1;

      // Safety net: the boot script may have armed the fx gate BEFORE first
      // paint (restored from the previous visit). If the canvas never
      // becomes ready (font/module failure), drop the gate so the DOM
      // fallback shows instead of a page of invisible titles.
      const fxFallback = window.setTimeout(() => {
        if (!fxArmed) {
          document.documentElement.removeAttribute('data-neon-fx');
          releaseProjectionReadiness();
          try {
            sessionStorage.removeItem('neonFx');
          } catch {
            /* best-effort */
          }
        }
      }, 4000);

      // --- Hero dwell: the mark stays PINNED and centred (CSS sticky on
      // .hero) while this trigger's progress drives the hologram withdrawal
      // on the canvas (p = 1 − progress). The canvas owns the mark for the
      // WHOLE band including f=0 (p=1, the resting projection), so there is
      // no solid-DOM rest frame to jump from.
      const heroST = ScrollTrigger.create({
        trigger: els.heroTrack,
        start: 'top top',
        end: 'bottom bottom',
      });

      // --- Hero dwell, damped ambience.
      const heroDamped = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: els.heroTrack,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.35,
        },
      });
      heroDamped.to(
        els.rainNear,
        { opacity: 0.12, duration: (1 - 0.12) / 0.9 },
        0,
      );

      // --- Background pan lives in the ticker (see below), NOT in a scrub
      // tween: scrub smoothing is duration-based, so a big wheel step makes
      // the huge parallax layer catch up at 100px+/frame — a visible bg
      // "teleport." The rate-based exponential lerp is the gentle glide.

      // --- Pin assembly (desktop): one standalone trigger per track.
      // Progress over the dwell IS the assembly; onRefresh guarantees a
      // correct first paint at any landing scroll (deep links).
      if (!narrow) {
        for (const s of scrubs) {
          if (!s.track) continue;
          const apply = (self: ScrollTrigger) => applyAssembly(s, self);
          s.st = ScrollTrigger.create({
            trigger: s.track,
            start: PIN_START,
            end: 'bottom bottom',
            onUpdate: apply,
            onRefresh: apply,
          });
        }
        if (streetScrub.track) {
          streetScrub.st = ScrollTrigger.create({
            trigger: streetScrub.track,
            start: PIN_START,
            end: 'bottom bottom',
            onUpdate: applyStreet,
            onRefresh: applyStreet,
          });
        }
      }

      const setBgY = gsap.quickSetter(els.bgImage, 'y', 'px') as (
        v: number,
      ) => void;
      // Resume from wherever the layer sits (matchMedia context re-runs).
      let curBg = Number(gsap.getProperty(els.bgImage, 'y')) || 0;
      // Snap (not damp) the parallax on the first tick and on any big scroll
      // JUMP — a landing at a restored/deep-linked scroll, or a scrollbar
      // drag. Otherwise curBg would start at 0 (top) and visibly slide down
      // to the correct offset ("background teleports to the top then drifts").
      let bgInit = false;
      // Persist the pan so the boot script can restore it before first paint
      // on a refresh (see layout.tsx). Written only when the rounded value
      // changes; the inline transform GSAP sets each frame takes over once
      // the engine runs, so this only seeds the pre-hydration frame.
      let savedBgY = NaN;
      const persistBgY = (v: number) => {
        const r = Math.round(v);
        if (r === savedBgY) return;
        savedBgY = r;
        try {
          sessionStorage.setItem('neonBgY', String(r));
        } catch {
          /* storage disabled — the flash guard is best-effort */
        }
      };

      // Flat per-frame buffers for the canvas feed — no per-tick allocation.
      const signsBuf: HoloSignState[] = [];
      const heroP = { p: 0 };
      const holoFrame: HoloFrame = { dtMs: 16, hero: null, signs: signsBuf };

      // Only these window-band signs run windowP assembly: on desktop just
      // CONTACT (street is a pinned scrub); on narrow all four (every pin is
      // static, so street + about/timeline all fall back to window mode).
      const bandSigns = narrow ? windowSigns : [contactWin];

      const scrubAbout = scrubs.find((s) => s.key === 'about') ?? null;
      const scrubTimeline = scrubs.find((s) => s.key === 'timeline') ?? null;

      // HUD status from engine state — the deepest sector being (or having
      // been) projected wins, mirroring the mockup. street: any venue
      // started → active; all three done → STABLE.
      const statusLabel = (f: number) => {
        if (contactWin.p > 0.05) {
          return contactWin.p >= 0.999
            ? 'SECTOR B04 · CONTACT STABLE'
            : 'SECTOR B04 · CONTACT PROJECTING';
        }
        let streetOn = 0;
        let streetDone = 1;
        for (const ws of streetWins) {
          streetOn = Math.max(streetOn, ws.p);
          streetDone = Math.min(streetDone, ws.p);
        }
        if (streetOn > 0.05) {
          return streetDone >= 0.999
            ? 'SECTOR B03 · STREET STABLE'
            : 'SECTOR B03 · STREET PROJECTING';
        }
        const tl = scrubTimeline;
        if (tl && tl.shown > 0.001) {
          return tl.fd >= 0.999
            ? 'SECTOR B02 · TIMELINE STABLE'
            : 'SECTOR B02 · TIMELINE PROJECTING';
        }
        const ab = scrubAbout;
        if (ab && ab.shown > 0.001) {
          return ab.fd >= 0.999
            ? 'SECTOR B01 · ABOUT STABLE'
            : 'SECTOR B01 · ABOUT PROJECTING';
        }
        if (f >= 1) return 'SECTOR — STANDBY';
        if (f > 0.002) return 'SECTOR GATE · DEJAYVU WITHDRAWING';
        return 'SECTOR GATE · DEJAYVU STABLE';
      };

      const tick = (_time: number, deltaMS: number) => {
        // Freeze while an overlay locks scroll (react-aria sets
        // overflow:hidden on <html>): layout collapses and would jump the
        // parallax. If a refresh fired during the lock it measured that
        // collapsed layout — redo it on the first unlocked tick.
        if (document.documentElement.style.overflow === 'hidden') {
          wasLocked = true;
          return;
        }
        if (wasLocked) {
          wasLocked = false;
          if (refreshedWhileLocked) {
            refreshedWhileLocked = false;
            ScrollTrigger.refresh();
            return;
          }
        }
        const g = geom;
        if (!g) return;
        const y = window.scrollY;
        const vh = g.vh;

        // READ phase (frame start, before any style writes): live rects for
        // the window titles. These CANNOT ride the refresh cache — hovering
        // a junction row expands it in document flow (grid-rows 0fr→1fr),
        // shifting every row below it mid-transition; stale offsets would
        // paint the hologram names detached from their rows. Four small
        // gBCRs per frame, on a clean layout.
        for (const ws of windowSigns) {
          const r = ws.sign.getBoundingClientRect();
          ws.rect.x = r.left;
          ws.rect.y = r.top;
          ws.rect.w = r.width;
          ws.rect.h = r.height;
        }

        // Background pan: rate-based damping (velocity ∝ remaining distance)
        // so wheel steps glide instead of lurching — but SNAP on the first
        // frame and on jumps larger than a viewport (restore / deep link /
        // scrollbar drag) so the layer never slides in from the top.
        const bgTarget = -clamp01(y / g.docMax) * g.bgMaxPan;
        if (!bgInit || Math.abs(bgTarget - curBg) > vh) {
          bgInit = true;
          curBg = bgTarget;
        } else {
          curBg += (bgTarget - curBg) * DAMP;
        }
        setBgY(curBg);
        persistBgY(curBg);

        const handle = els.holo.current;
        if (handle && handle !== lastHandle) {
          // The lazy import resolved after the last refresh — push the
          // cached geometry so it can rasterise.
          lastHandle = handle;
          if (holoData) handle.refresh(holoData);
        }
        // --- Hero: the DOM mark hides whenever the canvas CAN draw it —
        // NOT gated on f. Gating on f<1 dropped data-holo at f=1 (withdrawal
        // complete but the hero still fills the viewport), popping the full
        // DOM wordmark back in. The canvas simply draws nothing once
        // withdrawn (p≤0), so the mark stays gone as it scrolls off.
        const f = heroST.progress;
        const wantCanvas = !!handle?.heroReady;
        if (wantCanvas !== heroCanvasOn) {
          heroCanvasOn = wantCanvas;
          els.heroCore.toggleAttribute('data-holo', wantCanvas);
        }

        signsBuf.length = 0;

        // --- Pin titles (desktop): drawn at their assembly p the whole time
        // they exist. THREE rect states: while rising toward the pin
        // (progress < preF) and while scrolling off after release
        // (progress >= 1) the sign moves → live gBCR; during the dwell
        // (pinned, stationary) → cached viewRect. At both boundaries live ==
        // cached, so no jump.
        if (!narrow) {
          for (const s of scrubs) {
            if (s.shown <= 0.001) continue;
            const p = s.st ? s.st.progress : 1;
            const stuck = s.st && p >= s.preF - 1e-4 && p < 1;
            let rect = s.viewRect;
            if (!stuck) {
              const r = s.sign.getBoundingClientRect();
              s.liveRect.x = r.left;
              s.liveRect.y = r.top;
              s.liveRect.w = r.width;
              s.liveRect.h = r.height;
              rect = s.liveRect;
            }
            signsBuf.push({ key: s.key, rect, p: s.shown });
          }
          // Street venues (desktop pinned scrub): staggered p from the street
          // trigger; rects were read LIVE at the tick top (hover expands
          // rows in flow, so never a cached pinned rect for street).
          for (const ws of streetWins) {
            if (ws.p > 0.001) {
              signsBuf.push({ key: ws.key, rect: ws.rect, p: ws.p });
            }
          }
        } else {
          // Narrow: pin titles run window-mode too, content pops on own pos.
          for (const s of scrubs) {
            const docTop = s.viewRect.y; // docTop in narrow measure
            const p = windowP(vh, docTop + s.viewRect.h / 2 - y);
            s.shown = p;
            s.fd = p; // no dwell on narrow — STABLE tracks assembly
            if (p > 0.001) {
              s.liveRect.x = s.viewRect.x;
              s.liveRect.w = s.viewRect.w;
              s.liveRect.h = s.viewRect.h;
              s.liveRect.y = docTop - y;
              signsBuf.push({ key: s.key, rect: s.liveRect, p });
            }
            for (const e of s.els) {
              setElOn(e, windowP(vh, e.docTop + e.h / 2 - y) >= e.thr);
            }
          }
        }

        // --- Window-band signs: CONTACT (always) + street (narrow only).
        // Rects were read LIVE at the top of the tick (viewport coords).
        for (const ws of bandSigns) {
          const p = windowP(vh, ws.rect.y + ws.rect.h / 2);
          ws.p = p;
          if (p > 0.001) {
            signsBuf.push({ key: ws.key, rect: ws.rect, p });
          }
        }
        // Contact content rides its title's projection.
        for (const e of contactEls) setElOn(e, contactWin.p >= e.thr);

        // Publish every title's readiness only after all desktop/narrow and
        // window-band progress values are current. A gate restored by the
        // boot script is restrictive on this first synchronous tick; a fresh
        // gate is armed only after the matching readiness state is in place.
        const gatePresent =
          document.documentElement.hasAttribute('data-neon-fx');
        const handleReady = !!handle?.heroReady;
        publishProjectionReadiness(gatePresent || fxArmed || handleReady);
        if (!fxArmed && handleReady) {
          fxArmed = true;
          document.documentElement.setAttribute('data-neon-fx', '');
          try {
            sessionStorage.setItem('neonFx', '1');
          } catch {
            /* best-effort */
          }
        }

        if (handle) {
          const heroLive = wantCanvas && f < 1; // draw the mark only in-band
          if (heroLive || signsBuf.length > 0 || handle.active) {
            heroP.p = 1 - f;
            holoFrame.dtMs = Math.min(deltaMS, 33);
            holoFrame.hero = heroLive ? heroP : null;
            handle.update(holoFrame);
          }
        }

        // --- HUD readout (on-change writes only; fixed-width text).
        const pct = Math.round(clamp01(y / g.docMax) * 100);
        if (pct !== hudPctShown) {
          hudPctShown = pct;
          setHudPct(`PROJ ${String(pct).padStart(3, '0')}%`);
        }
        const label = statusLabel(f);
        if (label !== hudLabelShown) {
          hudLabelShown = label;
          setHudStatus(label);
        }
      };

      const onRefresh = () => {
        if (document.documentElement.style.overflow === 'hidden') {
          refreshedWhileLocked = true;
        }
        measureGeometry(narrow);
      };
      // Fires after every trigger has recomputed, so trackST.start/end are
      // the geometry authority by the time we read them.
      ScrollTrigger.addEventListener('refresh', onRefresh);
      ScrollTrigger.refresh();
      // One synchronous tick before paint (the loader runs in a layout effect):
      // seeds the parallax snap, the content-pop states and the HUD readout
      // for the CURRENT scroll, so a refresh at a scrolled position doesn't
      // flash "SECTOR — STANDBY" or an unpopped section for a frame.
      tick(0, 16);
      gsap.ticker.add(tick);

      // Refresh sources beyond the built-in resize handler: display fonts
      // change sign metrics; junction media growing changes every offset
      // below it.
      document.fonts?.ready
        .then(() => {
          if (alive) ScrollTrigger.refresh();
        })
        .catch(() => {});
      // fonts.ready can resolve BEFORE a lazily-triggered face even starts
      // loading; loadingdone fires when a face actually lands — without it
      // the letter rects (and the holo textures baked from them) can stay
      // frozen on the size-adjusted fallback's metrics.
      const fontsDone = () => {
        if (alive) ScrollTrigger.refresh();
      };
      document.fonts?.addEventListener('loadingdone', fontsDone);
      let roTimer: ReturnType<typeof setTimeout> | undefined;
      let roInit = true;
      const ro = new ResizeObserver(() => {
        if (roInit) {
          roInit = false;
          return;
        }
        clearTimeout(roTimer);
        roTimer = setTimeout(() => {
          if (alive) ScrollTrigger.refresh();
        }, 200);
      });
      ro.observe(els.zone);

      return () => {
        alive = false;
        gsap.ticker.remove(tick);
        ScrollTrigger.removeEventListener('refresh', onRefresh);
        document.fonts?.removeEventListener('loadingdone', fontsDone);
        clearTimeout(roTimer);
        clearTimeout(fxFallback);
        ro.disconnect();
        document.documentElement.removeAttribute('data-neon-fx');
        fxArmed = false;
        releaseProjectionReadiness();
        // Triggers and tweens are reverted by the matchMedia context; the
        // engine-owned attrs/classes must be reset by hand so a breakpoint
        // change starts clean.
        if (heroCanvasOn) {
          heroCanvasOn = false;
          els.heroCore.removeAttribute('data-holo');
        }
        for (const s of scrubs) {
          s.st = null;
          for (const e of s.els) setElOn(e, false);
        }
        streetScrub.st = null;
        for (const e of streetScrub.els) setElOn(e, false);
        for (const e of contactEls) setElOn(e, false);
      };
    },
  );

  return () => mm.revert();
}
