export function toSlug(
  value: string,
  {
    lower = true,
  }: {
    lower?: boolean;
  } = {},
) {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return lower ? slug.toLowerCase() : slug;
}
