"""Slide 3 - المقدمة, the covering letter.

Reads: content.intro, content.company
The signature image is a scan; swap assets/signature-mkm.png to change it.
"""
from .. import chrome
from ..deck import picture, textbox

TITLE = 'Introduction'
SALUTATION_TAB = 300.0   # where حفظه الله sits, in points from the box edge
SECTION = 'intro'


def build(ctx, slide):
    it = ctx.c('intro')
    co = ctx.c('company')
    chrome.content_page(ctx, slide, title=ctx.c('sections', 0)['ar'], section=SECTION)

    _, t = textbox(ctx, slide, 177.4, 188.3, 449.4, 341.7, autofit=True)
    t.blank(2, sz=14, f='cairo', algn='just', rtl=True, ls=1.5)
    # Addressee on the right, honorific held away from it. One tab against a
    # declared stop, not three literal tabs: literal tabs move whenever the
    # name length or the font changes.
    t.para([{'t': it['salutation_ar'], 'sz': 14, 'b': True, 'f': 'cairo', 'c': 'ink'},
            {'t': '\t', 'sz': 14, 'b': True, 'f': 'cairo', 'c': 'ink'},
            {'t': it['salutation_honorific_ar'], 'sz': 14, 'b': True,
             'f': 'cairo', 'c': 'ink'}],
           algn='just', rtl=True, ls=1.5, tabs=[SALUTATION_TAB])
    t.blank(1, sz=11, f='cairo', algn='just', rtl=True, ls=1.5)
    for para in it['body_ar']:
        runs = [{'t': r['t'], 'b': r.get('b', False), 'sz': 12,
                 'f': 'cairo', 'c': 'ink'} for r in para]
        t.para(runs, algn='just', rtl=True, ls=1.5)

    who = ctx.signatory()
    _, t = textbox(ctx, slide, 177.4, 673.0, 449.4, 165.4, autofit=True)
    t.para([{'t': it['signoff_ar'], 'sz': 12, 'f': 'cairo', 'c': 'ink'}],
           algn='just', rtl=True, ls=1.5)
    t.para([{'t': who['name_ar'], 'sz': 12, 'b': True, 'f': 'cairo', 'c': 'ink'}],
           algn='just', rtl=True, ls=1.5)
    t.blank(1, sz=12, f='cairo', algn='just', rtl=True, ls=1.5)
    t.blank(3, sz=10, f='cairo', algn='just', rtl=True, ls=1.5)
    t.para([{'t': who['role_ar'], 'sz': 10, 'f': 'cairo', 'c': 'ink'}],
           algn='just', rtl=True, ls=1.5)
    t.para([{'t': who['office_ar'], 'sz': 12, 'b': True, 'f': 'cairo', 'c': 'ink'}],
           algn='just', rtl=True, ls=1.5)

    picture(ctx, slide, who['signature_asset'], 483.5, 718.6, 170.6, 85.3)
