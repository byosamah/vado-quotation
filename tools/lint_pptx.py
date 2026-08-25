#!/usr/bin/env python3
"""Check a .pptx for the OOXML mistakes PowerPoint silently "repairs".

A repaired file loses formatting without telling anyone, so this runs as
part of every build.

    python3 tools/lint_pptx.py out/VADO-TFP.pptx
"""
from __future__ import annotations

import sys
import zipfile
from xml.etree import ElementTree as ET

A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'

FILL = ['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill']
AUTOFIT = ['noAutofit', 'normAutofit', 'spAutoFit']
BULLET = ['buNone', 'buAutoNum', 'buChar']

# child order, by local element name
ORDER = {
    'rPr': ['ln'] + FILL + ['effectLst', 'effectDag', 'highlight', 'uLnTx', 'uLn',
                            'uFillTx', 'uFill', 'latin', 'ea', 'cs', 'sym',
                            'hlinkClick', 'hlinkMouseOver', 'rtl', 'extLst'],
    'defRPr': ['ln'] + FILL + ['effectLst', 'effectDag', 'highlight', 'uLnTx', 'uLn',
                               'uFillTx', 'uFill', 'latin', 'ea', 'cs', 'sym',
                               'hlinkClick', 'hlinkMouseOver', 'rtl', 'extLst'],
    'endParaRPr': ['ln'] + FILL + ['effectLst', 'effectDag', 'highlight', 'uLnTx',
                                   'uLn', 'uFillTx', 'uFill', 'latin', 'ea', 'cs',
                                   'sym', 'hlinkClick', 'hlinkMouseOver', 'rtl',
                                   'extLst'],
    'pPr': ['lnSpc', 'spcBef', 'spcAft', 'buClrTx', 'buClr', 'buSzTx', 'buSzPct',
            'buSzPts', 'buFontTx', 'buFont', 'buNone', 'buAutoNum', 'buChar',
            'tabLst', 'defRPr', 'extLst'],
    'tcPr': ['lnL', 'lnR', 'lnT', 'lnB', 'lnTlToBr', 'lnBlToTr', 'cell3D'] + FILL
            + ['headers', 'extLst'],
    'ln': FILL + ['prstDash', 'custDash', 'round', 'bevel', 'miter', 'headEnd',
                  'tailEnd', 'extLst'],
    'bodyPr': ['prstTxWarp'] + AUTOFIT + ['scene3d', 'sp3d', 'flatTx', 'extLst'],
    'p': ['pPr', 'r', 'br', 'fld', 'endParaRPr'],
    'tbl': ['tblPr', 'tblGrid', 'tr'],
    'txBody': ['bodyPr', 'lstStyle', 'p'],
}

# groups where at most one child may appear
SINGLETON_GROUPS = {
    'bodyPr': [AUTOFIT],
    'pPr': [BULLET],
    'rPr': [FILL],
    'defRPr': [FILL],
    'endParaRPr': [FILL],
    'tcPr': [FILL],
    'ln': [FILL],
    'spPr': [FILL],
    'grpSpPr': [FILL],
    'txBody': [],
}

# elements that may appear only once inside their parent
ONCE = {'bodyPr', 'lstStyle', 'pPr', 'endParaRPr', 'tblPr', 'tblGrid',
        'xfrm', 'prstGeom', 'custGeom', 'latin', 'ea', 'cs', 'lnSpc',
        'spcBef', 'spcAft', 'tabLst'}


def lint(path):
    problems = []
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if not name.endswith('.xml'):
                continue
            if not (name.startswith('ppt/slides/') or name.startswith('ppt/slideLayouts/')
                    or name.startswith('ppt/slideMasters/') or name == 'ppt/presentation.xml'):
                continue
            root = ET.fromstring(z.read(name))
            _walk(root, name, problems)
            if name.startswith('ppt/slides/'):
                _bidi(root, name, problems)
    return problems


def _bidi(root, where, problems):
    """A paragraph mixing Arabic with digits or Latin needs a base direction.

    Without rtl="1" the layout engine falls back to left-to-right, so
    "14 يوم" comes out as "14 يوم" reading left to right instead of the
    number sitting on the right where Arabic puts it. Pure Arabic survives
    either way, which is why this class of bug hides until a number turns up
    in the sentence.
    """
    for para in root.iter(A + 'p'):
        text = ''.join(t.text or '' for t in para.iter(A + 't'))
        if not any(0x0600 <= ord(c) <= 0x06FF for c in text):
            continue
        if not any(c.isascii() and c.isalnum() for c in text):
            continue
        pPr = para.find(A + 'pPr')
        if pPr is not None and pPr.get('rtl') == '1':
            continue
        snippet = ' '.join(text.split())[:50]
        problems.append(f'{where}: mixed Arabic and Latin with no rtl="1": {snippet!r}')


def _walk(el, where, problems, path=''):
    local = el.tag.split('}')[-1]
    here = f'{path}/{local}'
    kids = [c.tag.split('}')[-1] for c in el if isinstance(c.tag, str)]

    order = ORDER.get(local)
    if order:
        seen = -1
        for k in kids:
            if k in order:
                i = order.index(k)
                if i < seen:
                    problems.append(f'{where} {here}: <{k}> is out of order')
                seen = max(seen, i)

    for group in SINGLETON_GROUPS.get(local, []):
        hits = [k for k in kids if k in group]
        if len(hits) > 1:
            problems.append(f'{where} {here}: {len(hits)} of {group} ({hits})')

    for k in set(kids):
        if k in ONCE and kids.count(k) > 1:
            problems.append(f'{where} {here}: <{k}> appears {kids.count(k)} times')

    for c in el:
        if isinstance(c.tag, str):
            _walk(c, where, problems, here)


if __name__ == '__main__':
    found = lint(sys.argv[1])
    for p in found:
        print(p)
    print(f'{len(found)} problem(s)')
    raise SystemExit(1 if found else 0)
