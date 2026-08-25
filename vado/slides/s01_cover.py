"""Slide 1 - cover.

Reads: content.cover, content.company, content.fields
Layout: logo top-left, company name right, headline block mid-page,
        client meta table bottom-right, footer bottom-left.
The cover carries its own footer, larger than the one on the content pages.
"""
from ..deck import Table, hline, picture, textbox, vline

TITLE = 'Cover'


def build(ctx, slide):
    g = ctx.geo('cover')
    co = ctx.c('company')
    cv = ctx.c('cover')
    ink = 'ink'

    # --- masthead ------------------------------------------------------
    p = g['logo']
    picture(ctx, slide, 'logo-full.png', p['x'], p['y'], p['w'], p['h'])

    b = g['company_ar']
    _, t = textbox(ctx, slide, b['x'], b['y'], b['w'], b['h'], autofit=True)
    t.para([{'t': co['name_ar'], 'sz': 16, 'b': True, 'f': 'ar_light', 'c': ink}],
           algn='r', rtl=True, ls=1.5)

    b = g['company_en']
    _, t = textbox(ctx, slide, b['x'], b['y'], b['w'], b['h'], autofit=True)
    t.para([{'t': co['name_en'], 'sz': 16, 'b': True, 'f': 'en', 'c': ink}],
           algn='r', rtl=True)

    # --- headline block -------------------------------------------------
    b = g['kicker']
    _, t = textbox(ctx, slide, b['x'], b['y'], b['w'], b['h'], autofit=True)
    t.para([{'t': cv['kicker_ar'], 'sz': 18, 'f': 'ar_light', 'c': ink}],
           algn='r', rtl=True, ls=1.5)

    b = g['headline']
    _, t = textbox(ctx, slide, b['x'], b['y'], b['w'], b['h'], autofit=True, rtl_col=True)
    words = cv['headline_ar']
    t.para([{'t': words[0], 'sz': b['size'], 'b': True, 'spc': -1.5,
             'f': 'cairo', 'c': 'maroon_deep'},
            {'t': ' ', 'sz': b['size'], 'b': True, 'spc': -1.5,
             'f': 'cairo', 'c': 'maroon_deep'},
            {'t': words[1], 'sz': b['size'], 'b': True, 'spc': -1.5,
             'f': 'cairo', 'c': 'maroon_deep'}], algn='r', rtl=True)

    b = g['subhead']
    _, t = textbox(ctx, slide, b['x'], b['y'], b['w'], b['h'], autofit=True, rtl_col=True)
    t.para([{'t': cv['subhead_ar'], 'sz': 28, 'spc': -1.5, 'f': 'ar_medium', 'c': ink}],
           algn='r', rtl=True)

    b = g['project']
    _, t = textbox(ctx, slide, b['x'], b['y'], b['w'], b['h'], autofit=True, rtl_col=True)
    t.para([{'t': 'تصميم ', 'f': 'ar_light', 'c': ink},
            {'t': '{{project_type_ar}}', 'f': 'ar_light', 'c': ink}],
           algn='r', rtl=True, ls=1.5)
    t.para([{'t': '{{city_ar}} | {{district_ar}}', 'f': 'ar_light', 'c': ink}],
           algn='r', rtl=True, ls=1.5)

    v = g['vrule']
    vline(ctx, slide, v['x'], v['y'], v['h'], ink, v['weight'])

    h = g['hrule']
    hline(ctx, slide, h['x'], h['y'], h['w'], 'muted', h['weight'])

    b = g['english']
    _, t = textbox(ctx, slide, b['x'], b['y'], b['w'], b['h'], autofit=True, rtl_col=True)
    for line in (cv['english_line1'],
                 '{{name_title}} {{firstname}} {{lastname}} {{project_type}}',
                 '{{city}} | {{district}}'):
        t.para([{'t': line, 'sz': 12, 'spc': -0.7, 'f': 'en_light', 'c': ink}],
               algn='r', ls=1.5)

    _meta_table(ctx, slide, g['meta_table'], cv['meta_rows'])
    _cover_footer(ctx, slide, g['footer'], co)


def _meta_table(ctx, slide, g, rows):
    """Value on the left, label on the right, no rules. Labels can span rows."""
    heights = [g['row_h']] * len(rows)
    tbl = Table(ctx, slide, g['x'], g['y'], g['w'], g['h'], g['cols'], heights)
    for i, row in enumerate(rows):
        tbl.anchor(i, 0)
        tbl.anchor(i, 1)
        # rtl sets the base direction so "14 يوم" reads number-then-word
        # right to left. algn keeps the flush edge where the design has it:
        # without it, an RTL paragraph would jump to the right of the cell.
        t = tbl.text(i, 0)
        t.para([{'t': row['value'], 'sz': 8, 'spc': 0.4, 'f': 'cairo', 'c': 'ink'}],
               rtl=True, algn='l')
        if row['label_ar']:
            t = tbl.text(i, 1)
            t.para([{'t': row['label_ar'], 'sz': 9, 'b': True, 'spc': 0.4,
                     'f': 'cairo', 'c': 'ink'}], rtl=True, algn='l')
    # the addressee label spans its three value rows
    span = rows[0].get('span', 1)
    if span > 1:
        tbl.merge(0, 1, span - 1, 1)


def _cover_footer(ctx, slide, g, co):
    sz = g['size']
    b = g['address']
    _, t = textbox(ctx, slide, b['x'], b['y'], b['w'], b['h'], autofit=True)
    t.para([{'t': co['office_ar'], 'sz': sz, 'f': 'ar_bold', 'c': 'ink'}],
           algn='r', rtl=True, ls=1.5, bullet='none', margin_left=0, indent=0)
    t.para([{'t': ctx.address('footer_ar'), 'sz': sz, 'f': 'ar_light', 'c': 'ink'}],
           algn='r', rtl=True, ls=1.5, bullet='none', margin_left=0, indent=0)

    b = g['registry']
    _, t = textbox(ctx, slide, b['x'], b['y'], b['w'], b['h'], autofit=True)
    t.para([{'t': f" {co['cr_label_ar']} {co['cr_number']}", 'sz': sz,
             'f': 'ar_light', 'c': 'ink', 'spc': 0.4}], algn='r', rtl=True, ls=1.5)
    t.para([{'t': f"{co['chamber_label_ar']} {co['chamber_number']}", 'sz': sz,
             'f': 'ar_light', 'c': 'ink', 'spc': 0.4}], algn='r', rtl=True, ls=1.5)

    b = g['web']
    _, t = textbox(ctx, slide, b['x'], b['y'], b['w'], b['h'], autofit=True)
    t.para([{'t': co['website_caps'], 'sz': sz, 'f': 'en_display', 'c': 'ink',
             'spc': 0.4}])
