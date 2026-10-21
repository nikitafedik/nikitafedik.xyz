// @ts-check
import { defineConfig } from 'astro/config';

// Static site. Pages build to flat files (cv.html, publications.html) so they link to each other with
// plain relative paths, the same on Vercel and inside a claude.ai artifact.
export default defineConfig({
  site: 'https://www.nikitafedik.xyz',
  output: 'static',
  // assets/ (not the default _astro/): artifact hosting reserves names that start with an underscore
  build: { format: 'file', assets: 'assets' },
});
