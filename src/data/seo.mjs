// Search and analytics tags shared by every page. Site.astro adds them to the Astro pages; the integration in
// astro.config.mjs adds them to the home page (public/index.html) after the build, so sync-home.sh stays unchanged.
export const SITE = 'https://www.nikitafedik.xyz';
export const NAME = 'Nikita Fedik';
export const HOME_DESCRIPTION =
  'Nikita Fedik, Senior Technical Marketing Engineer at NVIDIA. Demos, benchmarks, technical tutorials and visuals for AI-accelerated simulation.';

// pages listed in sitemap.xml; projects.html stays out while it shows a placeholder
export const SITEMAP_PATHS = ['/', '/publications.html'];

const PROFILES = [
  'https://www.linkedin.com/in/nfedik/',
  'https://github.com/nikitafedik',
  'https://scholar.google.com/citations?user=xiXhXJoAAAAJ',
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// GoatCounter counts visits on the live domain only, so local builds, Vercel previews and artifacts stay out of the numbers
const GOATCOUNTER = `<script>if (location.hostname === 'www.nikitafedik.xyz') { const s = document.createElement('script'); s.async = true; s.src = 'https://gc.zgo.at/count.js'; s.dataset.goatcounter = 'https://nikitafedik.goatcounter.com/count'; document.head.append(s); }</script>`;

export function headTags({ path, title, description, home = false }) {
  const url = SITE + path;
  const image = SITE + '/img/portrait.webp';
  const tags = [
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="${home ? 'profile' : 'website'}">`,
    `<meta property="og:site_name" content="${NAME}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta name="twitter:card" content="summary">`,
  ];
  if (home) {
    const person = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: NAME,
      url: SITE + '/',
      image,
      jobTitle: 'Senior Technical Marketing Engineer',
      worksFor: { '@type': 'Organization', name: 'NVIDIA' },
      sameAs: PROFILES,
    };
    tags.push(`<script type="application/ld+json">${JSON.stringify(person)}</script>`);
  }
  tags.push(GOATCOUNTER);
  return tags.join('\n');
}
