import type { APIRoute } from 'astro';

const SITE_URL = 'https://instadownloder.com';

interface SitemapURL {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

function toW3CDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

const today = toW3CDate(new Date());

const urls: SitemapURL[] = [
  {
    loc: '/',
    lastmod: today,
    changefreq: 'daily',
    priority: 1.0,
  },
  {
    loc: '/about',
    lastmod: today,
    changefreq: 'monthly',
    priority: 0.7,
  },
  {
    loc: '/privacy-policy',
    lastmod: today,
    changefreq: 'yearly',
    priority: 0.5,
  },
  {
    loc: '/terms',
    lastmod: today,
    changefreq: 'yearly',
    priority: 0.5,
  },
  {
    loc: '/contact',
    lastmod: today,
    changefreq: 'monthly',
    priority: 0.6,
  },
];

function buildSitemap(urls: SitemapURL[]): string {
  const urlEntries = urls
    .map(({ loc, lastmod, changefreq, priority }) => {
      return [
        '  <url>',
        `    <loc>${SITE_URL}${loc}</loc>`,
        lastmod     ? `    <lastmod>${lastmod}</lastmod>`           : '',
        changefreq  ? `    <changefreq>${changefreq}</changefreq>` : '',
        priority    !== undefined ? `    <priority>${priority.toFixed(1)}</priority>` : '',
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset',
    '  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '  xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9',
    '    http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">',
    urlEntries,
    '</urlset>',
  ].join('\n');
}

export const GET: APIRoute = () => {
  const xml = buildSitemap(urls);

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Cache for 24 h at the CDN/browser level
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
};
