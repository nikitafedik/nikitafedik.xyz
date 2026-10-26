# Site checks

Playwright tests for the whole site, run against the built site or a deployed URL.

| File | Checks |
|------|--------|
| `pages.spec.ts` | The three pages load without errors and link to each other; no CV page; the phone menu; publications spacing and cover tiles |
| `intro.spec.ts` | The home intro, sampled every 20 px both ways: no speed jumps, "What I do best" lands sharp in its place and never covers a line, the first paint is already in place |
| `reel.spec.ts` | Each skill button lands on its scene; the demo runs from picking to results |
| `transitions.spec.ts` | Every page change runs a view transition |
| `poster.spec.ts` | The intro's prerendered pictures match the live intro they hand over to (fails when the dust scene, lens or colours change; bake them again, see `perf/README.md`) |
| `perf.spec.ts` | Nothing keeps running at rest (frame loops, 3D redraws, restyles per second); a whole-page touch scroll on a phone with a 4x slower CPU has no long freezes |

Each test runs twice: at 1440 x 900 and as a 390 x 844 touch phone.

## Before every push

```bash
npm run check
```

This builds the site, serves `dist/` with `astro preview` on port 4329 and runs every test (about three minutes). On a
new machine, install the browser once:

```bash
npx playwright install chromium
```

If Chromium does not start on Linux, it is missing system libraries; `npx playwright install-deps chromium` installs
them (it needs sudo).

## Against a deployed site

```bash
BASE_URL=https://www.nikitafedik.xyz npx playwright test
```

A Vercel preview is behind Deployment Protection. Pass the project's "Protection Bypass for Automation" secret as
`VERCEL_AUTOMATION_BYPASS_SECRET` and the tests open the preview with Vercel's bypass cookie.

## On every Vercel deployment

`.github/workflows/site-checks.yml` runs these tests when Vercel reports a finished deployment (preview or production).
One-time setup:

1. Vercel: Project > Settings > Deployment Protection > Protection Bypass for Automation: create a secret.
2. GitHub: Settings > Secrets and variables > Actions: add it as `VERCEL_AUTOMATION_BYPASS_SECRET`.

The workflow has to be on `main` before GitHub sends it these events. A run can also be started by hand from the
Actions tab with a URL.

## Limits

`perf.spec.ts` allows, at rest: at most 2 frame callbacks and 25 style recalcs per second, and no 3D redraws (the
demo's spinning turntables are allowed about 30 frames). While scrolling: no freeze longer than `PERF_LONG_TASK_MS`
(350 ms by default, 600 in CI). Test browsers draw WebGL in software, so 3D work looks slower than on a phone's GPU.
