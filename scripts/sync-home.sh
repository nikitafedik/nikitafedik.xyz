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

# the page file is a body fragment with its title, links and styles at the top; give it a proper document
python3 -I - "$SRC/home-sidebar.html" "$DST/index.html" <<'PY'
import sys
src, dst = sys.argv[1:3]
t = open(src, encoding='utf-8').read()
# the CV page is not published yet, so its nav entry comes out of the home page's sidebar copy
import re
t, n = re.subn(r'\n[ \t]*<a href="cv\.html"[^\n]*</a>', '', t)
print(f'removed {n} CV nav link(s)')
cut = t.find('<!-- review bar')
if cut < 0: cut = t.find('<div class="shell">')
head, body = t[:cut], t[cut:]
doc = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
       + head.strip() + '\n</head>\n<body>\n' + body.strip() + '\n</body>\n</html>\n')
open(dst, 'w', encoding='utf-8').write(doc)
PY
echo "synced home page from $SRC"
