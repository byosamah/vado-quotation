#!/usr/bin/env python3
"""Bundle the fillable HTML twin of the VADO proposal deck.

    python3 html/build_html.py                       # blank, tags showing
    python3 html/build_html.py --data jobs/x.json    # pre-filled

Everything ends up inside one .html file: the fonts as base64 woff2, the
images as base64 data URIs, and theme.json plus content.json as JSON. The
file works with no network, no server and no fonts installed, which is the
whole point: it is handed to a colleague who opens it and types.

The Python deck in ../ is not touched. This reads the same three JSON
layers, so a change to content.json reaches the .pptx and this together.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, 'src')
USER_FONTS = os.path.expanduser('~/Library/Fonts')

# Aller is not on this machine and VADO chose Cairo in its place, so the
# three English aliases are remapped here rather than in theme.json: the
# PowerPoint still wants Aller, and theme.json is what the PowerPoint reads.
FONT_FILES = {
    'GESSTextLight':  'ArbFONTS-GE_SS_TEXT_LIGHT.otf',
    'GESSTextMedium': 'ArbFONTS-GE-SS-Text-Medium_26.otf',
    'GESSTextBold':   'ArbFONTS-GE-SS-Text-Bold_26.otf',
    'CairoLight':     'Cairo-Light.ttf',
    'CairoRegular':   'Cairo-Regular.ttf',
    'CairoSemiBold':  'Cairo-SemiBold.ttf',
    'CairoBold':      'Cairo-Bold.ttf',
    'CairoBlack':     'Cairo-Black.ttf',
}

# theme alias -> (css family stack, digit family). The digit family is the
# face the browser is told to use for U+0030-0039 only, which is how the
# deck gets 402 instead of the Arabic-Indic glyphs GE SS Text draws.
ALIASES = {
    'ar_light':    ('GESSTextLight',  'CairoRegular'),
    'ar_medium':   ('GESSTextMedium', 'CairoRegular'),
    'ar_bold':     ('GESSTextBold',   'CairoSemiBold'),
    'cairo':       ('CairoRegular',   None),
    'cairo_semi':  ('CairoSemiBold',  None),
    'cairo_xbold': ('CairoBold',      None),   # Cairo ExtraBold is not installed
    'cairo_black': ('CairoBlack',     None),
    'en':          ('CairoRegular',   None),   # was Aller
    'en_light':    ('CairoLight',     None),   # was Aller Light
    'en_display':  ('CairoSemiBold',  None),   # was Aller Display
    'num':         ('CairoRegular',   None),
    'num_semi':    ('CairoSemiBold',  None),
    'num_en':      ('CairoRegular',   None),
    'num_en_light':('CairoLight',     None),
}


CACHE = os.path.join(HERE, '.fontcache')


def woff2(path):
    """The font as base64 woff2, converted once and then remembered.

    fontTools does not produce the same bytes twice from the same input.
    Without this cache a rebuild that changed nothing still rewrote all
    eight fonts: same file length, 624 kB of different bytes. Every rebuild
    then landed in git as an unreadable 1.7 MB diff, and `git status` could
    no longer answer whether the deployed build was current.

    Keyed on the bytes of the source font, so replacing or updating a font
    converts it again. Delete html/.fontcache to force the work.
    """
    from fontTools.ttLib import TTFont
    with open(path, 'rb') as fh:
        digest = hashlib.sha256(fh.read()).hexdigest()[:32]
    hit = os.path.join(CACHE, digest + '.b64')
    if os.path.exists(hit):
        with open(hit, encoding='ascii') as fh:
            cached = fh.read()
        # A truncated cache file would embed a font the browser cannot
        # parse, and a font that fails to load is silent: the page renders
        # in a fallback face and every line in the deck moves.
        #
        # Checking the magic bytes is not enough. Cut a valid base64 string
        # short and the first four bytes still decode to wOF2, so the first
        # version of this check waved half a font through and the build
        # embedded 71 kB of truncated brotli. woff2 states its own total
        # length at offset 8; compare that with what actually arrived.
        try:
            raw = base64.b64decode(cached, validate=True)
            if (raw[:4] == b'wOF2' and len(raw) >= 12 and
                    int.from_bytes(raw[8:12], 'big') == len(raw)):
                return cached
        except Exception:
            pass
        os.remove(hit)

    f = TTFont(path)
    f.flavor = 'woff2'
    buf = io.BytesIO()
    f.save(buf)
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')

    os.makedirs(CACHE, exist_ok=True)
    tmp = hit + '.tmp'
    with open(tmp, 'w', encoding='ascii') as fh:
        fh.write(b64)
    os.replace(tmp, hit)      # a half-written cache file must never be read
    return b64


def face_metrics(family):
    """Ascent, descent and line gap as fractions of the em, from hhea."""
    from fontTools.ttLib import TTFont
    path = os.path.join(USER_FONTS, FONT_FILES[family])
    f = TTFont(path, lazy=True)
    upm = f['head'].unitsPerEm
    h = f['hhea']
    return (h.ascender / upm, -h.descender / upm, h.lineGap / upm)


def build_fonts():
    """Every face, plus one digits-only face per alias that needs one.

    The digits face has to sit FIRST in the stack, or the Arabic face
    serves the digits and draws them as Arabic-Indic. But a browser takes a
    line box from the first font in the stack whether or not a glyph ever
    comes from it, and Cairo declares a 1.874 em line box against GE SS
    Text's 1.245. Put in front, it made every Arabic line in the deck four
    per cent taller than it should be, which is small until you stack eight
    of them: on the contents page the numbers ended a whole row above the
    names they label.

    So each digits face is declared with the metrics of the face it sits in
    front of. It can then draw a Western 4 without touching the line.
    """
    faces, missing = [], []
    for name, filename in FONT_FILES.items():
        path = os.path.join(USER_FONTS, filename)
        if not os.path.exists(path):
            missing.append(filename)
            continue
        b64 = woff2(path)
        faces.append(f"@font-face{{font-family:'{name}';"
                     f"src:url(data:font/woff2;base64,{b64}) format('woff2');"
                     f"font-weight:normal;font-style:normal;font-display:block}}")

    for alias, (family, digits) in ALIASES.items():
        if not digits or family not in FONT_FILES or digits not in FONT_FILES:
            continue
        dpath = os.path.join(USER_FONTS, FONT_FILES[digits])
        if not os.path.exists(dpath):
            continue
        asc, desc, gap = face_metrics(family)
        faces.append(
            f"@font-face{{font-family:'{alias}Num';"
            f"src:url(data:font/woff2;base64,{woff2(dpath)}) format('woff2');"
            f"unicode-range:U+0030-0039;"
            f"ascent-override:{asc * 100:.2f}%;"
            f"descent-override:{desc * 100:.2f}%;"
            f"line-gap-override:{gap * 100:.2f}%;"
            f"font-display:block}}")

    if missing:
        print('WARNING: missing font files: ' + ', '.join(missing), file=sys.stderr)
    return '\n'.join(faces)


SKILL_FIELDS = os.path.expanduser(
    '~/.claude/skills/vado-proposal/references/fields.md')

# Where the value comes from, per section of fields.md, in the words the
# person filling it in would use.
SECTION_SOURCE = {
    'Reference': 'من جدول المتابعة',
    'Client': 'من العميل',
    'Project': 'من اجتماع البداية',
    'Land': 'من الصك',
    'Location': 'من الخرائط',
    'Balady limits': 'من بلدي',
    'Architecture': 'قرار تصميمي',
    'Money': 'قرار تجاري',
}

# The order a person actually gathers the values: the reference first, then
# the client, then the land, then the one Balady page, then the decisions.
# A page's fields are listed in this order rather than in the order they
# happen to be drawn, so someone holding one document answers from it once.
SECTION_ORDER = ['Reference', 'Client', 'Project', 'Land', 'Location',
                 'Balady limits', 'Architecture', 'Money']

BALADY_SECTION = 'Balady limits'


def field_labels():
    """The Arabic label, source and a real example for each of the 49 fields.

    Parsed out of the skill's references/fields.md rather than written again
    here. That file is the old Excel instruction column: it already says what
    every field is called on the document it is copied from. Authoring a
    second list would mean two lists, and one of them would go stale.

    The tables do not all have the same columns, so the field is taken from
    the first cell, the Arabic label from the second, and the example from
    the last.
    """
    out = {}
    seq = [0]
    if not os.path.exists(SKILL_FIELDS):
        print('WARNING: no fields.md at ' + SKILL_FIELDS, file=sys.stderr)
        return out
    section = None
    with open(SKILL_FIELDS, encoding='utf-8') as fh:
        for line in fh:
            head = re.match(r'^## \d+\.\s+(.+?)\s*$', line)
            if head:
                section = head.group(1)
                continue
            if not line.startswith('| `'):
                continue
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            if len(cells) < 3:
                continue
            name = cells[0].strip('` ')
            out[name] = {
                'ar': cells[1],
                'source': SECTION_SOURCE.get(section, ''),
                'example': cells[-1].strip('` '),
                'balady': section == BALADY_SECTION,
                'group': (SECTION_ORDER.index(section)
                          if section in SECTION_ORDER else 99),
                'order': seq[0],
            }
            seq[0] += 1

    # Six fields are the English twin of an Arabic one, and fields.md
    # naturally labels them in English: `firstname` is "first name". On an
    # Arabic screen that reads as a gap in the translation, so each one
    # borrows its twin's label and says which language it holds.
    arabic = re.compile(r'[\u0600-\u06FF]')
    for name, meta in out.items():
        twin = out.get(name + '_ar')
        if twin and not arabic.search(meta['ar']):
            meta['ar'] = twin['ar'] + ' بالإنجليزية'
            meta['group'] = twin['group']      # keep the pair together
            meta['order'] = twin['order'] + 0.5   # and just after it
    return out


def line_heights():
    """How tall a line is, as a multiple of the point size.

    PowerPoint's lnSpc percentage multiplies 1.2 times the point size, not
    the font's own metrics. The deck proves it: `scope.page_capacity` is 32
    lines, the scope box is 732.6 pt, and those lines are 11 pt at 150%.

        32 x 11 x 1.5 x 1.2   = 634 pt   fits the box
        32 x 11 x 1.5 x 1.874 = 989 pt   does not, by a mile

    1.874 is Cairo's declared line height and 1.245 is GE SS Text's. Using
    them made the scope run 275 pt off the bottom of page 7 and pushed the
    phases table clean off page 9. The number that reproduces the deck's own
    declared geometry is 1.2, for every face.

    It stays a per-alias map so a face with genuinely different behaviour
    can be given its own value without touching the renderer.
    """
    return {alias: 1.2 for alias in ALIASES}


def build_alias_css():
    out = []
    for alias, (family, digits) in ALIASES.items():
        stack = f"'{alias}Num'," if digits else ''
        out.append(f".f-{alias}{{font-family:{stack}'{family}',sans-serif}}")
    return '\n'.join(out)


def build_assets():
    out = {}
    adir = os.path.join(ROOT, 'assets')
    for name in sorted(os.listdir(adir)):
        if not name.lower().endswith(('.png', '.jpg', '.jpeg', '.svg')):
            continue
        mime = 'image/svg+xml' if name.endswith('.svg') else \
               'image/jpeg' if name.lower().endswith(('.jpg', '.jpeg')) else 'image/png'
        with open(os.path.join(adir, name), 'rb') as fh:
            out[name] = f'data:{mime};base64,' + base64.b64encode(fh.read()).decode('ascii')
    return out


def read(*parts):
    with open(os.path.join(*parts), encoding='utf-8') as fh:
        return fh.read()


def load_json(path):
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', help='a job JSON to pre-fill with')
    ap.add_argument('--out', default=os.path.join(ROOT, 'out', 'VADO-TFP.html'))
    args = ap.parse_args()

    theme = load_json(os.path.join(ROOT, 'theme.json'))
    content = load_json(os.path.join(ROOT, 'content.json'))
    job = load_json(args.data) if args.data else {}
    job.pop('_doc', None)

    js = '\n'.join(read(SRC, n) for n in
                   ('core.js', 'ctx.js', 'slides.js', 'editor.js'))
    css = build_fonts() + '\n' + build_alias_css() + '\n' + read(SRC, 'styles.css')

    labels = field_labels()
    missing = [k for k in (content.get('fields') or {})
               if k != '_doc' and k not in labels]
    if missing:
        print('WARNING: no Arabic label for ' + ', '.join(sorted(missing)),
              file=sys.stderr)

    payload = json.dumps({'theme': theme, 'content': content, 'job': job,
                          'assets': build_assets(),
                          'lineHeights': line_heights(),
                          'labels': labels},
                         ensure_ascii=False, separators=(',', ':'))

    html = read(SRC, 'shell.html')
    html = html.replace('/*__CSS__*/', css)
    html = html.replace('/*__DATA__*/', 'window.VADO=' + payload + ';')
    html = html.replace('/*__JS__*/', js)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as fh:
        fh.write(html)
    print(f'wrote {args.out}  ({len(html) / 1048576:.1f} MB)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
