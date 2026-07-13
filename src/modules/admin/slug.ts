import { toSlug } from '@/lib/slug';

import { AdminDomainError } from './errors';

export function ensureAdminSlug(value: string, field: string) {
  const slug = toSlug(value);

  if (!slug) {
    throw new AdminDomainError(`${field} cannot be converted to a slug.`);
  }

  return slug;
}
