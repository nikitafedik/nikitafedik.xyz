# nikitafedik.xyz

Personal site, built with [Astro](https://astro.build) and deployed on Vercel. The 3D on the home page is plain three.js.

Pages live in `src/pages`, the shared shell in `src/layouts/Site.astro` and `src/components/Sidebar.astro`.
Markdown pages work too: put `layout: ../layouts/Site.astro` and a `title` in the front matter.

- `npm run dev`: local preview with live reload
- `npm run build`: production build into `dist/`, which Vercel serves
- `npm run build:artifact`: the same build with relative asset paths, for publishing as a claude.ai artifact

## Content

- Publications: `src/data/publications.json`, one entry per paper, newest first. `cover.own` marks cover art by Nikita
  (gets the "see my cover" chip), `cover.image` names the files in `public/img/covers/`, `molecule` picks the
  spinning molecule (keys in `public/mol.js`). The schema in `src/content.config.ts` rejects missing or misspelled fields.
- Projects: a placeholder while the page is reworked.

## Home page

The home page is still developed as a standalone file. `scripts/sync-home.sh [DIR]` copies it into `public/`
(`index.html`, `reel3d.js`, `sky.js`, `set-clay.js`, `img/*.webp`) and takes out the nav link to the unpublished CV page.
It keeps its own copy of the sidebar until it moves onto the shared layout.
