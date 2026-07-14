import type { Metadata, Viewport } from 'next';

import { MOBILE_LITE_MEDIA_QUERY } from '@/config/media';
import { APP_ROUTES, VENUES } from '@/config/venues';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

import { CjkDisplayFont, DisplayFont, LusitanaFont } from '@/styles/fonts';
import '@/styles/globals.css';

import { absoluteUrl, seoConfig } from '@/lib/seo';

import { AppShell } from '@/components/AppShell';
import Providers from '@/components/Providers';
import { PhotoModalCoordinator } from '@/components/photos/modal/PhotoModalCoordinator';

export const metadata: Metadata = {
  title: {
    template: `%s | ${seoConfig.siteName}`,
    default: seoConfig.primaryTitle,
  },
  metadataBase: new URL(seoConfig.siteUrl),
  applicationName: seoConfig.siteName,
  authors: [
    {
      url: seoConfig.siteUrl,
      name: seoConfig.personName,
    },
  ],
  creator: seoConfig.personName,
  publisher: seoConfig.personName,
  generator: 'nextjs, react',
  description: seoConfig.description,
  keywords: [
    'Junhao Zhang',
    '张俊豪',
    'Jay Zhang',
    'DeJay Vu',
    'dejayvu',
    'Machine Learning Software Engineer',
    'GPU programming',
    'CUDA',
    'advanced computing systems',
    'photography',
    'hiking',
  ],
  alternates: {
    canonical: absoluteUrl(APP_ROUTES.home),
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: seoConfig.primaryTitle,
    description: seoConfig.description,
    url: seoConfig.siteUrl,
    siteName: seoConfig.siteName,
    images: [seoConfig.defaultImage],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: seoConfig.primaryTitle,
    description: seoConfig.description,
    images: [seoConfig.defaultImage.url],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
    },
  },
};

export const viewport: Viewport = {
  // Committed dark-neon site-wide.
  themeColor: '#0b0714',
};

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal?: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`neon-site dark motion-safe:scroll-smooth ${DisplayFont.variable} ${CjkDisplayFont.variable}`}
      data-theme="dark"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script
          id="endless-scroll-restoration"
          dangerouslySetInnerHTML={{
            __html: `
try {
  var path = window.location.pathname;
  // Darkroom/Field Notes manage their own endless-scroll restoration.
  // Everything else (incl. the home landing) uses NATIVE restoration so a
  // refresh preserves the exact scroll position and honours the URL hash.
  // Set it EXPLICITLY (not just omit) so a value left at 'manual' by a
  // prior feed visit can't leak onto the home page.
  if (path === '${VENUES.photos.path}' || path === '${VENUES.notes.path}') {
    window.history.scrollRestoration = 'manual';
  } else {
    window.history.scrollRestoration = 'auto';
  }
  // Scroll restoration must be INSTANT: with the site's CSS smooth
  // scrolling the browser ANIMATES the restore, and refreshing again
  // mid-animation saves the in-flight position — repeated refreshes then
  // creep the page upward a step at a time. Force instant during load,
  // hand back to the stylesheet shortly after.
  document.documentElement.style.scrollBehavior = 'auto';
  window.addEventListener('load', function () {
    setTimeout(function () {
      document.documentElement.style.scrollBehavior = '';
    }, 150);
  });
  // Restore the home parallax offset BEFORE first paint (the engine saves it
  // to sessionStorage each frame). Native restoration puts the scroll back
  // pre-paint, but the background transform is JS-set, so without this the
  // backdrop flashes at the top for the pre-hydration frame. Skip under
  // reduced motion (no parallax there — the backdrop stays static).
  if (path === '${APP_ROUTES.home}') {
    var el = document.documentElement;
    var st = el.style;
    var mobileLite = window.matchMedia('${MOBILE_LITE_MEDIA_QUERY}').matches;
    // Restore the HUD readout so it never flashes a wrong/blank value.
    var hp = sessionStorage.getItem('neonHudPct');
    var hs = sessionStorage.getItem('neonHudStatus');
    if (hp !== null) st.setProperty('--neon-hud-pct', JSON.stringify(hp));
    if (hs !== null) st.setProperty('--neon-hud-status', JSON.stringify(hs));
    // Restore the active HUD sector highlight.
    var sector = sessionStorage.getItem('neonSector');
    if (sector) el.setAttribute('data-neon-sector', sector);
    if (!mobileLite && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Restore the parallax offset (reduced motion has no parallax).
      var bgY = sessionStorage.getItem('neonBgY');
      if (bgY !== null) st.setProperty('--neon-bg-y', bgY + 'px');
      // Re-arm the projection gate: without it the SSR page paints every
      // section fully lit for the pre-hydration frame, then blinks off when
      // the engine arms the gate ("about flashes at an unprojected spot").
      // The engine drops it again if the canvas can't come up (safety net).
      if (sessionStorage.getItem('neonFx') === '1') {
        el.setAttribute('data-neon-fx', '');
      }
    } else {
      // The mobile/reduced homepage is DOM-rendered and has no parallax or
      // projection canvas. Never restore a desktop gate into that first frame.
      el.removeAttribute('data-neon-fx');
      st.removeProperty('--neon-bg-y');
    }
  }
} catch (_) {}
            `.trim(),
          }}
        />
      </head>
      <body
        className={`${LusitanaFont.className} text-pretty antialiased`}
        suppressHydrationWarning
      >
        <Providers>
          <PhotoModalCoordinator>
            <AppShell>{children}</AppShell>
            {modal}
          </PhotoModalCoordinator>
          <SpeedInsights />
          <Analytics />
        </Providers>
      </body>
    </html>
  );
}
