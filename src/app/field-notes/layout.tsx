import { VENUES } from '@/config/venues';

import { createSectionMetadata } from '@/lib/seo';

export const metadata = createSectionMetadata({
  title: VENUES.notes.label,
  description:
    'Technical notes and essays by Junhao Zhang, known as Jay, about machine learning, GPU programming, CUDA, and software systems.',
  path: VENUES.notes.path,
});

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={VENUES.notes.label}
      className="mx-auto w-full max-w-[calc(130ch+4rem)] pb-8 pt-2 sm:pt-0"
    >
      {children}
    </section>
  );
}
