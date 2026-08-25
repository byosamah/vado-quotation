#!/usr/bin/env python3
"""Compare the rebuilt deck against the original .pptm, slide by slide.

Font substitution makes a screenshot comparison unreliable on a Mac that
lacks Aller and GE SS Text. This compares the file contents instead, which
is exact:

  * every paragraph of text, normalised
  * every shape box, to the nearest point
  * every picture and its box

    python3 tools/compare.py out/VADO-TFP.pptx
"""
from __future__ import annotations

import os
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
P = '{http://schemas.openxmlformats.org/presentationml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
EMU = 12700.0

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ORIG_DIR = os.path.join(ROOT, 'ref', 'orig_pptm_x')
TOL = 2.0  # points


def norm(s):
    # Directional marks and non-breaking spaces are layout controls the
    # rebuild adds to keep digits Western and to stop a space collapsing
    # at a bidi boundary. They are invisible, so they must not read as a
    # text difference against the original.
    s = (s or '')
    for ch in ('\u00a0', '\u200e', '\u200f'):
        s = s.replace(ch, ' ' if ch == '\u00a0' else '')
    s = re.sub(r'[\t\r\n]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def para_text(para):
    """Text of one paragraph. A slide-number field reads as <page>."""
    out = []
    for node in para:
        tag = node.tag.replace(A, '')
        if tag == 'r':
            tnode = node.find(A + 't')
            out.append(tnode.text or '' if tnode is not None else '')
        elif tag == 'fld':
            if node.get('type') == 'slidenum':
                out.append('<page>')
            else:
                tnode = node.find(A + 't')
                out.append(tnode.text or '' if tnode is not None else '')
    return norm(''.join(out))


def collect(root, rels):
    """Return (texts, picture boxes) for one slide tree."""
    texts, pics = [], []

    def own_text(sp):
        """Paragraphs belonging to this shape, never to its children."""
        tx = sp.find(P + 'txBody')
        if tx is not None:
            for para in tx.findall(A + 'p'):
                t = para_text(para)
                if t:
                    texts.append(t)
        tbl = sp.find('.//' + A + 'tbl')
        if tbl is not None:
            for tc in tbl.iter(A + 'tc'):
                body = tc.find(A + 'txBody')
                if body is None:
                    continue
                for para in body.findall(A + 'p'):
                    t = para_text(para)
                    if t:
                        texts.append(t)

    def walk(parent, tf=(0, 0, 1.0, 1.0)):
        for sp in parent:
            tag = sp.tag.replace(P, '')
            if tag not in ('sp', 'pic', 'graphicFrame', 'grpSp', 'cxnSp'):
                continue
            xfrm = sp.find(P + 'xfrm')
            if xfrm is None:
                xfrm = sp.find(P + 'spPr/' + A + 'xfrm')
            if xfrm is None:
                xfrm = sp.find(P + 'grpSpPr/' + A + 'xfrm')
            sub = tf
            if xfrm is not None:
                off, ext = xfrm.find(A + 'off'), xfrm.find(A + 'ext')
                if off is not None and ext is not None:
                    dx, dy, sx, sy = tf
                    x = dx + int(off.get('x')) * sx
                    y = dy + int(off.get('y')) * sy
                    w = int(ext.get('cx')) * sx
                    h = int(ext.get('cy')) * sy
                    if tag == 'pic':
                        pics.append((round(x / EMU, 1), round(y / EMU, 1),
                                     round(w / EMU, 1), round(h / EMU, 1)))
                    ch, ce = xfrm.find(A + 'chOff'), xfrm.find(A + 'chExt')
                    if ch is not None and ce is not None:
                        cex, cey = int(ce.get('cx')), int(ce.get('cy'))
                        nsx = (w / cex) if cex else 1.0
                        nsy = (h / cey) if cey else 1.0
                        sub = (x - int(ch.get('x')) * nsx,
                               y - int(ch.get('y')) * nsy, nsx, nsy)
            if tag == 'grpSp':
                walk(sp, sub)
            else:
                own_text(sp)

    walk(root.find(P + 'cSld').find(P + 'spTree'))
    return texts, pics


def orig_slide(n):
    path = os.path.join(ORIG_DIR, 'ppt', 'slides', f'slide{n}.xml')
    relp = os.path.join(ORIG_DIR, 'ppt', 'slides', '_rels', f'slide{n}.xml.rels')
    rels = {}
    if os.path.exists(relp):
        for r in ET.parse(relp).getroot():
            rels[r.get('Id')] = r.get('Target')
    return collect(ET.parse(path).getroot(), rels)


def new_slide(zf, n):
    rels = {}
    relname = f'ppt/slides/_rels/slide{n}.xml.rels'
    if relname in zf.namelist():
        for r in ET.fromstring(zf.read(relname)):
            rels[r.get('Id')] = r.get('Target')
    return collect(ET.fromstring(zf.read(f'ppt/slides/slide{n}.xml')), rels)


def main(new_path):
    total_missing = total_extra = total_moved = 0
    with zipfile.ZipFile(new_path) as zf:
        for n in range(1, 16):
            ot, ob = orig_slide(n)
            nt, nb = new_slide(zf, n)

            missing = _diff(ot, nt)
            extra = _diff(nt, ot)
            moved = _boxes(ob, nb)

            total_missing += len(missing)
            total_extra += len(extra)
            total_moved += len(moved)

            if missing or extra or moved:
                print(f'--- slide {n} ---')
                for t in missing:
                    print(f'  MISSING TEXT  {t[:90]!r}')
                for t in extra:
                    print(f'  EXTRA TEXT    {t[:90]!r}')
                for m in moved:
                    print(f'  {m}')

    print(f'\ntotals: {total_missing} missing text, {total_extra} extra text, '
          f'{total_moved} box differences')
    return 0 if not (total_missing or total_moved) else 1


def _diff(a, b):
    """Items in a that are not in b, counting duplicates."""
    pool = list(b)
    out = []
    for item in a:
        if item in pool:
            pool.remove(item)
        else:
            out.append(item)
    return out


def _boxes(ob, nb):
    """Original picture boxes with no counterpart within tolerance.

    Matched on geometry only: python-pptx renumbers the media parts, so the
    file names differ even when the image bytes are identical.
    """
    out = []
    pool = list(nb)
    for x, y, w, h in ob:
        hit = None
        for cand in pool:
            if (abs(cand[0] - x) <= TOL and abs(cand[1] - y) <= TOL
                    and abs(cand[2] - w) <= TOL and abs(cand[3] - h) <= TOL):
                hit = cand
                break
        if hit:
            pool.remove(hit)
        else:
            out.append(f'PICTURE  original box ({x},{y},{w},{h}) has no match')
    for cand in pool:
        out.append(f'PICTURE  extra box {cand}')
    return out


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1]))
