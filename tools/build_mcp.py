#!/usr/bin/env python3
"""Bundle everything the MCP server needs into three generated modules.

    python3 tools/build_mcp.py

Writes, under `web/api/_mcp/`:

    _data.mjs       theme.json, content.json, the field labels, the page map
    _engine.mjs     ctx.js and checks.js, the browser's own engine
    _knowledge.mjs  the skill's reference files, as MCP resources

Nothing here is authored. Every value is copied from the file that already
owns it, which is the whole point: the assistant filling a proposal reads
the same field labels the browser draws, the same closed lists the pre-send
check validates against, and the same words the studio wrote.

The three files are generated and committed, the way `web/index.html` is,
because Vercel builds only the `web` directory and cannot reach the rest of
the repository. `deploy.sh` runs this; so does `tools/smoke.sh`.
"""
from __future__ import annotations

import ast
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from xml.etree import ElementTree as ET

ROOT = os.path.dirname(os.path.abspath(os.path.dirname(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'html'))
import build_html                                               # noqa: E402

OUT = os.path.join(ROOT, 'web', 'api', '_mcp')
EDITOR = os.path.join(ROOT, 'html', 'src', 'editor.js')
SKILL = os.path.expanduser('~/.claude/skills/vado-proposal/references')

A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
TAG = re.compile(r'\{\{\s*([a-zA-Z0-9_]+)\s*\}\}')
KEY = re.compile(r'''\'(?:\\.|[^\'\\])*\'|"(?:\\.|[^"\\])*"'''
                 r'''|([{,\[]\s*)([A-Za-z_$][\w$]*)\s*:''', re.S)

# The reference files the assistant may read, in the order it needs them.
# `guide.md` is this project's own and lives beside this script's output;
# the rest are the skill's, unchanged, because a second copy of the field
# table is a copy that goes stale.
KNOWLEDGE = [
    ('guide', 'كيف يُملأ العرض', os.path.join(ROOT, 'mcp', 'guide.md'),
     'How to fill a VADO proposal from start to finish. Read this first.'),
    ('what-to-ask', 'ما يُسأل عنه', os.path.join(SKILL, 'what-to-ask.md'),
     'The eight questions, and everything that must never be asked because '
     'the deck already knows it.'),
    ('fields', 'الحقول', os.path.join(SKILL, 'fields.md'),
     'Every field: its Arabic label, where the value comes from, its format '
     'and a real example.'),
    ('balady', 'قراءة بيانات بلدي', os.path.join(SKILL, 'balady.md'),
     'How to read pasted or photographed بلدي plot data, and what never to '
     'tidy up in it.'),
    ('arabic-english', 'العربية والإنجليزية', os.path.join(SKILL, 'arabic-english.md'),
     'Arabic to English for titles, cities, districts and project types.'),
    ('deck', 'الصفحات', os.path.join(SKILL, 'deck.md'),
     'What each of the fifteen pages is for, which fields feed it, and '
     'which pages carry risk.'),
]


def js_literal(node):
    """A JavaScript literal, as a Python value.

    Only what editor.js actually writes: strings, arrays and objects. A
    `new Set([...])` reaches here as the array inside it, because the caller
    reads from the opening bracket. Anything else raises, because a silent
    partial parse would hand the server a shorter list than the browser uses
    and the two would disagree about what counts as missing.
    """
    # Python's own literal parser, once the JavaScript-isms are gone.
    text = re.sub(r'/\*.*?\*/', '', node.strip(), flags=re.S)
    text = re.sub(r'(?m)//.*$', '', text)
    text = re.sub(r',\s*([\]}])', r'\1', text)              # trailing commas
    # An unquoted key becomes a quoted one. String literals are matched
    # first and handed back untouched, so an Arabic caption that happens to
    # contain a colon is never rewritten into a key.
    def quote(m):
        return m.group(0) if m.group(1) is None else m.group(1) + '"' + m.group(2) + '":'
    text = KEY.sub(quote, text)
    return ast.literal_eval(text)


def balanced(text, start, open_ch, close_ch):
    """The substring from `start` to its matching bracket."""
    depth, i, in_str, quote = 0, start, False, ''
    while i < len(text):
        ch = text[i]
        if in_str:
            if ch == '\\':
                i += 2
                continue
            if ch == quote:
                in_str = False
        elif ch in '"\'':
            in_str, quote = True, ch
        elif ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
        i += 1
    raise ValueError('unbalanced ' + open_ch)


def from_editor(name, open_ch='{', close_ch='}'):
    """One `const NAME = ...` out of editor.js.

    Read rather than repeated. These four decide which values count as
    missing, and a second copy of that decision is a second answer to
    «هل العرض جاهز؟».
    """
    src = open(EDITOR, encoding='utf-8').read()
    m = re.search(r'(?:const\s+)?%s\s*=\s*' % re.escape(name), src)
    if not m:
        raise SystemExit(f'build_mcp: no `{name} =` in html/src/editor.js. '
                         f'It moved or was renamed; this build cannot guess.')
    # From the opening bracket only: `new Set([...])` is read as its array.
    start = src.index(open_ch, m.end())
    return js_literal(balanced(src, start, open_ch, close_ch))


def page_map(content):
    """Which page prints which value.

    Taken from a blank build, where every unfilled value prints as its own
    `{{tag}}`, so the map is whatever the deck really draws rather than a
    list somebody kept up to date. `PAGE_FIELDS` adds the handful the page
    prints only when they are given, which therefore leave no tag behind.
    """
    tmp = tempfile.mkdtemp(prefix='vado-mcp-')
    pptx = os.path.join(tmp, 'blank.pptx')
    run = subprocess.run([sys.executable, os.path.join(ROOT, 'build.py'),
                          '--out', pptx],
                         capture_output=True, text=True, cwd=ROOT)
    if run.returncode:
        raise SystemExit('build_mcp: the blank deck would not build.\n' +
                         run.stdout + run.stderr)
    with open(pptx + '.manifest.json', encoding='utf-8') as fh:
        manifest = json.load(fh)

    where = {}
    with zipfile.ZipFile(pptx) as z:
        for row in manifest:
            name = 'ppt/slides/slide%d.xml' % row['slide']
            if name not in z.namelist():
                continue
            root = ET.fromstring(z.read(name))
            text = ''.join(t.text or '' for t in root.iter(A + 't'))
            for tag in TAG.findall(text):
                where.setdefault(tag, row['slide'])

    by_module = {row['module']: row['slide'] for row in reversed(manifest)}
    for module, names in from_editor('V.PAGE_FIELDS').items():
        for field in names:
            where.setdefault(field, by_module.get(module))
    return where


def mjs(value):
    """A JSON value as JavaScript. `</script` cannot occur in JSON we emit,
    and these files are never inlined into HTML, so JSON is safe as-is."""
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def header(what):
    return ('/* GENERATED by tools/build_mcp.py. Do not edit.\n'
            ' *\n'
            ' * ' + what + '\n'
            ' */\n')


def write(name, text):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(text)
    return path


def main():
    theme = json.load(open(os.path.join(ROOT, 'theme.json'), encoding='utf-8'))
    content = json.load(open(os.path.join(ROOT, 'content.json'), encoding='utf-8'))

    labels = build_html.field_labels()
    if not labels:
        raise SystemExit('build_mcp: no field labels. The skill\'s '
                         'references/fields.md is where they come from.')

    derived = from_editor('DERIVED')
    optional = from_editor('OPTIONAL', '[', ']')
    by_control = from_editor('BY_CONTROL', '[', ']')

    # The eight groups a person answers from one source at a time. The
    # English name orders them (it is what fields.md heads its sections
    # with) and the Arabic pair is what the panel already prints.
    headings = from_editor('GROUPS', '[', ']')
    if len(headings) != len(build_html.SECTION_ORDER):
        raise SystemExit('build_mcp: editor.js has %d field groups and '
                         'fields.md has %d. They must be the same eight.'
                         % (len(headings), len(build_html.SECTION_ORDER)))
    groups = [{'en': en, 'ar': h['ar'], 'source': h['src']}
              for en, h in zip(build_html.SECTION_ORDER, headings)]
    unprinted = (content.get('fields_unprinted') or {}).get('names') or []
    where = page_map(content)

    # What قبل الإرسال counts as missing: every value the document prints,
    # less the two it works out for itself, the one that may be empty on
    # purpose, and the four a control on page 12 owns.
    skip = set(derived) | set(optional) | set(by_control) | set(unprinted)
    countable = [k for k in content['fields']
                 if k != '_doc' and k not in skip and k in where]

    missing_label = [k for k in content['fields']
                     if k != '_doc' and k not in labels]
    if missing_label:
        print('WARNING: no Arabic label for ' + ', '.join(missing_label),
              file=sys.stderr)

    write('_data.mjs', header(
        'The three JSON layers, the field labels parsed out of the skill\'s\n'
        ' * fields.md, and which page prints which value, read off a blank build.')
        + 'export const theme = ' + mjs(theme) + ';\n'
        + 'export const content = ' + mjs(content) + ';\n'
        + 'export const labels = ' + mjs(labels) + ';\n'
        + 'export const groups = ' + mjs(groups) + ';\n'
        + 'export const pageOf = ' + mjs(where) + ';\n'
        + 'export const countable = ' + mjs(countable) + ';\n'
        + 'export const derived = ' + mjs(derived) + ';\n'
        + 'export const optional = ' + mjs(sorted(optional)) + ';\n'
        + 'export const byControl = ' + mjs(sorted(by_control)) + ';\n'
        + 'export const unprinted = ' + mjs(unprinted) + ';\n')

    engine = []
    for name in ('ctx.js', 'checks.js'):
        with open(os.path.join(ROOT, 'html', 'src', name), encoding='utf-8') as fh:
            engine.append('/* ---- html/src/%s ---- */\n%s' % (name, fh.read()))
    write('_engine.mjs', header(
        'html/src/ctx.js and html/src/checks.js, verbatim.\n'
        ' *\n'
        ' * The browser\'s own engine, run here. Same Arabic spelling of the fee,\n'
        ' * same payment amounts, same phase list, same programme. A port would\n'
        ' * be a second answer to every one of those.')
        + 'const V = {};\n' + '\n'.join(engine) + '\nexport default V;\n')

    docs = []
    for key, title, path, why in KNOWLEDGE:
        if not os.path.exists(path):
            raise SystemExit(f'build_mcp: {path} is missing, and the assistant '
                             f'reads it to know what to ask for.')
        with open(path, encoding='utf-8') as fh:
            docs.append({'id': key, 'title': title, 'why': why,
                         'text': fh.read()})
    write('_knowledge.mjs', header(
        'The skill\'s reference files, served as MCP resources.')
        + 'export const knowledge = ' + mjs(docs) + ';\n')

    print('wrote web/api/_mcp/_data.mjs, _engine.mjs, _knowledge.mjs')
    print(f'  {len(labels)} labels · {len(countable)} values counted · '
          f'{len(where)} on a page · {len(docs)} reference files')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
