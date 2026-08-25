"""Slide 15 - the closing page.

Reads: content.company
A dark bar down the left edge carrying the domain, and the tagline
centred near the bottom. No footer, no rail.
"""
from ..deck import rect, textbox

TITLE = 'Closing'


def build(ctx, slide):
    co = ctx.c('company')

    rect(ctx, slide, 30.9, 0.1, 21.7, 145.8, fill='ink')
    _, t = textbox(ctx, slide, -39.2, 76.0, 163.7, 20.0, autofit=True, rotation=270.0)
    t.para([{'t': co['website_caps'], 'sz': 10.5, 'spc': 3.0,
             'f': 'en_display', 'c': 'white'}],
           algn='r', margin_left=0, margin_right=0, before=0, after=0)

    _, t = textbox(ctx, slide, 42.7, 816.0, 546.4, 29.1, autofit=True)
    t.para([{'t': co['tagline_en'], 'sz': 18, 'spc': 6.0,
             'f': 'en_display', 'c': 'ink'}],
           algn='c', margin_left=0, margin_right=0, before=0, after=0)
