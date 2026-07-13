// Phones and coarse-pointer tablets use the stable, low-power homepage.
// Keep this string shared by pre-paint boot logic and client effects so the
// FX gate can never be restored for a device that will not mount the canvas.
export const MOBILE_LITE_MEDIA_QUERY =
  '(max-width: 720px), (hover: none), (pointer: coarse)';

export const DESKTOP_FX_MEDIA_QUERY =
  '(min-width: 721px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';
