import { notFound } from 'next/navigation';

import { getPhotoBySlug } from '@/modules/photos';

import PhotoModalPage from '@/components/photos/modal/PhotoModalPage';

type PageProps = {
  params: Promise<{ photoSlug: string }>;
};

export default async function Page({ params }: PageProps) {
  const { photoSlug } = await params;
  const photo = await getPhotoBySlug(photoSlug);

  if (!photo) notFound();

  return <PhotoModalPage photo={photo} />;
}
