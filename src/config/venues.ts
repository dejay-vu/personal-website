export const VENUES = {
  photos: { label: 'Darkroom', path: '/darkroom' },
  notes: { label: 'Field Notes', path: '/field-notes' },
  projects: { label: 'The Lab', path: '/the-lab' },
} as const;

export type VenueDomain = keyof typeof VENUES;

export const venueSegment = (domain: VenueDomain) =>
  VENUES[domain].path.slice(1);

export const APP_ROUTES = {
  home: '/',
} as const;

const itemPath = (base: string, slug: string) => `${base}/${slug}`;

export const photoPath = (slug: string) => itemPath(VENUES.photos.path, slug);
export const notePath = (slug: string) => itemPath(VENUES.notes.path, slug);
export const projectPath = (slug: string) =>
  itemPath(VENUES.projects.path, slug);
