import { Metadata } from 'next';

import { ContactForm } from '@/lib/contact_form';

export const metadata: Metadata = {
  title: 'Contact',
};

export default function Contact() {
  return (
    <>
      <h2 className="text-xl mb-10 font-bold flex-none">
        Got something to say or just want to share a funny cat meme? Drop me a
        message!
      </h2>
      <ContactForm />
    </>
  );
}
