"""Slide 14 - معلومات التواصل, the contact page.

Reads: content.contact, content.company
The QR code is a static image. Replace assets/qr-vado.png to change where
it points.
"""
from .. import chrome
from ..deck import hline, picture, textbox

TITLE = 'Contact'
SECTION = 'contact'

INK = 'ink'


def build(ctx, slide):
    ct = ctx.c('contact')
    co = ctx.c('company')
    chrome.content_page(ctx, slide, title=ctx.c('sections', 7)['ar'], section=SECTION)

    q = ctx.geo('contact', 'qr')
    picture(ctx, slide, q['asset'], q['x'], q['y'], q['w'], q['h'])
    # A heavy bar anchoring the QR code. It is unlabelled in the original and
    # nobody has said what it is for, so it is kept and named rather than
    # quietly deleted. Remove the entry from theme.contact to drop it.
    u = ctx.geo('contact', 'qr_underline')
    hline(ctx, slide, u['x'], u['y'], u['w'], u['color'], u['weight'])

    _, t = textbox(ctx, slide, 261.5, 188.3, 381.1, 470.5, autofit=True)

    def line(txt, *, bold=False, level=None, after=8):
        if txt == '':
            t.blank(1, sz=11, f='cairo', algn='r', rtl=True, ls=1.5, after=after,
                    level=level)
            return
        t.para([{'t': txt, 'sz': 11, 'b': bold, 'f': 'cairo', 'c': INK}],
               algn='r', rtl=True, ls=1.5, after=after, level=level)

    line(ct['lead_ar'])
    line('')
    line(co['name_ar_short'], bold=True, level=4)
    line(co['contact_phone'], level=4)
    line(co['contact_email'], level=4)
    line(ctx.address('contact_line1_ar'), level=4, after=None)
    line(ctx.address('contact_line2_ar'), level=4, after=None)
    line(co['website'] + ' ', level=4)
    line('')
    for para in ct['closing_ar'][:2]:
        line(para)
        line('')
    for para in ct['closing_ar'][2:]:
        line(para)
    line(ct['team_ar'], bold=True)
