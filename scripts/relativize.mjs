// For the claude.ai artifact preview only: the artifact serves files next to the page, not from a site root,
// so root-relative asset links ("/assets/x.css") become relative ("assets/x.css"). Vercel builds skip this.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2] ?? 'dist';
let changed = 0;
for (const name of readdirSync(dir)) {
  const p = join(dir, name);
  if (!name.endsWith('.html') || !statSync(p).isFile()) continue;
  const before = readFileSync(p, 'utf8');
  const after = before.replace(/(href|src)="\/(assets\/)/g, '$1="$2');
  if (after !== before) { writeFileSync(p, after); changed++; }
}
console.log(`relativized asset paths in ${changed} page(s)`);
