import type { Metadata } from 'next';

import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

import { LusitanaFont } from '@/styles/fonts';
import '@/styles/globals.css';

import Footer from '@/components/Footer';
import NavBar from '@/components/NavBar';
import Providers from '@/components/Providers';

export const metadata: Metadata = {
  title: {
    template: '%s',
    default: 'DeJay Vu',
  },
  authors: [
    {
      url: 'https://dejayvu.com',
      name: 'Junhao Zhang',
    },
  ],
  generator: 'nextjs, react',
  description:
    "I'm a software engineer who loves to build things. I'm passionate about machine learning, photography, and hiking.",
  openGraph: {
    images: {
      url: 'https://resizer.dejayvu.com/opengraph?format=auto&quality=75&width=640',
      width: 768,
      height: 403,
      alt: 'DeJay Vu',
    },
    emails: ['junhao.zhang2301@gmail.com'],
    phoneNumbers: ['+44 7903686710'],
    locale: 'en_US',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${LusitanaFont.className} text-pretty antialiased`}>
        <Providers>
          <div className="flex flex-col items-center justify-between min-h-[100dvh]">
            <NavBar />
            <main className="w-full m-auto p-8 sm:px-16 lg:px-32">
              {children}
            </main>
            <Footer />
          </div>
          <SpeedInsights />
          <Analytics />
        </Providers>
      </body>
    </html>
  );
}
