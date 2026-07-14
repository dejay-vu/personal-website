const XML_ENTITY_PATTERN = /&(?!amp;|apos;|gt;|lt;|quot;|#\d+;|#x[\da-f]+;)/gi;

/**
 * Next.js writes MetadataRoute.Sitemap image values directly into XML.
 * Escape bare ampersands at that boundary while leaving an already escaped
 * URL unchanged, so query strings remain valid XML and are never double
 * escaped.
 */
export function escapeSitemapImageUrl(url: string) {
  return url.replace(XML_ENTITY_PATTERN, '&amp;');
}
