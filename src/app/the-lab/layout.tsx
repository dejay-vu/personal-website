import { VENUES } from '@/config/venues';

import { createSectionMetadata } from '@/lib/seo';

export const metadata = createSectionMetadata({
  title: VENUES.projects.label,
  description:
    'Projects by Junhao Zhang, known as Jay, focused on machine learning systems, GPU programming, and web engineering.',
  path: VENUES.projects.path,
});

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={VENUES.projects.label}
      className="mx-auto w-full max-w-[calc(130ch+4rem)] pb-8 pt-2 sm:pt-0"
    >
      {children}
    </section>
  );
}
