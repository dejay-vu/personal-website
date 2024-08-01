import Image from 'next/image';

export async function PhotoModalPage({
  id,
  photoData,
}: {
  id: string;
  photoData: any[];
}) {
  const photo = photoData.find(({ id: photoId }) => photoId === id);
  if (!photo) return <div>No photo found for this ID.</div>;

  const isPortrait = photo.orientation === 'left-bottom';
  const sizes = isPortrait ? '90vh auto' : '90vw auto';

  // Dynamic Size & Classnames for Different Orientations
  const containerClassNames = `flex justify-center items-center`;

  // Tailwind CSS class names without dynamic parts
  const imageClassNames = `object-contain rounded-lg ${
    isPortrait
      ? 'h-auto max-h-[90vh] w-full'
      : 'w-auto max-w-[90vw] max-h-[90vh] h-full'
  }`;

  return (
    <div className={containerClassNames}>
      <Image
        src={photo.url}
        placeholder="blur"
        blurDataURL={photo.blurDataURL}
        alt={photo.title}
        loading="eager"
        priority
        width={isPortrait ? photo.height! / 3 : photo.width! / 3}
        height={isPortrait ? photo.width! / 3 : photo.height! / 3}
        sizes={sizes}
        className={imageClassNames}
      />
    </div>
  );
}
