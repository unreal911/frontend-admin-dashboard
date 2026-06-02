import type { Metadata } from 'next';
import './globals.css';
import { getSiteUrl } from '@/lib/seo';
import { AdminUiProvider } from '@/components/admin-ui-provider';

const siteUrl = getSiteUrl();
const defaultSocialImage = `${siteUrl}/opengraph-image`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Frontend Admin Next',
  description: 'Panel administrativo web.',
  alternates: {
    canonical: '/login',
  },
  openGraph: {
    type: 'website',
    siteName: 'Frontend Admin Next',
    title: 'Frontend Admin Next',
    description: 'Panel administrativo web.',
    url: '/login',
    images: [
      {
        url: defaultSocialImage,
        alt: 'Frontend Admin Next',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Frontend Admin Next',
    description: 'Panel administrativo web.',
    images: [defaultSocialImage],
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <AdminUiProvider>
          <main className="mk-main mk-main--plain">{children}</main>
        </AdminUiProvider>
      </body>
    </html>
  );
}
