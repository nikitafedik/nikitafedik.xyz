import { SITE, SITEMAP_PATHS } from '../data/seo.mjs';

export function GET() {
  const urls = SITEMAP_PATHS.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}
