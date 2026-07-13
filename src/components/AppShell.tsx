'use client';

import { useSelectedLayoutSegments } from 'next/navigation';

import { APP_ROUTES, VENUES, venueSegment } from '@/config/venues';
import clsx from 'clsx';

import Footer from '@/components/Footer';
import { HoloReturn } from '@/components/HoloReturn';
import { NeonTopStrip } from '@/components/NeonTopStrip';

// Route-aware chrome. The home route (`/`) is the full-bleed committed-dark
// neon single page and supplies its own HUD nav + footer. Public deep pages
// get the holo shell (quiet ambience + a fixed top-right "← GATE" return +
// footer; the page carries its own big holo title). Admin keeps the legacy
// NeonTopStrip (its wordmark neutralized via `.app-neutral`).
//
// The subtlety: opening a photo overlay is an intercepting-route soft
// navigation, so `usePathname()` becomes the overlay URL (e.g. /darkroom/<slug>)
// while the page BEHIND is unchanged. Keying chrome off the pathname would (a)
// flip chrome on over the home page — remounting it, bg reset — and (b) strip
// chrome off a deep grid page, reflowing it behind the backdrop. So we key off
// the DEFAULT slot's segments, which reflect the page actually rendered behind
// the overlay (the interceptor only advances the @modal slot). This is stable
// across an overlay open/close, so chrome never toggles and `children` never
// re-parents: home stays chrome-less, deep pages keep their padding intact.
export function AppShell({ children }: { children: React.ReactNode }) {
  const segments = useSelectedLayoutSegments();
  const [section, sub] = segments;

  const isHome = segments.length === 0;
  const isAdmin = section === 'admin';
  const showChrome = !isHome;

  // On a detail page (section + a sub-segment) the return goes up to its venue
  // list; on a list/other page it goes to the gate (home).
  const back =
    section === venueSegment('notes') && sub
      ? {
          href: VENUES.notes.path,
          label: VENUES.notes.label.toUpperCase(),
        }
      : section === venueSegment('photos') && sub
        ? {
            href: VENUES.photos.path,
            label: VENUES.photos.label.toUpperCase(),
          }
        : { href: APP_ROUTES.home, label: 'GATE' };

  return (
    <div
      className={clsx(
        showChrome
          ? 'flex min-h-dvh flex-col items-center justify-between'
          : 'contents',
        isAdmin && 'app-neutral',
      )}
    >
      {showChrome && !isAdmin && (
        <div aria-hidden="true" className="neon-ambience" />
      )}
      {showChrome &&
        (isAdmin ? (
          <NeonTopStrip backHref={APP_ROUTES.home} backLabel="HOME" />
        ) : (
          <HoloReturn href={back.href} label={back.label} />
        ))}
      <main
        className={
          showChrome
            ? clsx(
                'min-h-0 w-full flex-1 px-8 pb-6 sm:px-16 lg:px-32',
                // Admin keeps the in-flow top strip; deep pages have only the
                // fixed return link, so lift the content clear of it.
                isAdmin ? 'pt-4' : 'pt-14 sm:pt-16',
              )
            : 'contents'
        }
      >
        {children}
      </main>
      {showChrome && <Footer />}
    </div>
  );
}
