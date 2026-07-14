import type { Metadata } from 'next';

import type { NoteListItem } from '@/modules/notes/types';
import type { PhotoDetail } from '@/modules/photos/types';
import type { ProjectDetail } from '@/modules/projects/types';

import { toDate } from '@/lib/date';

export const seoConfig = {
  siteUrl: 'https://dejayvu.com',
  siteName: 'DeJay Vu',
  personName: 'Junhao Zhang',
  chineseName: '张俊豪',
  primaryTitle: 'DeJay Vu',
  alternateNames: ['张俊豪', 'Jay Zhang', 'DeJay Vu', 'dejayvu'],
  description:
    'Junhao Zhang (张俊豪), also known as Jay Zhang and DeJay Vu, is a Machine Learning Software Engineer focused on GPU programming, advanced computing systems, photography, and hiking.',
  email: 'junhao.zhang2301@gmail.com',
  defaultImage: {
    // 1200x630 fixed-raster JPEG: below-1200 or auto-format (webp/avif) OG
    // images get downgraded or dropped by several social scrapers.
    url: 'https://resizer.dejayvu.com/opengraph?format=jpeg&quality=75&width=1200',
    width: 1200,
    height: 630,
    alt: 'DeJay Vu',
  },
  sameAs: [
    'https://github.com/dejay-vu',
    'https://linkedin.com/in/junhao-zh',
    'https://instagram.com/dejayyvu',
  ],
} as const;

type SeoImage = {
  alt?: string;
  height?: number;
  url: string;
  width?: number;
};

type PageMetadataInput = {
  description?: string;
  image?: SeoImage;
  noIndex?: boolean;
  path?: string;
  title: string;
};

type ArticleMetadataInput = PageMetadataInput & {
  authors?: string[];
  modifiedTime?: Date | string;
  publishedTime?: Date | string;
  tags?: string[];
};

export function absoluteUrl(path = '/') {
  return new URL(path, seoConfig.siteUrl).toString();
}

export function getCanonicalPath(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

function normalizeImage(image: SeoImage = seoConfig.defaultImage) {
  return {
    url: image.url,
    width: image.width,
    height: image.height,
    alt: image.alt ?? seoConfig.defaultImage.alt,
  };
}

function baseMetadata({
  description = seoConfig.description,
  image = seoConfig.defaultImage,
  noIndex = false,
  path = '/',
  title,
}: PageMetadataInput): Metadata {
  const canonical = absoluteUrl(getCanonicalPath(path));
  const normalizedImage = normalizeImage(image);

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    // og:title / twitter:title are intentionally omitted: Next then falls
    // back to the resolved <title> (with the layout's title.template
    // applied), keeping social cards branded like the document title.
    openGraph: {
      description,
      url: canonical,
      siteName: seoConfig.siteName,
      locale: 'en_US',
      type: 'website',
      images: [normalizedImage],
    },
    twitter: {
      card: 'summary_large_image',
      description,
      images: [normalizedImage.url],
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
          googleBot: {
            index: false,
            follow: false,
          },
        }
      : {
          index: true,
          follow: true,
        },
  };
}

export function createPageMetadata(input: PageMetadataInput): Metadata {
  return baseMetadata(input);
}

/**
 * Metadata for section layouts (e.g. /field-notes, /darkroom). A plain string
 * title in a layout resets Next's title.template chain, so child pages would
 * render unbranded titles; this re-establishes the template for descendants.
 */
export function createSectionMetadata(input: PageMetadataInput): Metadata {
  return {
    ...baseMetadata(input),
    title: {
      // The root layout's template brands the default; the template here
      // re-brands child pages (a string title would null the chain).
      default: input.title,
      template: `%s | ${seoConfig.siteName}`,
    },
  };
}

export function createArticleMetadata({
  authors = [seoConfig.personName],
  modifiedTime,
  publishedTime,
  tags = [],
  ...input
}: ArticleMetadataInput): Metadata {
  const metadata = baseMetadata(input);
  const publishedAt = publishedTime
    ? toDate(publishedTime).toISOString()
    : undefined;
  const modifiedAt = modifiedTime
    ? toDate(modifiedTime).toISOString()
    : undefined;

  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      type: 'article',
      publishedTime: publishedAt,
      modifiedTime: modifiedAt,
      authors,
      tags,
    },
  };
}

export function createPersonJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': absoluteUrl('/#person'),
    name: seoConfig.personName,
    alternateName: seoConfig.alternateNames,
    url: seoConfig.siteUrl,
    email: seoConfig.email,
    jobTitle: 'Machine Learning Software Engineer',
    description: seoConfig.description,
    knowsAbout: [
      'Machine Learning',
      'GPU programming',
      'CUDA',
      'advanced computing systems',
      'photography',
      'hiking',
    ],
    sameAs: seoConfig.sameAs,
  };
}

export function createWebsiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': absoluteUrl('/#website'),
    name: seoConfig.siteName,
    alternateName: [
      'dejayvu',
      'Junhao Zhang',
      '张俊豪',
      'Jay Zhang',
      seoConfig.primaryTitle,
    ],
    url: seoConfig.siteUrl,
    description: seoConfig.description,
    publisher: {
      '@id': absoluteUrl('/#person'),
    },
  };
}

export function createNotePostingJsonLd({
  image,
  note,
  url,
}: {
  image: string;
  note: NoteListItem;
  url: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: note.title,
    description: note.abstract,
    image,
    url,
    mainEntityOfPage: url,
    datePublished: toDate(note.publishedAt).toISOString(),
    dateModified: toDate(note.updatedAt).toISOString(),
    wordCount: note.wordCount,
    timeRequired: `PT${note.readingTime}M`,
    author: {
      '@id': absoluteUrl('/#person'),
      name: seoConfig.personName,
    },
    publisher: {
      '@id': absoluteUrl('/#person'),
      name: seoConfig.personName,
    },
    keywords: note.categories.map((category) => category.name).join(', '),
  };
}

export function createSoftwareSourceCodeJsonLd({
  project,
  url,
}: {
  project: ProjectDetail;
  url: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: project.name,
    description: project.pitch,
    url,
    mainEntityOfPage: url,
    codeRepository: project.repoUrl,
    programmingLanguage: project.language,
    runtimePlatform: project.requires,
    // Project.license holds an SPDX identifier, so the canonical SPDX page
    // stays correct for any future license.
    license: `https://spdx.org/licenses/${project.license}.html`,
    keywords: project.stack.join(', '),
    datePublished: toDate(project.publishedAt).toISOString(),
    dateModified: toDate(project.updatedAt).toISOString(),
    author: {
      '@id': absoluteUrl('/#person'),
      name: seoConfig.personName,
    },
    targetProduct: {
      '@type': 'SoftwareApplication',
      name: project.name,
      applicationCategory: 'DeveloperApplication',
      installUrl: project.packageUrl,
    },
  };
}

export function createImageObjectJsonLd({
  image,
  photo,
  url,
}: {
  image: string;
  photo: PhotoDetail;
  url: string;
}) {
  const country = photo.tags.find(({ tag }) => tag.field === 'country')?.tag
    .label;
  const area = photo.tags.find(({ tag }) => tag.field === 'area')?.tag.label;
  const location = [area, country].filter(Boolean).join(', ');

  return {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    name: photo.title,
    contentUrl: image,
    thumbnailUrl: image,
    url,
    description: location
      ? `${photo.title} photographed in ${location} by ${seoConfig.personName}.`
      : `${photo.title} photographed by ${seoConfig.personName}.`,
    uploadDate: toDate(photo.createdAt).toISOString(),
    dateModified: toDate(photo.updatedAt).toISOString(),
    creator: {
      '@id': absoluteUrl('/#person'),
      name: seoConfig.personName,
    },
    ...(location && {
      contentLocation: {
        '@type': 'Place',
        name: location,
      },
    }),
  };
}
