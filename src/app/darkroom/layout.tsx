import { VENUES } from '@/config/venues';

import { createSectionMetadata } from '@/lib/seo';

export const metadata = createSectionMetadata({
  title: VENUES.photos.label,
  description: `Photography from ${VENUES.photos.label} by Junhao Zhang, known as Jay, featuring travel, hiking, and landscape photography.`,
  path: VENUES.photos.path,
});

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={VENUES.photos.label}
      className="mx-auto w-full max-w-[calc(130ch+4rem)] pb-6 pt-2 sm:pb-8 sm:pt-0"
    >
      {children}
    </section>
  );
}
