import { Lusitana } from 'next/font/google';
import localFont from 'next/font/local';

export const LusitanaFont = Lusitana({
  weight: ['400', '700'],
  subsets: ['latin'],
});

// Saiba 45 — cyberpunk techno display face for the neon home (hero wordmark +
// section titles). Self-hosted (CC / Free-for-Commercial-Use), subset to ASCII
// (~3.8KB). Single design weight, so request 400 in CSS.
// display: 'block' (not 'swap') — the titles are meaningless in a fallback
// face (they read as "plain font" for a frame on refresh); the tiny,
// preloaded subset makes the FOIT window imperceptible, and the hero's
// invisible period coincides with the canvas becoming ready, so it swaps
// straight to the hologram.
export const DisplayFont = localFont({
  src: './Saiba45.woff2',
  weight: '400',
  display: 'block',
  variable: '--font-display',
});

// Chinese display face for the neon signage: 张俊豪 (footers) plus the
// junction tags 随笔 / 暗房 / 实验室.
// Smiley Sans (得意黑) — bold, oblique — subset to only the glyphs used
// (~3KB; regenerate via pyftsubset --text='…' --flavor=woff2).
export const CjkDisplayFont = localFont({
  src: './SmileySans-cn-subset.woff2',
  weight: '700',
  display: 'block',
  variable: '--font-cjk',
});
