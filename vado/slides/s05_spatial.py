"""Slide 5 - نطاق العمل, the brief.

Reads: ctx.spatial()

This page has no fixed shape. A villa has outdoor spaces and floors; a fuel
station has a forecourt, a service building and a canopy; offices have
levels and a core. So the page is a list of groups, and a group holds
either a flat list of `items`, or `blocks` that each name a part and say
what is in it, or both:

    groups:
      - title_ar: المساحات الخارجية
        items:   [موقف 3 سيارات, حديقة]
      - title_ar: المساحات الداخلية
        blocks:
          - name_ar: الدور الأرضي
            contents_ar: مجلس , صالة معيشة , مطبخ

Any number of groups, any number of blocks, in whatever order the project
wants. That is the whole model, and it is the reason this page can carry a
villa on Monday and a petrol station on Tuesday.

Indentation is measured in points and applied as a right margin, because
Arabic starts on the right. It used to be tab characters, which moved
whenever a font or a name length changed.
"""
from .. import chrome
from ..deck import textbox

TITLE = 'The brief'
SECTION = 'scope'

INK = 'ink'


def build(ctx, slide):
    sp = ctx.spatial()
    ind = sp['indent']
    chrome.content_page(ctx, slide, title=ctx.c('sections', 2)['ar'], section=SECTION)

    _, t = textbox(ctx, slide, 149.9, 188.2, 492.7, 532.7, autofit=True)

    def line(txt, sz=11, bold=False, level=None, step=None):
        t.para([{'t': txt, 'sz': sz, 'b': bold, 'f': 'cairo', 'c': INK}],
               algn='just', rtl=True, ls=1.5, level=level,
               margin_right=ind[step] if step else None)

    def gap(sz):
        t.blank(1, sz=sz, f='cairo', algn='just', rtl=True, ls=1.5)

    line(sp['heading_ar'], 14, True)
    gap(14)
    line(sp['lead_ar'], 12)
    gap(12)
    if sp.get('lot_label_ar'):
        line(sp['lot_label_ar'], 12, True)

    groups = sp['groups']
    for i, group in enumerate(groups):
        line(group['title_ar'], 12, True, level=1)
        if group.get('includes', True):
            line(sp['includes_label_ar'], 11, step='includes')
        for item in group.get('items') or []:
            line(item, 11, True, step='item')
        for block in group.get('blocks') or []:
            line(block['name_ar'], 11, True, step='item')
            if block.get('contents_ar'):
                line(block['contents_ar'], 11, step='rooms')
        if i < len(groups) - 1:
            gap(12)

    gap(11)
    gap(11)
    line(sp['note_ar'], 11)
    gap(11)
