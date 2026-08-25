#!/usr/bin/env python3
"""Dump full shape geometry + text formatting from the original VADO .pptm.

Positions are printed in points (1 pt = 12700 EMU) because python-pptx
authoring is easiest in Pt(). Run:

    python3 tools/extract_geom.py <slide_number>
"""
import sys, os, re, glob
from xml.etree import ElementTree as ET

A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
P = '{http://schemas.openxmlformats.org/presentationml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
EMU_PT = 12700.0

BASE = os.path.join(os.path.dirname(__file__), '..', 'ref', 'orig_pptm_x')


def pt(v):
    if v is None:
        return None
    return round(int(v) / EMU_PT, 1)


def color_of(el):
    """Return a colour string for the first colour child of el."""
    if el is None:
        return None
    s = el.find(A + 'srgbClr')
    if s is not None:
        alpha = s.find(A + 'alpha')
        a = f" a{int(alpha.get('val'))//1000}%" if alpha is not None else ''
        return '#' + s.get('val') + a
    sc = el.find(A + 'schemeClr')
    if sc is not None:
        return 'scheme:' + sc.get('val')
    return None


def fill_of(spPr):
    if spPr is None:
        return None
    if spPr.find(A + 'noFill') is not None:
        return 'none'
    sf = spPr.find(A + 'solidFill')
    if sf is not None:
        return color_of(sf)
    if spPr.find(A + 'gradFill') is not None:
        return 'gradient'
    if spPr.find(A + 'blipFill') is not None:
        return 'picture'
    return None


def line_of(spPr):
    if spPr is None:
        return None
    ln = spPr.find(A + 'ln')
    if ln is None:
        return None
    if ln.find(A + 'noFill') is not None:
        return 'none'
    w = ln.get('w')
    c = color_of(ln.find(A + 'solidFill'))
    dash = ln.find(A + 'prstDash')
    d = dash.get('val') if dash is not None else ''
    return f"{c or ''} w={pt(w) if w else 'thin'}pt {d}".strip()


def runs_of(para):
    out = []
    for r in para:
        tag = r.tag.replace(A, '')
        if tag == 'r':
            rPr = r.find(A + 'rPr')
            t = r.find(A + 't')
            info = {'text': t.text if t is not None else ''}
            if rPr is not None:
                if rPr.get('sz'):
                    info['sz'] = int(rPr.get('sz')) / 100
                if rPr.get('b') == '1':
                    info['b'] = True
                if rPr.get('i') == '1':
                    info['i'] = True
                if rPr.get('u'):
                    info['u'] = rPr.get('u')
                if rPr.get('spc'):
                    info['spc'] = int(rPr.get('spc')) / 100
                if rPr.get('baseline'):
                    info['baseline'] = rPr.get('baseline')
                c = color_of(rPr.find(A + 'solidFill'))
                if c:
                    info['color'] = c
                lat = rPr.find(A + 'latin')
                cs = rPr.find(A + 'cs')
                if lat is not None:
                    info['latin'] = lat.get('typeface')
                if cs is not None:
                    info['cs'] = cs.get('typeface')
            out.append(info)
        elif tag == 'br':
            out.append({'text': '\\n(BR)'})
        elif tag == 'fld':
            t = r.find(A + 't')
            out.append({'text': f"[FIELD {r.get('type')}: {t.text if t is not None else ''}]"})
    return out


def dump_text(txBody, indent):
    pad = ' ' * indent
    bodyPr = txBody.find(A + 'bodyPr')
    if bodyPr is not None:
        bits = []
        for k in ('anchor', 'vert', 'wrap', 'lIns', 'tIns', 'rIns', 'bIns', 'rtlCol'):
            if bodyPr.get(k):
                v = bodyPr.get(k)
                if k.endswith('Ins'):
                    v = f"{pt(v)}pt"
                bits.append(f"{k}={v}")
        if bodyPr.find(A + 'normAutofit') is not None:
            na = bodyPr.find(A + 'normAutofit')
            bits.append(f"normAutofit fontScale={na.get('fontScale')} lnSpcReduction={na.get('lnSpcReduction')}")
        if bodyPr.find(A + 'spAutoFit') is not None:
            bits.append('spAutoFit')
        if bits:
            print(pad + 'bodyPr: ' + ' '.join(bits))
    for para in txBody.findall(A + 'p'):
        pPr = para.find(A + 'pPr')
        pbits = []
        if pPr is not None:
            for k in ('algn', 'rtl', 'lvl', 'indent', 'marL', 'marR'):
                if pPr.get(k):
                    v = pPr.get(k)
                    if k in ('indent', 'marL', 'marR'):
                        v = f"{pt(v)}pt"
                    pbits.append(f"{k}={v}")
            ln = pPr.find(A + 'lnSpc')
            if ln is not None:
                sp = ln.find(A + 'spcPct')
                sp2 = ln.find(A + 'spcPts')
                if sp is not None:
                    pbits.append(f"lnSpc={int(sp.get('val'))/1000}%")
                if sp2 is not None:
                    pbits.append(f"lnSpc={int(sp2.get('val'))/100}pt")
            for tag, label in ((A + 'spcBef', 'spcBef'), (A + 'spcAft', 'spcAft')):
                e = pPr.find(tag)
                if e is not None:
                    sp = e.find(A + 'spcPts')
                    if sp is not None:
                        pbits.append(f"{label}={int(sp.get('val'))/100}pt")
            if pPr.find(A + 'buNone') is not None:
                pbits.append('buNone')
            bc = pPr.find(A + 'buChar')
            if bc is not None:
                pbits.append(f"buChar={bc.get('char')!r}")
            ba = pPr.find(A + 'buAutoNum')
            if ba is not None:
                pbits.append(f"buAutoNum={ba.get('type')}")
        rs = runs_of(para)
        txt = ''.join(r.get('text') or '' for r in rs)
        head = pad + 'P'
        if pbits:
            head += '[' + ' '.join(pbits) + ']'
        print(f"{head} {txt!r}")
        for r in rs:
            meta = {k: v for k, v in r.items() if k != 'text'}
            if meta and r.get('text', '').strip():
                print(pad + '   run ' + repr(r['text'][:40]) + ' ' + str(meta))
            elif meta:
                print(pad + '   (empty run) ' + str(meta))


def dump_table(gf, indent):
    pad = ' ' * indent
    tbl = gf.find('.//' + A + 'tbl')
    if tbl is None:
        print(pad + '(graphicFrame, no table)')
        return
    grid = tbl.find(A + 'tblGrid')
    widths = [pt(c.get('w')) for c in grid.findall(A + 'gridCol')]
    print(pad + f"TABLE cols={widths}")
    for ri, tr in enumerate(tbl.findall(A + 'tr')):
        print(pad + f"  row{ri} h={pt(tr.get('h'))}pt")
        for ci, tc in enumerate(tr.findall(A + 'tc')):
            tcPr = tc.find(A + 'tcPr')
            f = fill_of(tcPr)
            span = ''
            if tc.get('gridSpan'):
                span += f" gridSpan={tc.get('gridSpan')}"
            if tc.get('rowSpan'):
                span += f" rowSpan={tc.get('rowSpan')}"
            if tc.get('hMerge'):
                span += ' hMerge'
            if tc.get('vMerge'):
                span += ' vMerge'
            marg = ''
            if tcPr is not None:
                mb = [f"{k}={pt(tcPr.get(k))}" for k in ('marL', 'marR', 'marT', 'marB') if tcPr.get(k)]
                if mb:
                    marg = ' ' + ' '.join(mb)
                if tcPr.get('anchor'):
                    marg += f" anchor={tcPr.get('anchor')}"
            print(pad + f"    cell[{ri}][{ci}] fill={f}{span}{marg}")
            tx = tc.find(A + 'txBody')
            if tx is not None:
                dump_text(tx, indent + 6)


IDENTITY = (0, 0, 1.0, 1.0)  # dx, dy, sx, sy applied to child coords


def apply_tf(tf, x, y, cx, cy):
    dx, dy, sx, sy = tf
    return (dx + x * sx, dy + y * sy, cx * sx, cy * sy)


def child_tf(tf, off, ext, ch, ce):
    """Compose the parent transform with a group's own child-space mapping."""
    ax, ay, acx, acy = apply_tf(tf, int(off.get('x')), int(off.get('y')),
                                int(ext.get('cx')), int(ext.get('cy')))
    chx, chy = int(ch.get('x')), int(ch.get('y'))
    cex, cey = int(ce.get('cx')), int(ce.get('cy'))
    sx = acx / cex if cex else 1.0
    sy = acy / cey if cey else 1.0
    return (ax - chx * sx, ay - chy * sy, sx, sy)


def walk(shapes_parent, rels, indent=0, tf=IDENTITY):
    pad = ' ' * indent
    for sp in shapes_parent:
        tag = sp.tag.replace(P, '')
        if tag not in ('sp', 'pic', 'graphicFrame', 'grpSp', 'cxnSp'):
            continue
        nv = sp.find('.//' + P + 'cNvPr')
        name = nv.get('name') if nv is not None else '?'
        # graphicFrame carries <p:xfrm>; every other shape carries <a:xfrm>
        xfrm = sp.find(P + 'xfrm')
        if xfrm is None:
            xfrm = sp.find('.//' + A + 'xfrm')
        geo = ''
        sub_tf = tf
        if xfrm is not None:
            off = xfrm.find(A + 'off')
            ext = xfrm.find(A + 'ext')
            if off is not None and ext is not None:
                ax, ay, acx, acy = apply_tf(tf, int(off.get('x')), int(off.get('y')),
                                            int(ext.get('cx')), int(ext.get('cy')))
                geo = (f"x={round(ax/EMU_PT,1)} y={round(ay/EMU_PT,1)} "
                       f"w={round(acx/EMU_PT,1)} h={round(acy/EMU_PT,1)}")
            if xfrm.get('rot'):
                geo += f" rot={int(xfrm.get('rot'))/60000}deg"
            if xfrm.get('flipH'):
                geo += ' flipH'
            if xfrm.get('flipV'):
                geo += ' flipV'
            ch = xfrm.find(A + 'chOff')
            ce = xfrm.find(A + 'chExt')
            if ch is not None and ce is not None and off is not None and ext is not None:
                sub_tf = child_tf(tf, off, ext, ch, ce)

        spPr = sp.find(P + 'spPr')
        prst = ''
        if spPr is not None:
            pg = spPr.find(A + 'prstGeom')
            if pg is not None:
                prst = f" prst={pg.get('prst')}"
        f = fill_of(spPr)
        l = line_of(spPr)
        extra = ''
        if f:
            extra += f' fill={f}'
        if l:
            extra += f' line={l}'

        if tag == 'pic':
            blip = sp.find('.//' + A + 'blip')
            emb = blip.get(R + 'embed') if blip is not None else None
            target = rels.get(emb, '?')
            extra += f' image={os.path.basename(target)}'
            srcRect = sp.find('.//' + A + 'srcRect')
            if srcRect is not None:
                extra += f' srcRect={srcRect.attrib}'

        print(f"{pad}<{tag}> {name!r} {geo}{prst}{extra}")

        if tag == 'graphicFrame':
            dump_table(sp, indent + 2)
        tx = sp.find(P + 'txBody')
        if tx is not None:
            dump_text(tx, indent + 2)
        if tag == 'grpSp':
            walk(sp, rels, indent + 2, sub_tf)


def main(n):
    path = os.path.join(BASE, 'ppt', 'slides', f'slide{n}.xml')
    relpath = os.path.join(BASE, 'ppt', 'slides', '_rels', f'slide{n}.xml.rels')
    rels = {}
    if os.path.exists(relpath):
        for r in ET.parse(relpath).getroot():
            rels[r.get('Id')] = r.get('Target')
    root = ET.parse(path).getroot()
    tree = root.find(P + 'cSld').find(P + 'spTree')
    print(f"===== SLIDE {n} (canvas 756 x 1008 pt) =====")
    bg = root.find(P + 'cSld').find(P + 'bg')
    if bg is not None:
        print('BG:', fill_of(bg.find(P + 'bgPr')))
    walk(tree, rels)


if __name__ == '__main__':
    main(sys.argv[1])
