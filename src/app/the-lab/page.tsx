import { VENUES } from '@/config/venues';

import { createPageMetadata } from '@/lib/seo';

import { HoloSign } from '@/components/ui';

export const metadata = createPageMetadata({
  title: VENUES.projects.label,
  description:
    'Projects by Junhao Zhang (张俊豪), also known as Jay Zhang and DeJay Vu, focused on machine learning systems, GPU programming, and web engineering.',
  path: VENUES.projects.path,
});

export default function TheLab() {
  return (
    <section
      aria-label="the lab"
      className="mx-auto grid min-h-[48svh] w-full max-w-prose place-items-center gap-5 text-center"
    >
      <HoloSign>{VENUES.projects.label}</HoloSign>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-(--neon-dim)">
        <span style={{ fontFamily: 'var(--font-cjk), sans-serif' }}>
          装修中
        </span>{' '}
        · UNDER CONSTRUCTION — OPENING 2026
      </p>
    </section>
  );
}
