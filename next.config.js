function getHostname(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname;
  } catch {
    return value.replace(/^https?:\/\//, '').split('/')[0] || null;
  }
}

const { legacyRouteRedirects } = require('./config/legacy-route-redirects');

const imageHostnames = Array.from(
  new Set(
    [
      'resizer.dejayvu.com',
      's3.dejayvu.com',
      'upload.wikimedia.org',
      'avatars.githubusercontent.com',
      getHostname(process.env.NEXT_PUBLIC_CLOUDFRONT_RESIZER_URL),
      getHostname(process.env.NEXT_PUBLIC_CLOUDFRONT_S3_URL),
    ].filter(Boolean),
  ),
);

const isProduction = process.env.NODE_ENV === 'production';
const imageSources = imageHostnames
  .map((hostname) => `https://${hostname}`)
  .concat('https://*.cloudfront.net');
const devConnectSources = isProduction
  ? []
  : ['http://localhost:*', 'https://localhost:*', 'ws://localhost:*'];

const contentSecurityPolicy = [
  ['default-src', "'self'"],
  ['base-uri', "'self'"],
  ['object-src', "'none'"],
  ['frame-ancestors', "'none'"],
  ['form-action', "'self'"],
  ['img-src', "'self'", 'data:', 'blob:', ...imageSources],
  ['font-src', "'self'", 'data:'],
  ['style-src', "'self'", "'unsafe-inline'"],
  [
    'script-src',
    "'self'",
    "'unsafe-inline'",
    ...(isProduction ? [] : ["'unsafe-eval'"]),
    'https://va.vercel-scripts.com',
  ],
  [
    'connect-src',
    "'self'",
    ...devConnectSources,
    ...imageSources,
    'https://*.amazonaws.com',
    'https://va.vercel-scripts.com',
    'https://vitals.vercel-insights.com',
    'https://*.vercel-insights.com',
  ],
  ['worker-src', "'self'", 'blob:'],
  ['manifest-src', "'self'"],
  ...(isProduction ? [['upgrade-insecure-requests']] : []),
]
  .map(([directive, ...sources]) =>
    sources.length > 0 ? `${directive} ${sources.join(' ')}` : directive,
  )
  .join('; ');

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: contentSecurityPolicy,
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
  images: {
    minimumCacheTTL: 31536000,
    dangerouslyAllowSVG: true,
    // Bound the srcset widths media images request through the CloudFront
    // resizer (via mediaImageLoader) so the CDN variant space stays small.
    deviceSizes: [640, 828, 1080, 1200, 1920, 2048],
    imageSizes: [64, 128, 256, 480],
    remotePatterns: imageHostnames.map((hostname) => ({
      protocol: 'https',
      hostname,
      port: '',
    })),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return legacyRouteRedirects;
  },
};

// Sentry — wraps the Next.js config to instrument the app and upload source
// maps at build time. Browser events are tunnelled through `/monitoring`
// (same-origin), so the strict CSP above needs no Sentry ingest origin and
// ad-blockers can't drop client-side reports.
const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(nextConfig, {
  org: 'dejayvu',
  project: 'sentry-claret-clock',

  // Client tracing is intentionally disabled in instrumentation-client.ts.
  suppressOnRouterTransitionStartWarning: true,

  // Only print source-map upload logs in CI.
  silent: !process.env.CI,

  // Upload a wider set of client source maps for readable stack traces.
  widenClientFileUpload: true,

  // Proxy browser → Sentry requests through a same-origin route.
  tunnelRoute: '/monitoring',

  webpack: {
    // Auto-instrument Vercel Cron Monitors.
    automaticVercelMonitors: true,

    // Strip Sentry debug logging from webpack builds. Client tracing is
    // disabled at runtime in instrumentation-client.ts so server and edge
    // tracing remain available under Turbopack.
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
