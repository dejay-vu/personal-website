import { createPageMetadata } from '@/lib/seo';

import { ContactForm } from '@/components/contact';

export const metadata = createPageMetadata({
  title: 'Contact',
  description:
    'Contact Junhao Zhang (张俊豪), also known as Jay Zhang and DeJay Vu, about machine learning, GPU programming, photography, hiking, or software engineering work.',
  path: '/contact',
});

export default function Contact() {
  return (
    <section
      aria-label="contact"
      className="mx-auto grid w-full max-w-[52rem] content-start pb-8 pt-2 md:min-h-[calc(100dvh-13rem)] md:content-center md:py-0"
    >
      <div className="grid justify-items-center gap-8">
        <div className="mx-auto max-w-[42rem] text-center">
          <h1 className="text-2xl font-bold leading-tight text-foreground sm:text-3xl">
            Got something to say or just want to share a funny cat meme? Drop me
            a message!
          </h1>
        </div>

        <div className="w-full">
          <ContactForm />
        </div>
      </div>
    </section>
  );
}
