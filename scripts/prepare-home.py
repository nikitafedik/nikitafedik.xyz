# Turns the standalone home page into the production index.html:
#  - takes out the nav link to the CV page, which is not published yet
#  - takes out the review tools (toolbar with "fonts and colors" / perf, and the style panel); the home page source
#    keeps them for testing
#  - makes the script calls that touch those tools safe when the elements are missing (a no-op where the source
#    already guards them), so a missing element can never stop the rest of the page script
#  - wraps the body fragment in a proper document
# usage: python3 prepare-home.py SOURCE.html OUT.html
import re, sys
src, dst = sys.argv[1:3]
t = open(src, encoding='utf-8').read()

t, n = re.subn(r'\n[ \t]*<a href="cv\.html"[^\n]*</a>', '', t)
print(f'removed {n} CV nav link(s)')

cut = t.find('<!-- review bar')
if cut < 0: cut = t.find('<div class="shell">')
head, body = t[:cut], t[cut:]

body, n1 = re.subn(r'<!-- review bar[^\n]*-->\s*', '', body, count=1)
body, n2 = re.subn(r'<div class="review"[^>]*>[\s\S]*?</div>\s*', '', body, count=1)
body, n3 = re.subn(r'<div class="style-panel" id="stylePanel"[^>]*>[\s\S]*?</div>\s*', '', body, count=1)
if not (n2 and n3):
    sys.exit(f'review toolbar or style panel not found (toolbar {n2}, panel {n3}); check the home page source')
print('removed the review toolbar and the style panel')

guards = [
    ('accentBox.append(lab);', 'accentBox?.append(lab);'),
    ('fontBox.append(lab);', 'fontBox?.append(lab);'),
    ('tagBox.append(lab);', 'tagBox?.append(lab);'),
    ("styleBtn.addEventListener('click'", "styleBtn?.addEventListener('click'"),
    ("e.key === 'Escape' && !panel.hidden", "e.key === 'Escape' && panel && !panel.hidden"),
    ("perfBtn.addEventListener('click'", "perfBtn?.addEventListener('click'"),
]
patched = 0
for a, b in guards:
    if a in body:
        body = body.replace(a, b); patched += 1
print(f'guarded {patched} review-tool hook(s)')
# a top-level statement still calling one of these elements unguarded would stop the page script at load
# (calls inside the guarded handlers above can never run once the elements are gone)
for name in ('styleBtn', 'perfBtn', 'perfHud', 'panel', 'accentBox', 'fontBox', 'tagBox'):
    for m in re.finditer(rf'^{name}\.(addEventListener|append|setAttribute|hidden|innerHTML|querySelector|focus)', body, re.M):
        sys.exit(f'unguarded top-level {name}.{m.group(1)} at body line {body[:m.start()].count(chr(10)) + 1}; guard it before deploying')

doc = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
       '<link rel="icon" href="favicon.svg" type="image/svg+xml">\n'
       + head.strip() + '\n</head>\n<body>\n' + body.strip() + '\n</body>\n</html>\n')
open(dst, 'w', encoding='utf-8').write(doc)
