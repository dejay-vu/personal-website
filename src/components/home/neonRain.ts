export type RainOptions = {
  /** number of concurrent drops */
  count: number;
  /** base fall speed in px/frame */
  speed: number;
  /** base streak length in px */
  len: number;
  /** base line width in px */
  width: number;
  /** base head opacity (0-1) */
  alpha: number;
  /** horizontal drift factor (wind) */
  wind: number;
  /** 0-1 chance a drop is tinted neon rather than cool white */
  tint: number;
  /** cap backing-store density independently from CSS size */
  maxDpr?: number;
  /** cap expensive canvas draws while keeping native rAF scheduling */
  maxFps?: number;
  /** ignore mobile browser-chrome height changes while width is stable */
  ignoreSmallHeightResizes?: boolean;
};

type Drop = {
  x: number;
  y: number;
  len: number;
  sp: number;
  w: number;
  a: number;
  tint: string;
};

/**
 * Realistic layered rain: each drop is a gradient streak (faint tail → bright
 * head) with slight wind, randomized length/speed, and an occasional neon tint
 * picked up from the city glow. Returns a cleanup function that cancels the rAF
 * loop and detaches the resize listener.
 */
export function startRain(
  canvas: HTMLCanvasElement,
  opts: RainOptions,
  reduce = false,
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr ?? 2);
  const count = reduce ? Math.round(opts.count * 0.4) : opts.count;
  let width = 0;
  let height = 0;
  let drops: Drop[] = [];

  const spawn = (initial: boolean): Drop => {
    const sp = opts.speed * (0.7 + Math.random() * 0.7);
    return {
      x: Math.random() * width,
      y: initial ? Math.random() * height : -20 - Math.random() * 80,
      len: opts.len * (0.6 + Math.random() * 0.9),
      sp,
      w: opts.width * (0.6 + Math.random() * 0.8),
      a: opts.alpha * (0.5 + Math.random() * 0.6),
      tint:
        Math.random() < opts.tint
          ? Math.random() < 0.5
            ? '255,46,136'
            : '53,230,255'
          : '198,224,255',
    };
  };

  const size = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drops = Array.from({ length: count }, () => spawn(true));
  };

  let raf = 0;
  const draw = (step = 1) => {
    ctx.clearRect(0, 0, width, height);
    for (const d of drops) {
      const x2 = d.x - opts.wind * d.len;
      const y2 = d.y + d.len;
      const gradient = ctx.createLinearGradient(d.x, d.y, x2, y2);
      gradient.addColorStop(0, `rgba(${d.tint},0)`);
      gradient.addColorStop(1, `rgba(${d.tint},${d.a})`);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = d.w;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      d.y += d.sp * step;
      d.x -= opts.wind * d.sp * 0.5 * step;
      if (d.y - d.len > height) Object.assign(d, spawn(false));
    }
  };

  const frameInterval = opts.maxFps ? 1000 / opts.maxFps : 0;
  let lastFrame = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!frameInterval) {
      draw();
      return;
    }
    const elapsed = now - lastFrame;
    if (elapsed < frameInterval) return;
    lastFrame = now - (elapsed % frameInterval);
    draw(Math.min(3, elapsed / (1000 / 60)));
  };

  let resizeTimer: ReturnType<typeof setTimeout>;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // Mobile address bars resize only the viewport height while a touch
      // scroll is in flight. The CSS canvas can scale over that small delta;
      // avoid reallocating the full bitmap and respawning every drop.
      if (
        opts.ignoreSmallHeightResizes &&
        Math.abs(window.innerWidth - width) < 2 &&
        Math.abs(window.innerHeight - height) < 160
      ) {
        return;
      }
      size();
      if (reduce) draw(0);
    }, 180);
  };

  size();
  if (reduce) {
    draw(0);
  } else {
    raf = requestAnimationFrame(frame);
  }
  window.addEventListener('resize', onResize);

  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(resizeTimer);
    window.removeEventListener('resize', onResize);
    // Clearing the backing store removes a frozen final frame when motion is
    // disabled and releases the hidden layer's bitmap memory on mode changes.
    canvas.width = 0;
    canvas.height = 0;
  };
}
