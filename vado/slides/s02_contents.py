"""Slide 2 - table of contents.

Reads: content.contents, content.sections
The section list is the single source of truth. Add a section here and the
side rail on every content page grows with it.
"""
from .. import chrome
from ..deck import textbox

TITLE = 'Contents'


def build(ctx, slide):
    cn = ctx.c('contents')

    _, t = textbox(ctx, slide, 255.5, 298.1, 408.3, 123.6, autofit=True, rtl_col=True)
    t.para([{'t': cn['title_ar'], 'sz': 96, 'b': True, 'spc': -1.5,
             'f': 'ar_bold', 'c': 'maroon'}], algn='r', rtl=True)

    # names, right aligned
    _, t = textbox(ctx, slide, 367.9, 450.0, 180.3, 265.0, autofit=True)
    for s in ctx.sections:
        runs = _split(s['ar'], s.get('medium_words', 0))
        t.para(runs, algn='r', rtl=True, ls=1.5)

    # numbers, to the left of the names. They are a tint behind the list,
    # not a second column of information, so the colour lives in the theme
    # where it can be tuned without touching this file.
    g = ctx.geo('contents')
    _, t = textbox(ctx, slide, 548.2, 450.0, 49.6, 265.4, autofit=True)
    for i in range(1, len(ctx.sections) + 1):
        t.para([{'t': f'{i:02d}', 'sz': g['number_size'], 'f': 'en',
                 'c': g['number_color']}], algn='l', ls=1.5)

    chrome.footer(ctx, slide)


def _split(name, medium_words):
    """The first N words are set in the medium weight, the rest in light."""
    size = None  # inherit the 18 pt default, as the original does
    if medium_words <= 0:
        return [{'t': name, 'sz': size, 'f': 'ar_light', 'c': 'ink_soft'}]
    parts = name.split(' ')
    head = ' '.join(parts[:medium_words])
    tail = ' '.join(parts[medium_words:])
    return [{'t': head, 'sz': size, 'f': 'ar_medium', 'c': 'ink_soft'},
            {'t': ' ' + tail, 'sz': size, 'f': 'ar_light', 'c': 'ink_soft'}]
