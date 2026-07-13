// The HOLO layer: holographic slice assembly on a viewport-fixed 2D canvas.
// Every projected element (the hero wordmark, the section signs, the venue
// names) is rasterised ONCE per refresh into three plates — the mockup's
// exact material: warm-white fill with the projection glow BAKED IN via
// shadowBlur, plus flat magenta/cyan plates for chromatic aberration — then
// composited per frame as horizontal slices. Assembly is a pure function of
// the caller's progress p: each slice locks in with a small stagger,
// jittering (and, for the hero, peeling upward) while unstable, so scrolling
// back replays the exact disassembly. Only the shimmer/registration glitch
// rides real time. No WebGL, no per-frame filters, no rAF of its own: the
// scroll engine's ticker calls update() and the layer renders only while
// something is mid-assembly (one clearing frame after going idle).

export type HoloRect = { x: number; y: number; w: number; h: number };

export type HoloSignKey =
  | 'about'
  | 'timeline'
  | 'street0'
  | 'street1'
  | 'street2'
  | 'contact';

export type HoloSignState = {
  key: HoloSignKey;
  rect: HoloRect; // viewport rect — refresh-cached x/w/h, per-frame math y
  p: number; // assembly progress (pin scrub or window band)
};

export type HoloFrame = {
  dtMs: number; // caller-clamped ≤33 — drives the shimmer clock only
  hero: { p: number } | null; // 1 assembled … 0 withdrawn; null when idle
  signs: HoloSignState[]; // only signs mid-assembly (0 < p < 1)
};

export type HoloRefreshData = {
  dpr: number; // min(devicePixelRatio, 2)
  heroLetters: HoloRect[]; // ALL wordmark letters, pinned viewport rects
  signRects: Partial<Record<HoloSignKey, HoloRect>>;
};

export type HoloHandle = {
  /** True while the last update drew something (the engine keeps feeding
   *  frames until one clearing render has parked the canvas). */
  readonly active: boolean;
  /** True once the hero textures exist in the REAL display font — the
   *  engine gates the DOM wordmark swap on this. */
  readonly heroReady: boolean;
  update(frame: HoloFrame): void;
  refresh(data: HoloRefreshData): void;
  destroy(): void;
};

export type HoloOptions = {
  heroLetterEls: HTMLElement[];
  signEls: Partial<Record<HoloSignKey, HTMLElement>>;
  narrow: boolean; // cheaper slice count on small screens
};

// The mockup's exact material palette: one warm white, one projection glow,
// two aberration channels. Every hologram burns the same light.
const WHITE = 'rgba(244,239,255,0.96)';
const GLOW = 'rgba(154,138,196,0.9)'; // --beam at 0.9
const GLOW_BLUR = 13;
const MAG = 'rgba(255,46,136,0.55)';
const CYA = 'rgba(53,230,255,0.55)';

const SIGN_KEYS: HoloSignKey[] = [
  'about',
  'timeline',
  'street0',
  'street1',
  'street2',
  'contact',
];

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

// Deterministic hash noise (the registration glitch must not consume real
// randomness: assembly replays identically on every scrub pass).
const rnd = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

type Variant = 'white' | 'mag' | 'cya';

// One projected element: three baked plates + draw origin (the padded
// rect's top-left, viewport coords — signs are re-anchored per frame).
type HoloTex = {
  white: HTMLCanvasElement;
  mag: HTMLCanvasElement;
  cya: HTMLCanvasElement;
  w: number; // padded size, CSS px
  h: number;
  x: number; // draw origin, viewport coords
  y: number;
  pad: number;
  idx: number; // glitch seed, stable per element
};

// A glyph run ready to paint. Placement replicates the browser's own inline
// layout: the font bounding box (ascent+descent from measureText, same
// engine, same font) is centred in the letter's line box via half-leading
// and the glyphs sit on the resulting alphabetic baseline — canvas ink then
// lands exactly on the DOM ink. ('top'-baseline fallback for engines
// without fontBoundingBox metrics.)
type GlyphRun = {
  text: string;
  font: string;
  probe: string; // primary family only — the fonts.check() readiness probe
  x: number;
  y: number; // baseline y ('alphabetic') or em-top y ('top' fallback)
  baseline: 'alphabetic' | 'top';
  lsPx: number;
};

const runFor = (
  el: HTMLElement,
  r: HoloRect,
  measure: CanvasRenderingContext2D,
): GlyphRun => {
  const cs = getComputedStyle(el);
  const fs = parseFloat(cs.fontSize) || r.h;
  const lsPx = parseFloat(cs.letterSpacing) || 0;
  const text = (el.textContent ?? '').trim();
  const font = `${cs.fontStyle} ${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
  const probe = `${fs}px ${cs.fontFamily.split(',')[0].trim()}`;
  measure.font = font;
  const m = measure.measureText(text);
  const asc = m.fontBoundingBoxAscent;
  const desc = m.fontBoundingBoxDescent;
  const hasBox = typeof asc === 'number' && typeof desc === 'number';
  return {
    text,
    font,
    probe,
    x: r.x,
    y: hasBox
      ? r.y + (r.h - (asc + desc)) / 2 + asc // half-leading + baseline
      : r.y + (r.h - fs) / 2, // em box centred in the line box
    baseline: hasBox ? 'alphabetic' : 'top',
    lsPx,
  };
};

export function createHolo(host: HTMLElement, opts: HoloOptions): HoloHandle {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  host.appendChild(canvas);

  const SL = opts.narrow ? 10 : 16;
  let vw = 0;
  let vh = 0;
  let dpr = 1;
  let t = 0; // shimmer clock (seconds)
  let dirty = false;
  let liveShown = -1;
  let destroyed = false;
  let fontsReady = !document.fonts;
  let data: HoloRefreshData | null = null;
  let heroTex: HoloTex | null = null;
  const signTex: Partial<Record<HoloSignKey, HoloTex>> = {};

  const canTrack =
    !!ctx && 'letterSpacing' in (ctx as unknown as Record<string, unknown>);

  const drawRun = (g: CanvasRenderingContext2D, run: GlyphRun) => {
    if (canTrack || run.lsPx === 0 || run.text.length <= 1) {
      g.fillText(run.text, run.x, run.y);
      return;
    }
    // Tracked fallback: advance char by char with the DOM's letter-spacing.
    let cx = run.x;
    for (const ch of run.text) {
      g.fillText(ch, cx, run.y);
      cx += g.measureText(ch).width + run.lsPx;
    }
  };

  // Bake one plate — the mockup's renderTex, verbatim material: white pass
  // with the projection glow as a baked shadow, flat chromatic plates.
  const paint = (
    runs: GlyphRun[],
    ox: number,
    oy: number,
    w: number,
    h: number,
    variant: Variant,
  ) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, -ox * dpr, -oy * dpr);
    for (const run of runs) {
      g.font = run.font;
      g.textBaseline = run.baseline;
      if (canTrack) {
        (
          g as CanvasRenderingContext2D & { letterSpacing: string }
        ).letterSpacing = `${run.lsPx}px`;
      }
      if (variant === 'white') {
        g.fillStyle = WHITE;
        g.shadowColor = GLOW;
        g.shadowBlur = GLOW_BLUR;
        drawRun(g, run);
        g.shadowBlur = 0;
      } else {
        g.fillStyle = variant === 'mag' ? MAG : CYA;
        drawRun(g, run);
      }
    }
    return c;
  };

  const bake = (
    runs: GlyphRun[],
    bounds: HoloRect,
    pad: number,
    idx: number,
  ): HoloTex => {
    const x = bounds.x - pad;
    const y = bounds.y - pad;
    const w = bounds.w + pad * 2;
    const h = bounds.h + pad * 2;
    return {
      white: paint(runs, x, y, w, h, 'white'),
      mag: paint(runs, x, y, w, h, 'mag'),
      cya: paint(runs, x, y, w, h, 'cya'),
      w,
      h,
      x,
      y,
      pad,
      idx,
    };
  };

  // Never bake with a fallback face: a size-adjusted fallback shifts every
  // advance a few px, and the engine's cached rects were measured on the
  // REAL font — the plates would land visibly off. Until check() passes the
  // texture stays unbuilt, heroReady stays false and the DOM (which always
  // renders correctly) stays visible; the engine's font-driven refresh
  // re-rasters once the face lands. Probe the PRIMARY family only: the
  // computed list also names next/font local() fallbacks stuck in 'error'
  // state, which make a full-list check() false forever.
  const fontUsable = (probe: string, text: string) => {
    try {
      return document.fonts ? document.fonts.check(probe, text) : true;
    } catch {
      return true;
    }
  };

  const raster = () => {
    if (!ctx || !data || !fontsReady || destroyed) return;
    const measure = document.createElement('canvas').getContext('2d');
    if (!measure) return;
    // Hero: all letters into one union texture — uniform projection light,
    // exactly the mockup's hero (no per-letter hues, no dead tubes).
    const rects = data.heroLetters;
    if (rects.length > 0 && opts.heroLetterEls.length === rects.length) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      const runs: GlyphRun[] = [];
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (r.w <= 0 || r.h <= 0) continue;
        runs.push(runFor(opts.heroLetterEls[i], r, measure));
        x0 = Math.min(x0, r.x);
        y0 = Math.min(y0, r.y);
        x1 = Math.max(x1, r.x + r.w);
        y1 = Math.max(y1, r.y + r.h);
      }
      if (
        runs.length > 0 &&
        fontUsable(runs[0].probe, runs.map((r) => r.text).join(''))
      ) {
        const fs = parseFloat(runs[0].font) || 100;
        heroTex = bake(
          runs,
          { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
          Math.ceil(fs * 0.3),
          0,
        );
      }
    }
    // Signs: one word each, same projection light for every one of them.
    SIGN_KEYS.forEach((key, k) => {
      const el = opts.signEls[key];
      const r = data?.signRects[key];
      if (!el || !r || r.w <= 0 || r.h <= 0) return;
      const run = runFor(el, r, measure);
      if (!fontUsable(run.probe, run.text)) return;
      const fs = parseFloat(run.font) || 48;
      signTex[key] = bake([run], r, Math.ceil(fs * 0.3), k + 1);
    });
  };

  if (document.fonts) {
    document.fonts.ready
      .then(() => {
        fontsReady = true;
        raster();
      })
      .catch(() => {
        fontsReady = true;
        raster();
      });
  }

  const setLive = (n: number) => {
    if (n !== liveShown) {
      liveShown = n;
      host.dataset.live = String(n);
    }
  };

  // The mockup's slice compositor: per-slice settle stagger, jitter while
  // unstable, sparse registration glitch, chromatic plates at ±2.2px,
  // shimmer on the white pass. At p=1 this settles into the LIVING resting
  // look — every title stays on the canvas at all times, so there is no
  // separate DOM "steady" state to differ from (the reason the 0%↔1% jump
  // is gone). No scanline.
  const drawSlices = (tex: HoloTex, p: number, lift: boolean) => {
    const g = ctx!;
    const sh = tex.h / SL;
    for (let i = 0; i < SL; i++) {
      const sp = clamp01((p - i * 0.02) / 0.16);
      if (sp <= 0) continue;
      const reg =
        rnd(Math.floor(t * 6), tex.idx * 31 + i) > 0.977
          ? (rnd(Math.floor(t * 13), i) - 0.5) * 10
          : 0;
      const jit =
        (1 - sp) * (rnd(i, Math.floor(t * 9) + tex.idx) - 0.5) * 34 + reg;
      const liftY = lift ? -(1 - sp) * 46 : 0;
      const sy = i * sh * dpr;
      const sHh = sh * dpr;
      const dy = tex.y + i * sh + liftY;
      g.globalAlpha = sp * 0.5;
      g.drawImage(
        tex.mag,
        0,
        sy,
        tex.w * dpr,
        sHh,
        tex.x + jit - 2.2,
        dy,
        tex.w,
        sh,
      );
      g.drawImage(
        tex.cya,
        0,
        sy,
        tex.w * dpr,
        sHh,
        tex.x + jit + 2.2,
        dy,
        tex.w,
        sh,
      );
      g.globalAlpha = sp * (0.9 + 0.1 * Math.sin(t * 22 + i * 0.7));
      g.drawImage(
        tex.white,
        0,
        sy,
        tex.w * dpr,
        sHh,
        tex.x + jit,
        dy,
        tex.w,
        sh,
      );
    }
    g.globalAlpha = 1;
  };

  const update = (frame: HoloFrame) => {
    if (destroyed || !ctx) return;
    t += frame.dtMs / 1000;
    const hero = frame.hero && heroTex ? frame.hero : null;
    let drawn = 0;
    const shows = (hero && hero.p > 0.0005) || frame.signs.length > 0;
    if (!shows) {
      if (dirty) {
        ctx.clearRect(0, 0, vw, vh); // one clearing frame, then park
        dirty = false;
      }
      setLive(0);
      return;
    }
    ctx.clearRect(0, 0, vw, vh);
    if (hero && heroTex) {
      drawSlices(heroTex, hero.p, true);
      drawn++;
    }
    for (const s of frame.signs) {
      const tex = signTex[s.key];
      if (!tex) continue;
      if (s.rect.y > vh + 80 || s.rect.y + s.rect.h < -80) continue;
      // Re-anchor to the engine's frame rect (window-mode signs move with
      // the page; pinned signs sit still — same math either way).
      tex.x = s.rect.x - tex.pad;
      tex.y = s.rect.y - tex.pad;
      drawSlices(tex, s.p, false);
      drawn++;
    }
    dirty = drawn > 0;
    setLive(drawn);
  };

  const refresh = (d: HoloRefreshData) => {
    if (destroyed || !ctx) return;
    data = d;
    dpr = d.dpr;
    vw = window.innerWidth;
    vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = false; // the resize cleared the bitmap
    raster();
  };

  return {
    get active() {
      return dirty;
    },
    get heroReady() {
      return heroTex !== null;
    },
    update,
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      canvas.remove();
    },
  };
}
