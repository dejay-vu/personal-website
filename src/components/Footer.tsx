import { APP_ROUTES, VENUES, projectPath } from '@/config/venues';

import { RouteLink } from '@/components/ui/RouteLink';

const FOOTER_LINKS = [
  { href: APP_ROUTES.home, label: 'Home' },
  { href: VENUES.notes.path, label: VENUES.notes.label },
  { href: VENUES.photos.path, label: VENUES.photos.label },
  { href: VENUES.projects.path, label: VENUES.projects.label },
  { href: projectPath('slurmdeck'), label: 'SlurmDeck' },
] as const;

// Deep-page footer: the home page's mono sign-off line. Owner tooling remains
// available only through its known protected route, not public chrome.
export default function Footer() {
  return (
    <div className="relative z-2 w-full">
      <footer className="flex w-full flex-col items-center gap-5 pb-10 pt-8 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-(--neon-dim)">
        <nav aria-label="Site" data-footer-nav>
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-6">
            {FOOTER_LINKS.map(({ href, label }) => (
              <li key={href}>
                <RouteLink
                  href={href}
                  progressLabel={`Loading ${label}`}
                  className="transition-colors hover:text-(--neon-ink) focus-visible:text-(--neon-ink) focus-visible:outline-none"
                >
                  {label}
                </RouteLink>
              </li>
            ))}
          </ul>
        </nav>
        <p>
          © 2026 JUNHAO ZHANG ·{' '}
          <span style={{ fontFamily: 'var(--font-cjk), sans-serif' }}>
            张俊豪
          </span>{' '}
          — ALL RIGHTS RESERVED
        </p>
      </footer>
    </div>
  );
}
