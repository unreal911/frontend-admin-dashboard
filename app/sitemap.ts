import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/seo';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const now = new Date();

  return [
    {
      url: `${siteUrl}/`,
      lastModified: now,
    },
    {
      url: `${siteUrl}/login`,
      lastModified: now,
    },
    {
      url: `${siteUrl}/admin/dashboard`,
      lastModified: now,
    },
  ];
}
