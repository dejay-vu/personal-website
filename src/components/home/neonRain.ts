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

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
  const frame = () => {
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
      d.y += d.sp;
      d.x -= opts.wind * d.sp * 0.5;
      if (d.y - d.len > height) Object.assign(d, spawn(false));
    }
    raf = requestAnimationFrame(frame);
  };

  let resizeTimer: ReturnType<typeof setTimeout>;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(size, 180);
  };

  size();
  raf = requestAnimationFrame(frame);
  window.addEventListener('resize', onResize);

  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(resizeTimer);
    window.removeEventListener('resize', onResize);
  };
}
