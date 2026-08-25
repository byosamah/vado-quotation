"""Slide 13 - الاتفاقية, the conditions and the contract.

Reads: content.agreement

Signing this page forms the agreement, so nothing on it is positioned by
counting blank paragraphs. The contract text ends where it ends; the
footnote and the two signature blocks sit at declared coordinates below it.
Before this, six empty paragraphs held the footnote clear of the
signatures, which meant a font change could drop it onto one.

Numbered notes use PowerPoint's automatic numbering, so inserting a note
renumbers the list. A note with `level: 1` is a bullet under the note above
it.
"""
from .. import chrome
from ..deck import textbox

TITLE = 'Agreement'
SECTION = 'agreement'

INK = 'ink'
LEFT, WIDTH = 104.9, 537.8
BODY_Y = 196.4
NOTE_INDENT, NOTE_HANG = 27.0, -27.0
BULLET_INDENT = 63.0


def build(ctx, slide):
    ag = ctx.c('agreement')
    chrome.content_page(ctx, slide, title=ctx.c('sections', 6)['ar'], section=SECTION)

    _, t = textbox(ctx, slide, LEFT, BODY_Y, WIDTH, 470.0, autofit=True)

    t.para([{'t': ag['notes_heading_ar'], 'sz': 16, 'f': 'ar_medium', 'c': INK}],
           algn='r', rtl=True, ls=1.5, after=8)
    for note in ag['notes']:
        if note['level'] == 0:
            t.para([{'t': note['t'], 'sz': 12, 'f': 'ar_light', 'c': INK}],
                   algn='r', rtl=True, ls=1.5, after=8, bullet='1.',
                   indent=NOTE_HANG, margin_left=NOTE_INDENT)
        else:
            t.para([{'t': note['t'], 'sz': 12, 'f': 'ar_light', 'c': INK}],
                   algn='r', rtl=True, ls=1.5, level=1, bullet='•',
                   indent=NOTE_HANG, margin_left=BULLET_INDENT)

    t.para([{'t': ag['contract_heading_ar'], 'sz': 16, 'f': 'ar_medium', 'c': INK}],
           algn='r', rtl=True, ls=1.5, after=8, bullet='none',
           indent=0, margin_left=0)
    t.para([{'t': ag['basmala_ar'], 'sz': 12, 'f': 'ar_medium', 'c': INK}],
           algn='c', rtl=True, ls=1.5, after=8)
    t.para([{'t': ag['contract_body_ar'], 'sz': 12, 'f': 'en', 'c': INK}],
           algn='c', rtl=True, ls=1.5, after=8)
    t.para([{'t': ag['closing_ar'], 'sz': 12, 'f': 'en', 'c': INK}],
           algn='c', rtl=True, ls=1.5, after=8)

    _, t = textbox(ctx, slide, LEFT, ag['footnote_y'], WIDTH, 22.0, autofit=True)
    t.para([{'t': ag['footnote_ar'], 'sz': 10, 'f': 'en', 'c': INK}],
           algn='r', rtl=True, ls=1.5)

    for party in ag['parties']:
        _party(ctx, slide, party, ag['signature_y'])


def _party(ctx, slide, party, y):
    """One signature block. Both sides are built here so they cannot drift
    apart: the consultant used to run left to right while the owner ran
    right to left, on the same page, both holding Arabic.

    The consultant side names the person signing as well as the company, so
    it takes one blank line fewer to keep the two baselines level.
    """
    signatory = party.get('signatory_ar')
    if party['side'] == 'consultant':
        signatory = ctx.signatory()['name_prefixed_ar']

    _, t = textbox(ctx, slide, party['x'], y, party['w'], 155.0, autofit=True)
    t.para([{'t': party['role_ar'], 'sz': 10.5, 'f': 'en', 'c': INK}],
           algn='c', rtl=True, ls=1.5)
    t.blank(1, sz=10.5, f='en', algn='c', rtl=True, ls=1.5)
    t.para([{'t': party['name_ar'], 'sz': 12, 'f': 'ar_medium', 'c': INK}],
           algn='c', rtl=True, ls=1.5)
    if signatory:
        t.para([{'t': signatory, 'sz': 12, 'f': 'ar_medium', 'c': INK}],
               algn='c', rtl=True, ls=1.5)
        t.blank(1, sz=12, f='en', algn='c', rtl=True, ls=1.5)
    else:
        t.blank(2, sz=12, f='ar_medium', algn='c', rtl=True, ls=1.5)
    t.para([{'t': party['party_ar'], 'sz': 12, 'f': 'en', 'c': INK}],
           algn='c', rtl=True, ls=1.5)
