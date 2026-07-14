import assert from 'node:assert/strict';
import test from 'node:test';

import { legacyRouteRedirects } from '../../config/legacy-route-redirects.js';

test('isolates retired public routes behind direct permanent redirects', () => {
  assert.deepEqual(legacyRouteRedirects, [
    {
      source: '/thoughts',
      destination: '/field-notes',
      permanent: true,
    },
    {
      source: '/thoughts/:path*',
      destination: '/field-notes/:path*',
      permanent: true,
    },
    {
      source: '/gallery',
      destination: '/darkroom',
      permanent: true,
    },
    {
      source: '/gallery/:path*',
      destination: '/darkroom/:path*',
      permanent: true,
    },
    {
      source: '/projects',
      destination: '/the-lab',
      permanent: true,
    },
    {
      source: '/projects/slurmdeck-tui.svg',
      destination: '/assets/slurmdeck-tui.svg',
      permanent: true,
    },
    {
      source: '/projects/:path*',
      destination: '/the-lab/:path*',
      permanent: true,
    },
  ]);

  assert.ok(legacyRouteRedirects.every(({ permanent }) => permanent));
  assert.equal(
    new Set(legacyRouteRedirects.map(({ source }) => source)).size,
    legacyRouteRedirects.length,
  );
});
