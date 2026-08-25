"""Low-level drawing helpers over python-pptx.

Everything a slide module needs is here. The rules that matter:

* Coordinates are always points, measured from the top-left of the A3 page.
* Every Arabic paragraph must set rtl=True, or PowerPoint reorders the words.
* Every run must set both the Latin face and the complex-script face, or
  PowerPoint renders Arabic in Times New Roman.
"""
from __future__ import annotations

import copy

from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Pt

EMU_PER_PT = 12700

ALIGN = {
    'l': PP_ALIGN.LEFT,
    'r': PP_ALIGN.RIGHT,
    'c': PP_ALIGN.CENTER,
    'ctr': PP_ALIGN.CENTER,
    'just': PP_ALIGN.JUSTIFY,
}

ANCHOR = {'t': MSO_ANCHOR.TOP, 'ctr': MSO_ANCHOR.MIDDLE, 'b': MSO_ANCHOR.BOTTOM}


def pt(v):
    """Points to EMU, as python-pptx wants."""
    return Emu(int(round(float(v) * EMU_PER_PT)))


def rgb(hex_str):
    return RGBColor.from_string(hex_str.lstrip('#').upper())


# --------------------------------------------------------------------------
# raw XML helpers (python-pptx has no API for these)
# --------------------------------------------------------------------------

FILL_TAGS = ('a:noFill', 'a:solidFill', 'a:gradFill', 'a:blipFill',
             'a:pattFill', 'a:grpFill')

# OOXML validates child order strictly. PowerPoint silently "repairs" a file
# whose children are out of sequence, and a repaired file loses formatting.
ORDER = {
    'a:rPr': ['a:ln'] + list(FILL_TAGS) + [
        'a:effectLst', 'a:effectDag', 'a:highlight', 'a:uLnTx', 'a:uLn',
        'a:uFillTx', 'a:uFill', 'a:latin', 'a:ea', 'a:cs', 'a:sym',
        'a:hlinkClick', 'a:hlinkMouseOver', 'a:rtl', 'a:extLst'],
    'a:endParaRPr': ['a:ln'] + list(FILL_TAGS) + [
        'a:effectLst', 'a:effectDag', 'a:highlight', 'a:uLnTx', 'a:uLn',
        'a:uFillTx', 'a:uFill', 'a:latin', 'a:ea', 'a:cs', 'a:sym',
        'a:hlinkClick', 'a:hlinkMouseOver', 'a:rtl', 'a:extLst'],
    'a:pPr': ['a:lnSpc', 'a:spcBef', 'a:spcAft', 'a:buClrTx', 'a:buClr',
              'a:buSzTx', 'a:buSzPct', 'a:buSzPts', 'a:buFontTx', 'a:buFont',
              'a:buNone', 'a:buAutoNum', 'a:buChar', 'a:tabLst', 'a:defRPr',
              'a:extLst'],
    'a:tcPr': ['a:lnL', 'a:lnR', 'a:lnT', 'a:lnB', 'a:lnTlToBr', 'a:lnBlToTr',
               'a:cell3D'] + list(FILL_TAGS) + ['a:headers', 'a:extLst'],
    'a:ln': list(FILL_TAGS) + ['a:prstDash', 'a:custDash', 'a:round', 'a:bevel',
                               'a:miter', 'a:headEnd', 'a:tailEnd', 'a:extLst'],
    'a:p': ['a:pPr', 'a:r', 'a:br', 'a:fld', 'a:endParaRPr'],
}


def place(parent, el):
    """Insert `el` into `parent` at the position OOXML requires."""
    order = ORDER.get(parent.tag.split('}')[-1])
    if order is None:
        order = ORDER.get('a:' + parent.tag.split('}')[-1])
    if not order:
        parent.append(el)
        return el
    name = 'a:' + el.tag.split('}')[-1]
    try:
        idx = order.index(name)
    except ValueError:
        parent.append(el)
        return el
    for child in parent:
        cname = 'a:' + child.tag.split('}')[-1]
        if cname in order and order.index(cname) > idx:
            child.addprevious(el)
            return el
    parent.append(el)
    return el


def _sub(parent, tag, **attrs):
    el = parent.makeelement(qn(tag), {})
    for k, v in attrs.items():
        el.set(k, str(v))
    place(parent, el)
    return el


def _drop(parent, *tags):
    for tag in tags:
        old = parent.find(qn(tag))
        if old is not None:
            parent.remove(old)


def set_solid_fill(el, color_hex, alpha=None):
    """Put an <a:solidFill> on any element that accepts one (line, cell, ...)."""
    _drop(el, *FILL_TAGS)
    fill = el.makeelement(qn('a:solidFill'), {})
    clr = fill.makeelement(qn('a:srgbClr'), {'val': color_hex.lstrip('#').upper()})
    if alpha is not None:
        clr.append(clr.makeelement(qn('a:alpha'), {'val': str(int(alpha * 100000))}))
    fill.append(clr)
    place(el, fill)
    return fill


def set_no_fill(el):
    _drop(el, *FILL_TAGS)
    place(el, el.makeelement(qn('a:noFill'), {}))


# --------------------------------------------------------------------------
# text
# --------------------------------------------------------------------------

class Text:
    """Wraps a text frame and writes paragraphs into it."""

    def __init__(self, ctx, text_frame):
        self.ctx = ctx
        self.tf = text_frame
        self._first = True

    def para(self, runs=None, *, algn=None, rtl=False, ls=None, before=None,
             after=None, bullet=None, indent=None, margin_left=None,
             margin_right=None, level=None, tabs=None):
        """Append one paragraph.

        runs: a string, or a list of run dicts. A run dict is
              {"t": text, "f": font alias, "sz": pt, "b": bool, "c": colour key
               or #hex, "spc": tracking in pt, "u": "sng"}
        bullet: None (inherit), "none", a literal character, or "1." for
                automatic Arabic numbering.
        """
        if self._first and len(self.tf.paragraphs) == 1 and not self.tf.paragraphs[0].runs:
            p = self.tf.paragraphs[0]
        else:
            p = self.tf.add_paragraph()
        self._first = False

        if algn:
            p.alignment = ALIGN[algn]
        if ls is not None:
            p.line_spacing = ls
        if before is not None:
            p.space_before = Pt(before)
        if after is not None:
            p.space_after = Pt(after)
        if level is not None:
            p.level = level

        pPr = p._pPr if p._pPr is not None else p._p.get_or_add_pPr()
        if rtl:
            pPr.set('rtl', '1')
        if indent is not None:
            pPr.set('indent', str(int(indent * EMU_PER_PT)))
        if margin_left is not None:
            pPr.set('marL', str(int(margin_left * EMU_PER_PT)))
        if margin_right is not None:
            pPr.set('marR', str(int(margin_right * EMU_PER_PT)))

        if bullet is not None:
            _drop(pPr, 'a:buNone', 'a:buChar', 'a:buAutoNum', 'a:buFont')
            if bullet == 'none':
                _sub(pPr, 'a:buNone')
            elif bullet in ('1.', 'auto'):
                _sub(pPr, 'a:buAutoNum', type='arabicPeriod')
            else:
                _sub(pPr, 'a:buFont', typeface='Arial', pitchFamily='34', charset='0')
                _sub(pPr, 'a:buChar', char=bullet)

        if tabs:
            lst = _sub(pPr, 'a:tabLst')
            for pos in tabs:
                tab = lst.makeelement(qn('a:tab'),
                                      {'pos': str(int(pos * EMU_PER_PT)), 'algn': 'l'})
                lst.append(tab)

        if runs is None:
            runs = []
        if isinstance(runs, str):
            runs = [{'t': runs}]
        for spec in runs:
            # Split at script boundaries so digits carry an English language
            # tag. PowerPoint renders 14 as ١٤ when the run is marked Arabic.
            text = self.ctx.fill(spec.get('t', ''))
            recast = self.ctx.geo('digits', 'recast')
            for piece, arabic in split_scripts(text):
                part = dict(spec)
                if not arabic and any(c.isdigit() for c in piece):
                    # GE SS Text draws 0-9 as Arabic-Indic glyphs, so the only
                    # way to get 402 instead of ٤٠٢ is to hand the digits to
                    # a face that draws them Western. theme.json says which.
                    part['f'] = recast.get(spec.get('f'), spec.get('f'))
                    # The mark does nothing for the glyph shape. It keeps the
                    # number the right way round where it meets Arabic.
                    piece = LRM + piece
                part['t'] = piece
                part['_lang'] = 'ar-SA' if arabic else 'en-US'
                self._run(p, part, prefilled=True)
        return p

    def blank(self, n=1, sz=None, f=None, **kw):
        """Empty paragraphs.

        An empty paragraph with no run collapses to the default 18 pt line.
        Passing `sz` writes an empty run at that size, which is how the
        original deck holds its vertical rhythm.
        """
        runs = [{'t': '', 'sz': sz, 'f': f}] if sz else []
        for _ in range(n):
            self.para(list(runs), **kw)

    def _run(self, p, spec, prefilled=False):
        r = p.add_run()
        r.text = spec.get('t', '') if prefilled else self.ctx.fill(spec.get('t', ''))
        if spec.get('_lang'):
            r._r.get_or_add_rPr().set('lang', spec['_lang'])
        f = r.font
        if spec.get('sz'):
            f.size = Pt(spec['sz'])
        if spec.get('b'):
            f.bold = True
        if spec.get('i'):
            f.italic = True
        colour = spec.get('c')
        if colour:
            f.color.rgb = rgb(self.ctx.color(colour))

        alias = spec.get('f')
        if alias:
            faces = self.ctx.font(alias)
            rPr = r._r.get_or_add_rPr()
            set_faces(rPr, faces)
        if spec.get('spc') is not None:
            r._r.get_or_add_rPr().set('spc', str(int(spec['spc'] * 100)))
        if spec.get('u'):
            r._r.get_or_add_rPr().set('u', spec['u'])
        return r


ARABIC_RANGES = (
    (0x0600, 0x06FF), (0x0750, 0x077F), (0x08A0, 0x08FF),
    (0xFB50, 0xFDFF), (0xFE70, 0xFEFF),
)

NEUTRAL = set('  \t .,:;|()[]{}/-–—+*&%#@!?"\'،؛؟‘’“”')

LRM = '‎'   # left-to-right mark, zero width


def _is_arabic(ch):
    o = ord(ch)
    return any(lo <= o <= hi for lo, hi in ARABIC_RANGES)


def split_scripts(text):
    """Break text into (piece, is_arabic) pieces at script boundaries.

    PowerPoint decides the shape of a digit from the run's language. A "14"
    inside a run marked ar-SA comes out as ١٤, which is correct Arabic and
    wrong for this deck: VADO quote figures in Western digits so a client
    reads them at a glance. Splitting lets the digits carry lang="en-US".

    Spaces and punctuation belong to nobody, so they follow their Arabic
    neighbour. That keeps the gap in "14 يوم" on the Arabic side of the
    bidi boundary, where the layout engine will not swallow it.
    """
    if not text:
        return [(text, False)]

    segs = []
    for ch in text:
        cls = 'ar' if _is_arabic(ch) else ('sp' if ch in NEUTRAL else 'lat')
        if segs and segs[-1][0] == cls:
            segs[-1][1] += ch
        else:
            segs.append([cls, ch])

    merged = []
    for i, (cls, txt) in enumerate(segs):
        if cls != 'sp':
            merged.append([cls, txt])
            continue
        before = merged[-1][0] if merged else None
        after = next((c for c, _ in segs[i + 1:] if c != 'sp'), None)
        target = 'ar' if 'ar' in (before, after) else (before or after or 'lat')
        if merged and target == before:
            merged[-1][1] += txt
        else:
            merged.append([target, txt])

    out = []
    for cls, txt in merged:
        if out and out[-1][0] == cls:
            out[-1][1] += txt
        else:
            out.append([cls, txt])
    return [(txt, cls == 'ar') for cls, txt in out]


def set_faces(rPr, faces):
    """Latin, East-Asian and complex-script faces, in schema order."""
    for tag, name in (('a:latin', faces['latin']),
                      ('a:ea', faces['cs']),
                      ('a:cs', faces['cs'])):
        _drop(rPr, tag)
        place(rPr, rPr.makeelement(qn(tag), {'typeface': name}))


# --------------------------------------------------------------------------
# shapes
# --------------------------------------------------------------------------

def textbox(ctx, slide, x, y, w, h, *, anchor='t', wrap=True, autofit=False,
            insets=(7.2, 3.6, 7.2, 3.6), rtl_col=False, rotation=None):
    box = slide.shapes.add_textbox(pt(x), pt(y), pt(w), pt(h))
    tf = box.text_frame
    tf.word_wrap = wrap
    tf.vertical_anchor = ANCHOR[anchor]
    tf.margin_left, tf.margin_top = Pt(insets[0]), Pt(insets[1])
    tf.margin_right, tf.margin_bottom = Pt(insets[2]), Pt(insets[3])
    bodyPr = tf._txBody.find(qn('a:bodyPr'))
    if rtl_col:
        bodyPr.set('rtlCol', '1')
    # python-pptx already puts one <a:spAutoFit/> here; a second one is invalid
    _drop(bodyPr, 'a:noAutofit', 'a:normAutofit', 'a:spAutoFit')
    if autofit:
        bodyPr.append(bodyPr.makeelement(qn('a:spAutoFit'), {}))
    if rotation:
        box.rotation = rotation
    return box, Text(ctx, tf)


def rect(ctx, slide, x, y, w, h, *, fill=None, line=None, line_w=1.0,
         shape=MSO_SHAPE.RECTANGLE, rotation=None, alpha=None):
    sp = slide.shapes.add_shape(shape, pt(x), pt(y), pt(w), pt(h))
    sp.shadow.inherit = False
    if fill:
        sp.fill.solid()
        sp.fill.fore_color.rgb = rgb(ctx.color(fill))
        if alpha is not None:
            clr = sp.fill.fore_color._xFill.find(qn('a:srgbClr'))
            clr.append(clr.makeelement(qn('a:alpha'), {'val': str(int(alpha * 100000))}))
    else:
        sp.fill.background()
    if line:
        sp.line.color.rgb = rgb(ctx.color(line))
        sp.line.width = Pt(line_w)
    else:
        sp.line.fill.background()
    if rotation:
        sp.rotation = rotation
    tf = sp.text_frame
    tf.word_wrap = False
    return sp


def hline(ctx, slide, x, y, w, color, weight=1.0, dash=None):
    return _line(ctx, slide, x, y, x + w, y, color, weight, dash)


def vline(ctx, slide, x, y, h, color, weight=1.0, dash=None):
    return _line(ctx, slide, x, y, x, y + h, color, weight, dash)


def _clear_effects(shape):
    """Drop the theme's shadow. Shapes expose shadow.inherit; connectors do
    not, and they inherit an effect from the line style, which puts a soft
    drop shadow under every rule and arrow in the deck."""
    spPr = shape._element.spPr
    _drop(spPr, 'a:effectLst')
    spPr.append(spPr.makeelement(qn('a:effectLst'), {}))
    return shape


def _line(ctx, slide, x1, y1, x2, y2, color, weight, dash):
    from pptx.enum.shapes import MSO_CONNECTOR
    cn = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, pt(x1), pt(y1), pt(x2), pt(y2))
    _clear_effects(cn)
    cn.line.color.rgb = rgb(ctx.color(color))
    cn.line.width = Pt(weight)
    if dash:
        ln = cn.line._get_or_add_ln()
        _sub(ln, 'a:prstDash', val=dash)
    return cn


def arrow(ctx, slide, x, y, w, color, weight=2.2, dash=None):
    """Horizontal arrow pointing right (the timeline uses these)."""
    from pptx.enum.shapes import MSO_CONNECTOR
    cn = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, pt(x), pt(y), pt(x + w), pt(y))
    _clear_effects(cn)
    cn.line.color.rgb = rgb(ctx.color(color))
    cn.line.width = Pt(weight)
    ln = cn.line._get_or_add_ln()
    if dash:
        _sub(ln, 'a:prstDash', val=dash)
    _sub(ln, 'a:tailEnd', type='triangle', w='med', len='med')
    return cn


def picture(ctx, slide, asset, x, y, w, h, *, crop=None, rotation=None,
            transparency=None):
    """transparency is 0..1. The site map on slide 4 sits at 0.3 so the
    regulatory text stays the loudest thing in that block."""
    path = ctx.asset(asset)
    pic = slide.shapes.add_picture(path, pt(x), pt(y), pt(w), pt(h))
    if transparency:
        blip = pic._element.blipFill.find(qn('a:blip'))
        _sub(blip, 'a:alphaModFix', amt=int((1 - transparency) * 100000))
    if crop:
        pic.crop_left = crop.get('left', 0)
        pic.crop_top = crop.get('top', 0)
        pic.crop_right = crop.get('right', 0)
        pic.crop_bottom = crop.get('bottom', 0)
    if rotation:
        pic.rotation = rotation
    return pic


def slide_number(ctx, slide, x, y, w, h, *, size=12, font='en', color='ink'):
    """A live slide-number field, so renumbering survives a reorder."""
    box, t = textbox(ctx, slide, x, y, w, h, wrap=False)
    p = t.para([], algn='c')
    fld = p._p.makeelement(qn('a:fld'), {'id': '{B7B3D1E7-1E6E-4A4E-9E7D-9A0F2C4A5B61}',
                                         'type': 'slidenum'})
    rPr = fld.makeelement(qn('a:rPr'), {'lang': 'en-US', 'sz': str(int(size * 100))})
    set_solid_fill(rPr, ctx.color(color))
    set_faces(rPr, ctx.font(font))
    fld.append(rPr)
    tnode = fld.makeelement(qn('a:t'), {})
    tnode.text = '#'
    fld.append(tnode)
    place(p._p, fld)
    return box


# --------------------------------------------------------------------------
# tables
# --------------------------------------------------------------------------

class Table:
    """A thin wrapper that makes cell styling one call instead of ten."""

    def __init__(self, ctx, slide, x, y, w, h, cols, rows, *, rtl=False,
                 first_row=False, band=False):
        gf = slide.shapes.add_table(len(rows), len(cols), pt(x), pt(y), pt(w), pt(h))
        self.ctx = ctx
        self.shape = gf
        self.tbl = gf.table
        for i, cw in enumerate(cols):
            self.tbl.columns[i].width = pt(cw)
        for i, rh in enumerate(rows):
            self.tbl.rows[i].height = pt(rh)
        tblPr = self.tbl._tbl.find(qn('a:tblPr'))
        tblPr.set('firstRow', '1' if first_row else '0')
        tblPr.set('bandRow', '1' if band else '0')
        if rtl:
            tblPr.set('rtl', '1')
        # Drop the inherited Office style so nothing arrives blue.
        style_id = tblPr.find(qn('a:tableStyleId'))
        if style_id is not None:
            tblPr.remove(style_id)
        for r in range(len(rows)):
            for c in range(len(cols)):
                self.clear(r, c)

    def cell(self, r, c):
        return self.tbl.cell(r, c)

    def clear(self, r, c):
        """No fill, no borders. Everything is opt-in from here."""
        tcPr = self.tbl.cell(r, c)._tc.get_or_add_tcPr()
        for tag in ('a:lnL', 'a:lnR', 'a:lnT', 'a:lnB'):
            _drop(tcPr, tag)
            el = tcPr.makeelement(qn(tag), {'w': '12700', 'cmpd': 'sng'})
            el.append(el.makeelement(qn('a:noFill'), {}))
            place(tcPr, el)
        set_no_fill(tcPr)

    def fill(self, r, c, color, alpha=None):
        tcPr = self.tbl.cell(r, c)._tc.get_or_add_tcPr()
        set_solid_fill(tcPr, self.ctx.color(color), alpha)

    def border(self, r, c, sides='TB', color='hairline', weight=1.0):
        tcPr = self.tbl.cell(r, c)._tc.get_or_add_tcPr()
        want = {'L': 'a:lnL', 'R': 'a:lnR', 'T': 'a:lnT', 'B': 'a:lnB'}
        for s in sides:
            tag = want[s]
            _drop(tcPr, tag)
            el = tcPr.makeelement(qn(tag), {'w': str(int(weight * EMU_PER_PT)),
                                            'cap': 'flat', 'cmpd': 'sng', 'algn': 'ctr'})
            set_solid_fill(el, self.ctx.color(color))
            _sub(el, 'a:prstDash', val='solid')
            place(tcPr, el)

    def anchor(self, r, c, anchor='ctr'):
        """Vertical anchor only. Cell margins keep their OOXML defaults."""
        self.tbl.cell(r, c)._tc.get_or_add_tcPr().set('anchor', anchor)

    def margins(self, r, c, l=5.4, t=0.0, rr=5.4, b=0.0, anchor='ctr'):
        tcPr = self.tbl.cell(r, c)._tc.get_or_add_tcPr()
        tcPr.set('marL', str(int(l * EMU_PER_PT)))
        tcPr.set('marR', str(int(rr * EMU_PER_PT)))
        tcPr.set('marT', str(int(t * EMU_PER_PT)))
        tcPr.set('marB', str(int(b * EMU_PER_PT)))
        tcPr.set('anchor', anchor)

    def merge(self, r1, c1, r2, c2):
        self.tbl.cell(r1, c1).merge(self.tbl.cell(r2, c2))

    def text(self, r, c):
        tf = self.tbl.cell(r, c).text_frame
        return Text(self.ctx, tf)
