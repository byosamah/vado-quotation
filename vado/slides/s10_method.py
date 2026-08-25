"""Slide 10 - منهجية العمل, the design method.

Reads: content.method
The triangle is drawn from shapes, not an image, so the three pillar names
follow whatever content.json says.
"""
from .. import chrome
from ..deck import rect, textbox

TITLE = 'Design methodology'
SECTION = 'method'

INK = 'ink'
SOFT = 'ink_soft'


def build(ctx, slide):
    me = ctx.c('method')
    chrome.content_page(ctx, slide, title=ctx.c('sections', 3)['ar'], section=SECTION)

    _, t = textbox(ctx, slide, 104.9, 188.3, 519.4, 259.6, autofit=True)
    # The first principle sits on the heading line, the rest below it. The
    # data is a plain list either way, so adding or dropping one is a single
    # edit and nothing has to be re-tabbed.
    principles = me['principles_ar']
    indent = me.get('principles_indent', 108.0)
    t.para([{'t': me['principles_heading_ar'] + '  \t', 'sz': 14, 'b': True,
             'f': 'cairo', 'c': INK},
            {'t': principles[0] + ' ', 'sz': 14, 'f': 'cairo', 'c': INK}],
           algn='just', rtl=True, ls=1.5)
    for p in principles[1:]:
        t.para([{'t': p, 'sz': 14, 'f': 'cairo', 'c': INK}],
               algn='just', rtl=True, ls=1.5, margin_right=indent)
    t.blank(1, sz=14, f='cairo', algn='just', rtl=True, ls=1.5)
    t.para([{'t': me['style_label_ar'], 'sz': 14, 'b': True, 'f': 'cairo', 'c': INK},
            {'t': me['style_value'], 'sz': 14, 'f': 'cairo', 'c': INK}],
           algn='just', rtl=True, ls=1.5)
    t.blank(1, sz=14, f='cairo', algn='just', rtl=True, ls=1.5)
    t.para([{'t': me['method_heading_ar'], 'sz': 14, 'b': True, 'f': 'cairo', 'c': INK}],
           algn='just', rtl=True, ls=1.5)

    _triangle(ctx, slide, me['triangle'])

    _, t = textbox(ctx, slide, 287.7, 460.2, 363.4, 145.6, autofit=True)
    t.para([{'t': me['lead_ar'], 'sz': 11, 'f': 'cairo', 'c': SOFT}],
           algn='just', rtl=True, ls=1.5)

    _, t = textbox(ctx, slide, 103.6, 643.3, 547.6, 205.5, autofit=True)
    for i, pillar in enumerate(me['pillars']):
        if i:
            t.blank(1, sz=11, f='cairo', algn='just', rtl=True, ls=1.5)
        t.para([{'t': pillar['name_ar'], 'sz': 11, 'b': True, 'f': 'cairo', 'c': SOFT},
                {'t': pillar['sep'], 'sz': 11, 'f': 'cairo', 'c': SOFT},
                {'t': ' ', 'sz': 11, 'f': 'cairo', 'c': SOFT},
                {'t': pillar['body_ar'], 'sz': 11, 'f': 'cairo', 'c': SOFT}],
               algn='just', rtl=True, ls=1.5)


def _triangle(ctx, slide, tri):
    from pptx.enum.shapes import MSO_SHAPE
    rect(ctx, slide, 118.0, 472.2, 144.5, 124.6, line=INK, line_w=3.0,
         shape=MSO_SHAPE.ISOSCELES_TRIANGLE)

    def label(x, y, w, text, rot=None):
        _, t = textbox(ctx, slide, x, y, w, 21.8, autofit=True, rotation=rot)
        t.para([{'t': text, 'sz': 12, 'f': 'cairo', 'c': INK}], algn='c')

    # the two upper labels ride the sloping sides of the triangle
    label(61.1, 514.4, 151.0, tri['top_left_ar'], rot=300.0)
    label(169.9, 514.3, 148.1, tri['top_right_ar'], rot=60.0)
    label(118.0, 601.6, 144.5, tri['bottom_ar'])
    label(118.0, 545.0, 144.5, tri['centre_ar'])
