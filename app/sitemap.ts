import type { MetadataRoute } from 'next';
import { PDF_TOOLS_REGISTRY } from '@/lib/tools-registry';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.APP_URL || 'https://pdfnestly.com';

  const staticRoutes: MetadataRoute.Sitemap = [
    '',
    '/pricing',
    '/privacy',
    '/help',
    '/contact',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: route === '' ? 1.0 : 0.8,
  }));

  const toolRoutes: MetadataRoute.Sitemap = PDF_TOOLS_REGISTRY.map((tool) => ({
    url: `${baseUrl}/${tool.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: tool.popular ? 0.95 : 0.85,
  }));

  return [...staticRoutes, ...toolRoutes];
}
