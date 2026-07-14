import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { APP_ROUTES, VENUES, photoPath } from '@/config/venues';
import { getPhotoBySlug, getPhotoSitemapEntries } from '@/modules/photos';

import { MEDIA_VARIANT_WIDTHS, getMediaImageURL } from '@/lib/media';
import {
  type BreadcrumbItem,
  absoluteUrl,
  createBreadcrumbListJsonLd,
  createImageObjectJsonLd,
  createPageMetadata,
} from '@/lib/seo';

import { Breadcrumbs } from '@/components/Breadcrumbs';
import { JsonLd } from '@/components/JsonLd';
import { PhotoDetail } from '@/components/photos/PhotoDetail';
import {
  getPhotoAltText,
  getPhotoDisplayTitle,
} from '@/components/photos/photoAlt';
import { getPhotoDisplayDimensions } from '@/components/photos/photoDimensions';

const OG_IMAGE_WIDTH = 1200;

type PageProps = {
  params: Promise<{ photoSlug: string }>;
};

// Prebuild current photo pages; new slugs still render on demand.
export const dynamicParams = true;

export async function generateStaticParams() {
  const { photos } = await getPhotoSitemapEntries();

  return photos.map(({ slug }) => ({ photoSlug: slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata | undefined> {
  const { photoSlug } = await params;
  const photo = await getPhotoBySlug(photoSlug);

  if (!photo) notFound();

  const image = getMediaImageURL({
    key: photo.mediaAsset.originalKey,
    width: OG_IMAGE_WIDTH,
    format: 'jpeg',
  });
  const dimensions = getPhotoDisplayDimensions(photo);

  return createPageMetadata({
    // Bare title: the root layout's title.template appends the site name.
    title: `${photo.title} | ${VENUES.photos.label}`,
    description: `${photo.title}, photographed by Junhao Zhang (Jay).`,
    path: photoPath(photo.slug),
    image: {
      alt: photo.title,
      url: image,
      width: OG_IMAGE_WIDTH,
      height: Math.round(
        (OG_IMAGE_WIDTH * dimensions.height) / dimensions.width,
      ),
    },
  });
}

export default async function Page({ params }: PageProps) {
  const { photoSlug } = await params;
  const photo = await getPhotoBySlug(photoSlug);

  if (!photo) notFound();

  const image = getMediaImageURL({
    key: photo.mediaAsset.originalKey,
    width: MEDIA_VARIANT_WIDTHS.card,
  });
  const url = absoluteUrl(photoPath(photo.slug));
  const breadcrumbs = [
    { href: APP_ROUTES.home, label: 'Home' },
    { href: VENUES.photos.path, label: VENUES.photos.label },
    {
      href: photoPath(photo.slug),
      label: getPhotoDisplayTitle(photo) ?? getPhotoAltText(photo),
    },
  ] satisfies readonly BreadcrumbItem[];

  return (
    <>
      <JsonLd data={createBreadcrumbListJsonLd(breadcrumbs)} />
      <Breadcrumbs items={breadcrumbs} />
      <PhotoDetail photo={photo} />
      <JsonLd
        data={createImageObjectJsonLd({
          image,
          photo,
          url,
        })}
      />
    </>
  );
}
