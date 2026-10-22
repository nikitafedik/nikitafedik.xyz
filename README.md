# nikitafedik.xyz

Personal site, built with [Astro](https://astro.build) and deployed on Vercel. The 3D on the home page is plain three.js.

Pages live in `src/pages`, the shared shell in `src/layouts/Site.astro` and `src/components/Sidebar.astro`.
Markdown pages work too: put `layout: ../layouts/Site.astro` and a `title` in the front matter.

- `npm run dev`: local preview with live reload on every page, the home page included (it reloads when anything in
  `public/` changes). Astro runs it in the background: `npx astro dev stop` stops it. `npx astro dev --host` also serves
  it on the local network, for trying it on a phone
- `npm run check`: builds and runs the site checks in `tests/` (see `tests/README.md`); run it before every push
- `npm run build`: production build into `dist/`, which Vercel serves
- `npm run build:artifact`: the same build with relative asset paths, for publishing as a claude.ai artifact

## Content

- Publications: `src/data/publications.json`, one entry per paper, newest first. `cover.own` marks cover art by Nikita
  (gets the "see my cover" chip), `cover.image` names the files in `public/img/covers/`, `molecule` picks the
  spinning molecule (keys in `public/mol.js`). The schema in `src/content.config.ts` rejects missing or misspelled fields.
- Projects: a placeholder while the page is reworked.

## Home page

The home page is a standalone file, edited in place: `public/index.html` with its scripts `public/reel3d.js` (the 3D
reel), `sky.js` (the theme switch) and `set-clay.js` (the illustration set). Its search tags are added after the build
(`astro.config.mjs`). It keeps its own copy of the sidebar until it moves onto the shared layout. (`scripts/sync-home.sh`
copied it in from an earlier working folder that no longer exists.)
