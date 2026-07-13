import { NeonWordmark } from '@/components/ui';
import { RouteLink } from '@/components/ui/RouteLink';

// Minimal top strip for the deep-page shell: small wordmark home link on the
// left, a contextual back link on the right. Not sticky — reading space wins.
export function NeonTopStrip({
  backHref,
  backLabel,
}: {
  backHref: string;
  backLabel: string;
}) {
  return (
    <header className="relative z-2 flex w-full items-center justify-between px-6 py-4 sm:px-10">
      <RouteLink
        href="/"
        aria-label="Home — DEJAYVU"
        progressLabel="Loading home"
        className="text-[1.3rem] leading-none outline-(--cyan) focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        <NeonWordmark />
      </RouteLink>
      <RouteLink
        href={backHref}
        progressLabel={`Loading ${backLabel.toLowerCase()}`}
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-(--neon-dim) outline-(--cyan) transition-[color,text-shadow] duration-150 hover:text-(--cyan) hover:[text-shadow:0_0_10px_rgba(53,230,255,0.6)] focus-visible:outline-2 focus-visible:outline-offset-4 motion-reduce:transition-none"
      >
        ← {backLabel}
      </RouteLink>
    </header>
  );
}
