export const DEFAULT_PUBLIC_MEDIA_HOSTS = {
  originals: 's3.dejayvu.com',
  transformed: 'resizer.dejayvu.com',
} as const;

export const DEFAULT_PUBLIC_MEDIA_URLS = {
  originals: `https://${DEFAULT_PUBLIC_MEDIA_HOSTS.originals}`,
  transformed: `https://${DEFAULT_PUBLIC_MEDIA_HOSTS.transformed}`,
} as const;
