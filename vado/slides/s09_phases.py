"""Slide 9 - نطاق العمل, phases and deliverables.

Reads: content.phases
One right-to-left table of five columns: number, phase, deliverable,
detail, handover. A row with `no: null` continues the phase above it, so
the number and phase cells merge upward.
"""
from .. import chrome
from ..deck import Table, textbox

TITLE = 'Phases + deliverables'
SECTION = 'scope'

COLS = [37.9, 114.4, 162.3, 191.2, 77.4]
HEAD_H = 24.8
BULLET = ''


def build(ctx, slide):
    ph = ctx.c('phases')
    chrome.content_page(ctx, slide, title=ctx.c('sections', 2)['ar'], section=SECTION)

    _, t = textbox(ctx, slide, 104.9, 188.3, 492.7, 29.9, autofit=True)
    t.para([{'t': ph['heading_ar'], 'sz': 14, 'b': True, 'f': 'cairo', 'c': 'ink'}],
           algn='r', rtl=True, ls=1.5)

    # the phases this job actually has: a phase whose service was not sold
    # is gone from here and from the schedule on slide 11 together
    rows = ctx.phases()
    heights = [HEAD_H] + [r['h'] for r in rows]
    tbl = Table(ctx, slide, 72.3, 240.3, 583.2, 564.5, COLS, heights, rtl=True)

    # header band
    heads = ['', ph['head_ar'][0], ph['head_ar'][1], ph['head_ar'][2], ph['head_ar'][3]]
    for c in range(5):
        tbl.fill(0, c, 'sand')
        tbl.margins(0, c, anchor='ctr')
        if heads[c]:
            tbl.text(0, c).para(
                [{'t': heads[c], 'sz': 14, 'f': 'ar_medium', 'c': 'ink'}],
                algn='c', rtl=True, ls=1.0, before=12, margin_left=0)
    tbl.merge(0, 0, 0, 1)

    for i, row in enumerate(rows, start=1):
        for c in range(5):
            tbl.margins(i, c, anchor='ctr')
        if row['no'] is not None:
            tbl.fill(i, 0, 'sand', alpha=ctx.geo('table', 'sand_tint_alpha'))
            tbl.fill(i, 1, 'sand', alpha=ctx.geo('table', 'sand_tint_alpha'))
            tbl.text(i, 0).para([{'t': row['no'], 'sz': 11, 'f': 'ar_medium', 'c': 'ink'}],
                                algn='c', rtl=True, ls=1.0, before=12, margin_left=0)
            t = tbl.text(i, 1)
            t.para([{'t': row['code'], 'sz': 11, 'f': 'en_display', 'c': 'ink'}],
                   algn='c', rtl=True, ls=1.0, before=12, bullet='none', margin_left=0)
            t.para([{'t': row['name_ar'], 'sz': 11, 'f': 'ar_medium', 'c': 'ink'}],
                   algn='c', rtl=True, ls=1.0, before=12, margin_left=0)

        t = tbl.text(i, 2)
        for line in row['deliverable_ar']:
            t.para([{'t': line, 'sz': 11, 'f': 'en', 'c': 'ink'}],
                   algn='c', rtl=True, ls=1.5, before=12)

        t = tbl.text(i, 3)
        for line in row['detail']:
            t.para([{'t': line, 'sz': 11, 'f': 'en', 'c': 'ink'}],
                   algn='r', rtl=True, ls=1.5, bullet=BULLET,
                   indent=-27.0, margin_left=27.0)

        if row['handover']:
            tbl.text(i, 4).para(
                [{'t': row['handover'], 'sz': 11, 'f': 'en', 'c': 'ink'}],
                algn='c', rtl=True, ls=1.5, before=12)

    _merge_continuations(tbl, rows)
    _legend(ctx, slide, ctx.phase_codes())


def _merge_continuations(tbl, rows):
    """A run of rows whose `no` is null belongs to the phase above."""
    i = 0
    while i < len(rows):
        span = 1
        while i + span < len(rows) and rows[i + span]['no'] is None:
            span += 1
        if span > 1:
            top = i + 1
            bottom = i + span
            tbl.merge(top, 0, bottom, 0)
            tbl.merge(top, 1, bottom, 1)
            if rows[i].get('handover'):
                tbl.merge(top, 4, bottom, 4)
        i += span


LEGEND_COLS = {0: (72.3, 117.3), 1: (347.1, 392.1)}
LEGEND_ROWS = [822.8, 847.5, 872.5]


def _legend(ctx, slide, codes):
    """Two columns of code plus label, filled top to bottom, left first.

    Only the codes on the page appear. The original legend named Bidding
    Management, which no row used, and a client asking "where is that
    phase" is a question nobody wants to answer.
    """
    per_col = len(LEGEND_ROWS)
    for i, (code, label) in enumerate(codes):
        code_x, label_x = LEGEND_COLS[min(i // per_col, 1)]
        y = LEGEND_ROWS[i % per_col]
        _, t = textbox(ctx, slide, code_x, y, 40.9, 15.0, autofit=True)
        t.para([{'t': code, 'sz': 11, 'b': True, 'spc': 3.0,
                 'f': 'en', 'c': 'chart_ink'}])
        _, t = textbox(ctx, slide, label_x, y, 234.2, 15.0, autofit=True)
        t.para([{'t': label, 'sz': 11, 'f': 'en', 'c': 'chart_ink'}])
