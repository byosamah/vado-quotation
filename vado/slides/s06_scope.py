"""Slides 6 and onward - نطاق العمل, the scope.

Reads: content.scope

The scope is one list of lines that flows across as many pages as it needs.
A villa fills two. A project with more disciplines, or a different approval
chain, fills three, and the deck grows rather than the text running into
the footer.

That is why this module declares `pages(ctx)` instead of being one slide:
`build.py` asks how many it wants and hands it that many.

A line may set:
  t              the text
  sz             point size, default 11
  b              bold
  bullet         a bullet character
  level_indent   steps in from the start edge, each `indent_step` points
  page_break     start a new page before this line
"""
from .. import chrome
from ..deck import textbox

TITLE = 'Scope of work'
SECTION = 'scope'

INK = 'ink'
BULLET_INDENT = -13.5
BULLET_MARGIN = 121.5
BOX = (149.9, 188.2, 492.7, 732.6)


def pages(ctx):
    return len(_paginate(ctx))


def build(ctx, slide, page=0):
    sc = ctx.c('scope')
    chunks = _paginate(ctx)
    chrome.content_page(ctx, slide, title=ctx.c('sections', 2)['ar'], section=SECTION)

    x, y, w, h = BOX
    _, t = textbox(ctx, slide, x, y, w, h, autofit=True)

    if page == 0:
        t.para([{'t': sc['heading_ar'], 'sz': 14, 'b': True, 'f': 'cairo', 'c': INK}],
               algn='just', rtl=True, ls=1.5)
        t.blank(1, sz=14, f='cairo', algn='just', rtl=True, ls=1.5)
        t.para([{'t': sc['lead_ar'], 'sz': 12, 'f': 'cairo', 'c': INK}],
               algn='just', rtl=True, ls=1.5)
        t.blank(1, sz=12, f='cairo', algn='just', rtl=True, ls=1.5)

    render_lines(t, chunks[page], sc.get('indent_step', 36.0))


def _paginate(ctx):
    """Split the lines into pages that fit above the footer.

    Page one is shorter because the heading and the lead sit above the
    lines. A `page_break` starts a new page even when there is room, which
    is how phase two keeps its own opening.
    """
    sc = ctx.c('scope')
    cap = sc['page_capacity']
    lead_cost = 4              # heading, gap, lead, gap
    pages_out, current, budget = [], [], cap - lead_cost

    for line in sc['lines']:
        if line.get('page_break') or len(current) >= budget:
            if current:
                pages_out.append(current)
                current, budget = [], cap
            if line.get('page_break'):
                continue
        current.append(line)
    if current:
        pages_out.append(current)
    return pages_out or [[]]


def render_lines(t, lines, step=36.0):
    """Indentation is a right margin, because Arabic starts on the right.

    It used to be leading tab characters, which move whenever the font or a
    name length changes.
    """
    for ln in lines:
        kw = dict(algn='just', rtl=True, ls=1.5)
        if ln.get('bullet'):
            kw.update(bullet=ln['bullet'], level=3,
                      indent=BULLET_INDENT, margin_left=BULLET_MARGIN)
        elif ln.get('level_indent'):
            kw['margin_right'] = ln['level_indent'] * step
        t.para([{'t': ln['t'], 'sz': ln.get('sz', 11), 'b': ln.get('b', False),
                 'f': 'cairo', 'c': INK}], **kw)
