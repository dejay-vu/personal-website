import clsx from 'clsx';

// The deep-page venue title in the home page's holo material — one warm-white
// projection light for every sign (no per-hue colour). CSS-only stepped
// materialise on load; static under reduced motion. See globals.css .holo-sign.
export function HoloSign({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <h1 className={clsx('holo-sign', className)}>{children}</h1>;
}
