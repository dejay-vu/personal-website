import type { MetadataRoute } from 'next';

import { seoConfig } from '@/lib/seo';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: seoConfig.siteName,
    short_name: seoConfig.siteName,
    description: seoConfig.description,
    start_url: '/',
    display: 'browser',
    background_color: '#f7f7f7',
    theme_color: '#f7f7f7',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
