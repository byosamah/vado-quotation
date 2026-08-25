"""Slide 4 - عن المشروع, the project data sheet.

Reads: content.project
Four tables:
  summary   value | label, no rules, the location block holds three tiny lines
  style     the Saudi architecture zone and level
  limits    ten regulatory numbers, hairline rules top and bottom
  use       six Balady use codes, hairline rules top and bottom
Every value is a merge field, so this slide is the one that changes most.
"""
from .. import chrome
from ..deck import Table, picture, rect, textbox

TITLE = 'Project data'
SECTION = 'project'

INK = 'ink'


def build(ctx, slide):
    pr = ctx.c('project')
    chrome.content_page(ctx, slide, title=ctx.c('sections', 1)['ar'], section=SECTION)

    _summary(ctx, slide, pr)

    _, t = textbox(ctx, slide, 142.2, 616.9, 548.0, 24.2, autofit=True)
    t.para([{'t': pr['regulatory_heading_ar'], 'sz': 14, 'f': 'ar_medium', 'c': INK}],
           algn='just', rtl=True)

    _style_table(ctx, slide, pr)
    _limits_table(ctx, slide, pr)
    _use_table(ctx, slide, pr)

    _, t = textbox(ctx, slide, 406.9, 896.0, 283.3, 26.7, autofit=True)
    t.para([{'t': pr['source_note_ar'], 'sz': 8, 'f': 'ar_light', 'c': INK}],
           algn='r', rtl=True)


def _summary(ctx, slide, pr):
    rows = pr['summary_rows']
    loc = pr['location_lines']
    heights = [r['h'] for r in rows] + [l['h'] for l in loc]
    cols = [410.3, 20.6, 144.6]
    tbl = Table(ctx, slide, 114.7, 188.0, 575.4, 412.8, cols, heights)

    for i, row in enumerate(rows):
        tbl.merge(i, 0, i, 1)
        tbl.margins(i, 0, anchor='ctr')
        tbl.margins(i, 2, anchor='ctr')
        if row['value_ar']:
            t = tbl.text(i, 0)
            t.para([{'t': row['value_ar'], 'sz': 14, 'f': 'cairo', 'c': INK}],
                   algn='r', rtl=True)
        if row['label_ar']:
            t = tbl.text(i, 2)
            t.para([{'t': row['label_ar'], 'sz': 14, 'f': 'ar_medium', 'c': INK}],
                   algn='r', rtl=True)

    # the three micro lines that sit inside the location block
    base = len(rows)
    for j, line in enumerate(loc):
        r = base + j
        tbl.margins(r, 0, l=0, t=0, rr=0, b=0, anchor='ctr')
        t = tbl.text(r, 0)
        t.para([{'t': line['value'], 'sz': line['size'], 'f': line['font'],
                 'c': line['color']}], algn='r', rtl=True)

    # label merges: تفاصيل القطعة spans 3 value rows, الموقع spans the rest
    tbl.merge(3, 2, 5, 2)
    tbl.merge(6, 2, len(heights) - 1, 2)
    tbl.merge(base, 1, len(heights) - 1, 1)

    _site_map(ctx, slide)
    picture(ctx, slide, 'icon-gmaps.png', 531.6, 576.8, 13.2, 18.2)


def _site_map(ctx, slide):
    """The plot in its street context, faded back so the numbers still lead.

    A job names its own image with "map": "<file in assets/>". Without one
    the stand-in is used, and the job should list "map" as a placeholder so
    the check refuses to let it out.
    """
    if ctx.is_template():
        return          # the blank template shows the empty block, as before
    g = ctx.geo('site_map')
    asset = ctx.job.get('map') or 'map-placeholder.png'
    picture(ctx, slide, asset, g['x'], g['y'], g['w'], g['h'],
            transparency=g['transparency'])

    m = ctx.job.get('map_marker') or g['marker']
    size = g['marker']['size']
    rect(ctx, slide,
         g['x'] + g['w'] * m.get('x', 0.5) - size / 2,
         g['y'] + g['h'] * m.get('y', 0.5) - size / 2,
         size, size, fill=g['marker']['color'])


def _style_table(ctx, slide, pr):
    row = pr['arch_style_rows'][0]
    tbl = Table(ctx, slide, 345.5, 645.3, 337.1, 50.4, [208.7, 128.4], [49.1])
    tbl.margins(0, 0, anchor='t')
    tbl.margins(0, 1, anchor='ctr')
    t = tbl.text(0, 0)
    for v in row['values']:
        t.para([{'t': v, 'sz': 12, 'f': 'ar_light', 'c': INK}],
               algn='r', rtl=True, margin_left=0)
    t = tbl.text(0, 1)
    t.para([{'t': row['label_ar'], 'sz': 12, 'f': 'ar_light', 'c': INK}],
           algn='r', rtl=True, margin_left=0)


def _limits_table(ctx, slide, pr):
    rows = pr['limits_rows']
    row_h = 21.6
    tbl = Table(ctx, slide, 108.6, 689.2, 283.3, row_h * len(rows),
                [163.2, 120.1], [row_h] * len(rows))
    for i, row in enumerate(rows):
        for c, val in ((0, row['value']), (1, row['label_ar'])):
            tbl.margins(i, c, anchor='ctr')
            tbl.border(i, c, 'TB', 'hairline', ctx.geo('table', 'hairline_w'))
            t = tbl.text(i, c)
            t.para([{'t': val, 'sz': 12, 'f': 'ar_light', 'c': INK}],
                   algn='r', rtl=True, margin_left=0)


def _use_table(ctx, slide, pr):
    rows = pr['use_rows']
    # right-to-left: the label column is the one on the right
    tbl = Table(ctx, slide, 410.5, 689.2, 268.1, 194.1, [125.2, 142.9],
                [r['h'] for r in rows], rtl=True)
    for i, row in enumerate(rows):
        for c in (0, 1):
            tbl.margins(i, c, l=6.5, t=3.3, rr=6.5, b=3.3, anchor='ctr')
            tbl.border(i, c, 'TB', 'hairline', ctx.geo('table', 'hairline_w'))
        # these cells carry mixed text such as "س-1-ب سكني" and
        # "سكني بنسبة 60% ...", which misorders without a base direction
        tbl.text(i, 0).para([{'t': row['label_ar'], 'sz': 12, 'f': 'ar_light', 'c': INK}],
                            rtl=True, algn='l')
        tbl.text(i, 1).para([{'t': row['value'], 'sz': 12, 'f': 'ar_light', 'c': INK}],
                            rtl=True, algn='c')
