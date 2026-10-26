# perf harness

Measurement scripts for the home page's 3D, run against Windows Chrome over CDP from WSL.

- `./launch.sh <port> <name> [--use-adapter-luid=0,86604]` starts headless Chrome on the real GPU; the LUID picks the
  Intel UHD 770 (a weak, laptop-class GPU). Port 9333 belongs to another session.
- `node zserve.cjs <port> name=dir ...` serves folders with brotli/gzip and no caching.
- Scripts take the page in `PAGE=http://127.0.0.1:<port>/<name>/index.html` and need `NODE_PATH` pointing at a
  `node_modules` with `playwright-core`.

| Script | Measures |
|--------|----------|
| `netload.cjs` | Cold first visit on an emulated network: when the intro background shows, when the 3D is ready, LCP and its element |
| `profile-load.cjs` | CPU profile of a cold load through reel start-up: long tasks, time per function |
| `envcheck.html` | The GPU decode of `img/room-env.webp` against the old JS decode, texel by texel |
| `pickcheck.cjs` | Which intro picture each screen size picks |
| `poster-check.cjs`, `handoff-video.cjs` | The poster's timing and the hand-off to the live 3D, frame by frame |
| `postercmp-gpu.cjs`, `drift.cjs` | The poster against the first live frame; how the intro frame changes over its first seconds |

## Baking the intro pictures again

When the intro scene, the lens or the colours change, `tests/poster.spec.ts` fails. Capture the first live frame for
every shape and theme, then bake:

```bash
WAIT=0 node capture-intro.cjs _out/cap <label:W:H:dpr:mobile:theme> ...
python3 bake-intro-posters.py _out/cap ../public/img/intro
```

The shapes are the lists in the poster script in `public/index.html`. Desktop shapes are captured at 1920 wide with
height 1000/shape (the canvas is 1000 px wide). Touch shapes up to 0.62 are captured at 390 wide, dpr 2, with height
358/shape + 56; wider touch shapes at 1355 wide with height 1000/shape. Labels look like `d1.15-dark` or `m0.46-light`.
`WAIT=0` captures the first frame, the one the picture hands over to.
