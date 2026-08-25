"""Page furniture: the parts that repeat on every content slide.

Draw order matters. Call `content_page()` first, add the slide body after,
so the body sits above the rule and below nothing.
"""
from __future__ import annotations

from .deck import Text, hline, picture, rect, slide_number, textbox


def logo_block(ctx, slide):
    """The bird mark with the wordmark laid over it, top-left, bleeding off."""
    g = ctx.geo('chrome', 'logo_mark')
    picture(ctx, slide, 'logo-mark.png', g['x'], g['y'], g['w'], g['h'])
    w = ctx.geo('chrome', 'logo_word')
    picture(ctx, slide, 'logo-full.png', w['x'], w['y'], w['w'], w['h'], crop=w['crop'])


def page_title(ctx, slide, text):
    g = ctx.geo('chrome', 'title')
    _, t = textbox(ctx, slide, g['x'], g['y'], g['w'], g['h'], autofit=True)
    t.para([{'t': text, 'sz': ctx.size('page_title'), 'f': 'ar_medium', 'c': 'ink'}],
           algn='r', rtl=True, ls=1.5)


def header_rule(ctx, slide):
    g = ctx.geo('chrome', 'rule')
    hline(ctx, slide, g['x'], g['y'], g['w'], 'paper', g['weight'])
    c = g['cap']
    rect(ctx, slide, c['x'], c['y'], c['w'], c['h'], fill='paper')


def section_rail(ctx, slide, current):
    """One square per section, down the right edge.

    Every square is drawn, so the rail reads as a checklist of what the
    proposal contains and which part you are looking at. The original file
    painted only the first, the last and the current one, which left six
    invisible and made the rail look like an ornament.
    """
    g = ctx.geo('chrome', 'rail')
    for i in range(1, len(ctx.sections) + 1):
        y = g['y_top'] + (i - 1) * (g['size'] + g['gap'])
        rect(ctx, slide, g['x'], y, g['size'], g['size'],
             fill=g['current'] if i == current else g['color'])


def footer(ctx, slide, *, with_page_number=True):
    g = ctx.geo('chrome', 'footer')
    co = ctx.c('company')
    sz = ctx.size('footer')
    small = ctx.size('footer_small')

    r = g['rule']
    hline(ctx, slide, r['x'], r['y'], r['w'], 'ink', r['weight'])

    a = g['address']
    _, t = textbox(ctx, slide, a['x'], a['y'], a['w'], a['h'], autofit=True)
    t.para([{'t': co['office_ar'], 'sz': sz, 'f': 'ar_light', 'c': 'ink'}],
           algn='r', rtl=True, ls=1.5, bullet='none', margin_left=0, indent=0)
    t.para([{'t': ctx.address('footer_ar'), 'sz': sz, 'f': 'ar_light', 'c': 'ink'}],
           algn='r', rtl=True, ls=1.5, bullet='none', margin_left=0, indent=0)

    reg = g['registry']
    _, t = textbox(ctx, slide, reg['x'], reg['y'], reg['w'], reg['h'], autofit=True)
    t.para([{'t': f" {co['cr_label_ar']} {co['cr_number']}", 'sz': small,
             'f': 'ar_light', 'c': 'ink', 'spc': 0.4}], algn='r', rtl=True, ls=1.5)
    t.para([{'t': f"{co['chamber_label_ar']} {co['chamber_number']}", 'sz': small,
             'f': 'ar_light', 'c': 'ink', 'spc': 0.4}], algn='r', rtl=True, ls=1.5)

    w = g['web']
    _, t = textbox(ctx, slide, w['x'], w['y'], w['w'], w['h'], autofit=True)
    t.para([{'t': co['website'], 'sz': sz, 'f': 'cairo_semi', 'c': 'ink',
             'b': True, 'spc': 0.4}], algn='r')

    if with_page_number:
        pn = g['page_number']
        slide_number(ctx, slide, pn['x'], pn['y'], pn['w'], pn['h'],
                     size=ctx.size('body'), font='en', color='ink')


def content_page(ctx, slide, *, title, section):
    """Everything a slide from 3 to 14 shares."""
    logo_block(ctx, slide)
    header_rule(ctx, slide)
    page_title(ctx, slide, title)
    section_rail(ctx, slide, ctx.section_index(section))
    footer(ctx, slide)
