#!/usr/bin/env bash
# Copy the home page from its working folder into public/, unchanged, so the Astro build serves it as /index.html.
# The home page still carries its own sidebar copy; the other pages use src/components/Sidebar.astro.
#   usage: scripts/sync-home.sh [SOURCE_DIR]
set -euo pipefail
SRC=${1:-${HOME_SRC:-/tmp/claude-1000/-home-nfedik-projects-WEB-nikitafedik-xyz--claude-worktrees-chirpy-theme-redesign-af12fe/a6c574b4-b40f-4c8f-be33-f1807796fe2d/scratchpad/site}}
DST=$(cd "$(dirname "$0")/.." && pwd)/public
[ -f "$SRC/home-sidebar.html" ] || { echo "no home-sidebar.html in $SRC" >&2; exit 1; }

# scripts the page loads at runtime
for f in sky.js reel3d.js set-clay.js; do cp "$SRC/$f" "$DST/$f"; done

# images: top-level webp only; project images stay out while the projects page is being reworked
mkdir -p "$DST/img"
for f in "$SRC"/img/*.webp; do
  case "$(basename "$f")" in c18.webp|ml-tps.webp|pyseqm.webp) continue ;; esac
  cp "$f" "$DST/img/"
done

# production index.html: see prepare-home.py
python3 -I "$(dirname "$0")/prepare-home.py" "$SRC/home-sidebar.html" "$DST/index.html"
echo "synced home page from $SRC"
