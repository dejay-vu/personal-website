import type { Metadata } from 'next';

import type { NoteListItem } from '@/modules/notes/types';
import { getPhotoSeoPresentation } from '@/modules/photos/presentation';
import type { PhotoDetail } from '@/modules/photos/types';
import type { ProjectDetail } from '@/modules/projects/types';

import { toDate } from '@/lib/date';

const PERSON_SAME_AS = [
  'https://gravatar.com/dejayyvu',
  'https://www.facebook.com/dejayyvu/',
  'https://x.com/dejay_vu',
  'https://www.youtube.com/channel/UCns_dACstxIrKFjlD6earSA',
  'https://www.instagram.com/dejayyvu/',
  'https://github.com/dejay-vu',
  'https://www.linkedin.com/in/junhao-zh',
  'https://eng.ox.ac.uk/people/junhao-zhang',
  'https://orcid.org/0009-0003-7918-3208',
  'https://www.researchgate.net/profile/Junhao-Zhang-37',
  'https://openreview.net/profile?id=~Junhao_Zhang10',
  'https://arxiv.org/a/zhang_j_34.html',
] as const satisfies readonly `https://${string}`[];

export const seoConfig = {
  siteUrl: 'https://dejayvu.com',
  siteName: 'DeJay Vu',
  personName: 'Junhao Zhang',
  chineseName: '张俊豪',
  primaryTitle: 'DeJay Vu',
  alternateNames: ['Jay'],
  description:
    'Junhao Zhang, known as Jay, is a Machine Learning Software Engineer working on GPU programming, high-performance computing (HPC), and advanced computing systems, with interests in photography and hiking.',
  profileImage:
    'https://1.gravatar.com/avatar/d7761dea5bc1ed7ccbd7e0f806533725edac5e18c8f8ad5159611a85b576acc4?size=512',
  defaultImage: {
    // 1200x630 fixed-raster JPEG: below-1200 or auto-format (webp/avif) OG
    // images get downgraded or dropped by several social scrapers.
    url: 'https://resizer.dejayvu.com/opengraph?format=jpeg&quality=75&width=1200',
    width: 1200,
    height: 630,
    alt: 'DeJay Vu',
  },
  sameAs: PERSON_SAME_AS,
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

export type BreadcrumbItem = {
  href: string;
  label: string;
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
          googleBot: {
            index: true,
            follow: true,
            'max-image-preview': 'large',
          },
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

const personId = () => absoluteUrl('/#person');
const profilePageId = () => absoluteUrl('/#profile-page');
const websiteId = () => absoluteUrl('/#website');

function createPersonEntity() {
  return {
    '@type': 'Person',
    '@id': personId(),
    name: seoConfig.personName,
    alternateName: seoConfig.alternateNames,
    url: seoConfig.siteUrl,
    mainEntityOfPage: {
      '@id': profilePageId(),
    },
    image: seoConfig.profileImage,
    jobTitle: 'Machine Learning Software Engineer',
    description: seoConfig.description,
    affiliation: {
      '@type': 'CollegeOrUniversity',
      name: 'University of Oxford',
      url: 'https://www.ox.ac.uk/',
    },
    knowsAbout: [
      'Machine Learning',
      'GPU programming',
      'CUDA',
      'High-performance computing',
      'advanced computing systems',
      'photography',
      'hiking',
    ],
    sameAs: seoConfig.sameAs,
  };
}

function createProfilePageEntity() {
  return {
    '@type': 'ProfilePage',
    '@id': profilePageId(),
    url: seoConfig.siteUrl,
    name: 'Junhao Zhang (Jay)',
    description: seoConfig.description,
    mainEntity: {
      '@id': personId(),
    },
    isPartOf: {
      '@id': websiteId(),
    },
  };
}

function createWebsiteEntity() {
  return {
    '@type': 'WebSite',
    '@id': websiteId(),
    name: seoConfig.siteName,
    alternateName: ['DeJay Vu', 'DeJayVu', 'dejayvu'],
    url: seoConfig.siteUrl,
    description: seoConfig.description,
    publisher: {
      '@id': personId(),
    },
  };
}

export function createHomeJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      createProfilePageEntity(),
      createPersonEntity(),
      createWebsiteEntity(),
    ],
  };
}

export function createBreadcrumbListJsonLd(items: readonly BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(({ href, label }, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: label,
      item: absoluteUrl(href),
    })),
  };
}

function createAuthorEntity() {
  return {
    '@type': 'Person',
    '@id': personId(),
    name: seoConfig.personName,
    url: personId(),
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
    author: createAuthorEntity(),
    publisher: createAuthorEntity(),
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
    description: project.seoDescription,
    url,
    mainEntityOfPage: url,
    codeRepository: project.repoUrl,
    downloadUrl: project.packageUrl,
    programmingLanguage: project.language,
    operatingSystem: project.operatingSystem,
    softwareVersion: project.version,
    runtimePlatform: project.requires,
    image: absoluteUrl(project.ogImage.src),
    screenshot: {
      '@type': 'ImageObject',
      contentUrl: absoluteUrl(project.screenshot.src),
      width: project.screenshot.width,
      height: project.screenshot.height,
      caption: project.screenshot.caption,
    },
    // Project.license holds an SPDX identifier, so the canonical SPDX page
    // stays correct for any future license.
    license: `https://spdx.org/licenses/${project.license}.html`,
    keywords: project.stack.join(', '),
    datePublished: toDate(project.publishedAt).toISOString(),
    dateModified: toDate(project.updatedAt).toISOString(),
    author: createAuthorEntity(),
    targetProduct: {
      '@type': 'SoftwareApplication',
      name: project.name,
      description: project.seoDescription,
      applicationCategory: 'DeveloperApplication',
      downloadUrl: project.packageUrl,
      operatingSystem: project.operatingSystem,
      softwareVersion: project.version,
      installUrl: project.packageUrl,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
  };
}

export function createImageObjectJsonLd({
  contentUrl,
  photo,
  thumbnailUrl,
  url,
}: {
  contentUrl: string;
  photo: PhotoDetail;
  thumbnailUrl: string;
  url: string;
}) {
  const presentation = getPhotoSeoPresentation(photo);
  const dateCreated = [photo.capturedAt, photo.dateTimeOriginal]
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .map(toDate)
    .find((value) => !Number.isNaN(value.getTime()))
    ?.toISOString();

  return {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    name: presentation.name,
    contentUrl,
    thumbnailUrl,
    url,
    mainEntityOfPage: url,
    description: presentation.description,
    uploadDate: toDate(photo.createdAt).toISOString(),
    dateModified: toDate(photo.updatedAt).toISOString(),
    ...(dateCreated && { dateCreated }),
    creator: createAuthorEntity(),
    creditText: seoConfig.personName,
    copyrightNotice: `© ${seoConfig.personName}. All rights reserved.`,
    ...(presentation.location && {
      contentLocation: {
        '@type': 'Place',
        name: presentation.location,
      },
    }),
  };
}
