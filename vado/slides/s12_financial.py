"""Slide 12 - العرض المالي, the price and the payment schedule.

Reads: content.financial, content.company

The payment schedule is a table. It used to be four paragraphs chasing a
single tab stop, which lined up on the one row whose title happened to be
short enough and jammed the number against the title on the other three. A
table aligns by construction and cannot drift when a stage is renamed.

The amounts are worked out from the fee, and the last row adds them up in
front of the client, which is the cheapest possible proof that the split
really is the whole fee.
"""
from .. import chrome
from ..deck import Table, hline, picture, textbox

TITLE = 'Financial proposal'
SECTION = 'financial'

INK = 'ink'
LEFT, WIDTH = 104.5, 527.5
LEAD_Y = 191.9
TOTAL_Y = 262.0
PAYMENTS_HEAD_Y = 322.0
TABLE_Y = 352.0
BANK_GAP = 68.0


def build(ctx, slide):
    fi = ctx.c('financial')
    co = ctx.c('company')
    chrome.content_page(ctx, slide, title=ctx.c('sections', 5)['ar'], section=SECTION)

    _, t = textbox(ctx, slide, LEFT, LEAD_Y, WIDTH, 44.0, autofit=True)
    for line in fi['lead_ar']:
        t.para([{'t': line, 'sz': 11, 'f': 'ar_light', 'c': INK}],
               algn='r', rtl=True, ls=1.5)

    _total(ctx, slide, fi)

    _, t = textbox(ctx, slide, LEFT, PAYMENTS_HEAD_Y, WIDTH, 22.0, autofit=True)
    t.para([{'t': fi['payments_heading_ar'], 'sz': 11, 'b': True,
             'f': 'cairo', 'c': INK}], algn='r', rtl=True, ls=1.5)

    bottom = _payments(ctx, slide, fi)
    _bank(ctx, slide, fi, co, bottom + BANK_GAP)


def _total(ctx, slide, fi):
    """The fee: the heading, the figure with its symbol, then the words.

    The riyal symbol is an image and an image cannot follow text, so the
    figure gets its own box with a fixed LEFT edge and the symbol sits a
    fixed gap to the left of that. The number grows rightwards, away from
    the symbol, so the two cannot overlap however long the figure is.

    Pinning the image to a page coordinate instead put it on the heading
    once and on the written amount once.
    """
    m = fi['riyal_mark']
    figure_y = TOTAL_Y + 22.0

    _, t = textbox(ctx, slide, LEFT, TOTAL_Y, WIDTH, 22.0, autofit=True)
    t.para([{'t': fi['total_label_ar'].rstrip(' :'), 'sz': 11, 'b': True,
             'f': 'ar_bold', 'c': INK}], algn='r', rtl=True, ls=1.5)

    _, t = textbox(ctx, slide, m['figure_x'], figure_y,
                   LEFT + WIDTH - m['figure_x'], 24.0, autofit=True, wrap=False)
    t.para([{'t': fi['total_number'], 'sz': 14, 'b': True,
             'f': 'cairo_xbold', 'c': INK}], algn='l')
    picture(ctx, slide, m['asset'], m['figure_x'] - m['gap'],
            figure_y + m['dy'], m['w'], m['h'])

    _, t = textbox(ctx, slide, LEFT, figure_y + 24.0, WIDTH, 22.0, autofit=True)
    t.para([{'t': fi['total_written_ar'], 'sz': 11, 'f': 'ar_medium', 'c': INK},
            {'t': ' ', 'sz': 11, 'f': 'ar_medium', 'c': INK},
            {'t': fi['currency_note_ar'], 'sz': 11, 'f': 'ar_medium', 'c': INK}],
           algn='r', rtl=True, ls=1.5)


def _payments(ctx, slide, fi):
    """Four stages and a total, right to left. Returns the bottom edge."""
    cols = fi['columns']
    pays = ctx.payments()
    widths = cols['widths']
    heights = [cols['row_h']] * len(pays) + [cols['total_h']]
    tbl = Table(ctx, slide, LEFT, TABLE_Y, sum(widths), sum(heights),
                widths, heights, rtl=True)

    for i, pay in enumerate(pays):
        for c in range(4):
            tbl.margins(i, c, anchor='t')
        tbl.text(i, 0).para([{'t': pay['no'].rstrip('.'), 'sz': 11, 'b': True,
                              'f': 'cairo', 'c': INK}], algn='r', rtl=True, ls=1.5)
        cell = tbl.text(i, 1)
        cell.para([{'t': pay['title_ar'], 'sz': 11, 'b': True,
                    'f': 'cairo', 'c': INK}], algn='r', rtl=True, ls=1.5)
        for body in pay['body_ar']:
            cell.para([{'t': body, 'sz': 10, 'f': 'cairo', 'c': INK}],
                      algn='r', rtl=True, ls=1.4)
        tbl.text(i, 2).para([{'t': pay['pct'], 'sz': 11, 'b': True,
                              'f': 'cairo', 'c': INK}], algn='r', rtl=True, ls=1.5)
        if pay['amount']:
            tbl.text(i, 3).para([{'t': pay['amount'], 'sz': 11, 'b': True,
                                  'f': 'cairo', 'c': INK}], algn='r', rtl=True, ls=1.5)

    last = len(pays)
    totals = ctx.payment_totals()
    for c in range(4):
        tbl.margins(last, c, anchor='ctr')
        tbl.border(last, c, 'T', 'ink', 0.75)
    tbl.text(last, 1).para([{'t': fi['total_row_ar'], 'sz': 11, 'b': True,
                             'f': 'cairo', 'c': INK}], algn='r', rtl=True)
    tbl.text(last, 2).para([{'t': totals['pct'], 'sz': 11, 'b': True,
                             'f': 'cairo', 'c': INK}], algn='r', rtl=True)
    if totals['amount']:
        tbl.text(last, 3).para([{'t': totals['amount'], 'sz': 11, 'b': True,
                                 'f': 'cairo', 'c': INK}], algn='r', rtl=True)
    return TABLE_Y + sum(heights)


def _bank(ctx, slide, fi, co, y):
    """Heading, rule, mark, account, IBAN. No blank lines doing the spacing."""
    _, t = textbox(ctx, slide, LEFT, y, WIDTH, 22.0, autofit=True)
    t.para([{'t': fi['bank_heading_ar'], 'sz': 11, 'b': True,
             'f': 'cairo', 'c': INK}], algn='r', rtl=True, ls=1.5)
    hline(ctx, slide, LEFT, y + 22.0, WIDTH, 'hairline', 0.75)

    picture(ctx, slide, co['bank_name_asset'], LEFT + WIDTH - 124.6,
            y + 32.0, 124.6, 47.3)

    _, t = textbox(ctx, slide, LEFT, y + 42.0, WIDTH - 148.0, 40.0, autofit=True)
    t.para([{'t': co['bank_account_name'], 'sz': 10, 'f': 'en_light', 'c': INK}],
           algn='r', ls=1.5)
    t.para([{'t': co['iban'], 'sz': 12, 'f': 'en', 'c': INK}], algn='r', ls=1.5)
