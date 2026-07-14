// The only compatibility boundary for retired public routes. Keep these
// mappings direct, permanent, and independent from application domain models.
const legacyRouteRedirects = [
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
];

module.exports = { legacyRouteRedirects };
