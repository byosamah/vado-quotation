"""Slide 8 - نطاق العمل, the services checklist.

Reads: content.services
This page replaces the old VADO_Services_Update macro. Flip `included` in
content.json and the row moves: included services stack first in ink, the
rest follow in the muted grey. Nothing is dragged by hand any more.
"""
from .. import chrome
from ..deck import textbox

TITLE = 'Services included'
SECTION = 'scope'


def build(ctx, slide):
    sv = ctx.c('services')
    g = ctx.geo('services')
    chrome.content_page(ctx, slide, title=ctx.c('sections', 2)['ar'], section=SECTION)

    _, t = textbox(ctx, slide, 104.2, 183.9, 559.6, 30.6, autofit=True)
    t.para([{'t': sv['heading_ar'], 'sz': 14, 'b': True, 'f': 'cairo', 'c': 'ink'}],
           algn='r', ls=1.5)

    items = ctx.services()
    ordered = ([s for s in items if s['included']] +
               [s for s in items if not s['included']])

    # This one page is a checklist read against an English contract, so the
    # English service names stay beside the Arabic. Everything on it hangs
    # off the same left edge, English and Arabic alike: two lines of a pair
    # that start at opposite edges of the box stop reading as a pair, which
    # is the whole job of this page.
    #
    # The answer column says نعم or لا ينطبق and nothing else. It carried
    # "Yes" and "N/A" above the Arabic, and a one-word answer does not need
    # saying twice.
    for i, item in enumerate(ordered):
        y = g['y_top'] + i * g['row_gap']
        colour = 'ink' if item['included'] else 'service_off'

        _, t = textbox(ctx, slide, g['name']['x'], y, g['name']['w'], g['row_h'],
                       autofit=True)
        t.para([{'t': item['en'], 'sz': 11, 'f': 'en_light', 'c': colour}],
               algn='l', ls=1.5)
        t.para([{'t': item['ar'], 'sz': 10, 'f': 'ar_medium', 'c': colour}],
               algn='l', ls=1.5)

        _, t = textbox(ctx, slide, g['status']['x'], y, g['status']['w'], g['row_h'],
                       autofit=True)
        t.para([{'t': sv['yes_ar'] if item['included'] else sv['no_ar'],
                 'sz': 11, 'f': 'ar_medium', 'c': colour}], algn='l', ls=1.5)
