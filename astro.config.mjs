// @ts-check
import { defineConfig } from 'astro/config';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { headTags, HOME_DESCRIPTION, NAME } from './src/data/seo.mjs';

// The home page is a static file in public/, so its search and analytics tags go in after the build
const homeHead = {
  name: 'home-head',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const file = fileURLToPath(new URL('index.html', dir));
      const html = await readFile(file, 'utf-8');
      if (!html.includes('</head>')) throw new Error('home-head: no </head> in dist/index.html');
      const tags = headTags({ path: '/', title: NAME, description: HOME_DESCRIPTION, home: true });
      await writeFile(file, html.replace('</head>', tags + '\n</head>'));
    },
  },
};

// Static site. Pages build to flat files (cv.html, publications.html) so they link to each other with
// plain relative paths, the same on Vercel and inside a claude.ai artifact.
export default defineConfig({
  site: 'https://www.nikitafedik.xyz',
  output: 'static',
  // assets/ (not the default _astro/): artifact hosting reserves names that start with an underscore
  build: { format: 'file', assets: 'assets' },
  integrations: [homeHead],
});
