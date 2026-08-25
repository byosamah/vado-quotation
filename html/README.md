# The HTML twin

One file. Open it, fill it in, print it to PDF. It carries its own fonts and
its own images, so it works with nothing installed and no network.

    python3 html/build_html.py                        # blank, tags showing
    python3 html/build_html.py --data jobs/x.json     # pre-filled
    # writes out/VADO-TFP.html, about 1.8 MB

The Python deck in `../` is untouched. Both read the same three JSON layers,
so a change to `content.json` reaches the PowerPoint and this together.

## How it is used

One page at a time. The page fills the screen and beside it, on the right,
only the values that appear on **that** page, in Arabic, in the order a
person gathers them. Big السابق and التالي buttons. The eight pages that
need nothing say so and offer a jump to the next one that does.

Nothing on screen looks like code. An unfilled value reads `اكتب مساحة
الأرض` in grey on a dotted line rather than `{{lotarea}}`, and a test fails
the build if `{{` ever appears on a page. The labels are not written here:
they are parsed at build time out of the skill's `references/fields.md`,
which already records what each field is called on the document it is
copied from, where it comes from, and a real example. One list, not two.

Everything structural sits on the page it changes: the map picker on 4, the
room list on 5, the services on 8, the durations on 11, the fee and the
split on 12.

Each of the fifteen Balady values carries a **تقديري** tick, meaning the
number is a stand-in rather than something read off بلدي. That replaces the
job file's `placeholders` list, which is a developer's idea, with the same
safety in words an employee uses.

**قبل الإرسال** is the only place the PDF button lives. It lists what is
still empty and on which page, what is marked as an estimate, and reads the
fee, the services and the programme back. The button is dead while anything
is missing, and an estimate has to be acknowledged before it can be sent.

The work saves itself as you type. **احفظ نسخة** downloads the job file for
another machine or for whoever builds the PowerPoint; **افتح ملف** resumes
from one.

All fifteen pages stay in the document even though one is on screen, so
printing gives the whole proposal with no re-render, and the screen zoom is
forced back to 1 for the PDF.

## Why it is not a screenshot of the PowerPoint

Because the point is to fill it in. Every value is editable in place, the
services can be turned on and off, durations redraw the Gantt chart, and
rooms can be added to the brief. That needs the renderer in the browser, so
`src/` is a port of `vado/`:

| Python | JavaScript |
|---|---|
| `vado/deck.py` | `src/core.js` |
| `vado/context.py`, `vado/numwords.py` | `src/ctx.js` |
| `vado/chrome.py`, `vado/slides/*.py` | `src/slides.js` |
| — | `src/editor.js`, the panel |

`build_html.py` bundles those four files, the stylesheet, the fonts as
base64 woff2, the images as data URIs, and the three JSON layers into one
HTML file.

The port is literal. The Python measures in points from the top-left of the
A3 page, and CSS understands `pt`, so every coordinate is used exactly as
written. There is no coordinate system to reconcile and no scale factor to
get wrong.

## What is fixed and what is not

Fixed: everything in `content.json`. The scope, the method, the agreement,
the contact page, the intro letter. Changing one of those is a studio
decision that reaches every future proposal, so it is a text edit in
`content.json`, not something to be done per client.

Changeable, from the page or the panel:

* the 49 field values, clicked and typed straight on the page
* which of the eleven services this job sells
* how long each phase takes, in days
* the fee and the payment split
* the room schedule on slide 5, including adding and deleting floors
* the site map image

## The fonts

The file embeds GE SS Text Light, Medium and Bold, and Cairo in five
weights. **Aller is not installed on the machine this was built on**, and
VADO chose Cairo in its place for the English. That substitution lives in
`build_html.py`, not in `theme.json`, because the PowerPoint still wants the
real Aller and `theme.json` is what the PowerPoint reads.

Numbers are the one thing that needs care. GE SS Text maps 0-9 to
Arabic-Indic glyphs inside the font file, so a plain `402` draws as `٤٠٢`.
The fix here is `unicode-range`: each Arabic face is paired with a
digits-only Cairo face that the browser uses for `U+0030-0039` and nothing
else. Arabic letters keep GE SS Text; digits come out Western. No JavaScript
is involved.

Ordering is separate from shape. A number next to Arabic needs a
left-to-right mark or the bidi algorithm draws `7 Days` as `Days 7` and
`1. CD` as `CD .1`. `core.js` splits every run at the script boundary and
inserts the mark exactly where `deck.py` does.

## What a page-by-page read found

Text parity and a no-collision check both passed while seven visible faults
were still on the pages. They are recorded here because every one of them
is a way a browser and PowerPoint disagree, and the next person porting
anything will meet them again.

**PowerPoint gives a new text box 18 pt.** Three places in the deck rely on
that instead of stating a size. Falling back to the browser's 16 px made
them 12 pt, and slide 2's numbers ran four rows past the section names they
label.

**A paragraph's leading comes from its tallest run.** `line-height` is a
multiple, and it was multiplying the inherited 18 pt rather than the run's
own size, so the 7 pt footer address got 27 pt lines and ran 35 pt off the
bottom of every page.

**Line spacing is 1.2 times the point size, not the font's own metric.**
Cairo declares a 1.874 em line box and GE SS Text 1.245. Using those put
the scope 275 pt off the bottom of a page. The deck settles it: 32 lines of
11 pt at 150% fit its 732.6 pt box only at 1.2.

**`direction: rtl` has to reach table cells.** The rule was scoped to the
text-box class, so every right-to-left paragraph inside a table was laid out
left to right. Slide 4's plot area read `م² · حسب الصك 512` with the number
at the wrong end. Pure Arabic still read correctly, which is exactly why it
went unnoticed, and it is the same trap the skill records for PowerPoint.

**The ordering mark is needed at both ends of a Latin run.** One at the
front stops `7 Days` becoming `Days 7`. One at the back keeps the
punctuation inside the run: without it the phases table read `.1` and
`All Above Sectors bill of quantities and specifications.` was drawn with
the full stop at the front of the line. `deck.py` marks only the leading
edge and only on digits, so the PowerPoint very likely still shows that.

**A tab stop is a position, not a gap.** An inline spacer 300 pt wide adds
300 pt after the text; the stop puts what follows it at 300 pt from the
start. The difference dropped `حفظه الله` onto its own line.

**Cairo is wider than the Aller it replaces.** On slide 13 the contract text
takes an extra line and ran into the footnote's declared position, so the
footnote and both signature blocks now drop to clear it. Install Aller and
nothing moves.

**The first font in a stack sets the line box**, even when no glyph comes
from it. The digits-only Cairo face sits in front of GE SS Text so numbers
come out Western, and it made every Arabic line four per cent too tall: on
the contents page the numbers ended a row above the names they label. Each
digits face now declares the metrics of the face it fronts, and the
paragraph carries the face as well as the runs, so the strut and the text
are measured against the same thing.

**A zoomed element keeps its pre-zoom width for layout.** Flex centring
measured the page at its full 1008 px, decided it overflowed the stage, and
pinned it to the start edge. Centre it as a block with `margin: 0 auto`.

**A page is built while it is `display: none`,** so measuring it there
returns zero. Anything a slide can only work out once it is on screen goes
in an `adjust()` that runs when the page becomes current. Slide 13 measured
itself at build time, got `NaN`, and dropped its footnote and both
signature blocks onto the header.

The reference renders in `ref/png-*` are not a reliable guide. Some pages
look right and some are plainly broken, and two hours went into chasing a
line-spacing model off one of the plausible-looking ones.

## Line spacing

PowerPoint's single line spacing is about 1.2 times the point size. The
browser's `normal` for these Arabic faces is nearer 1.66, because they
declare a generous ascent and descent. Left alone every paragraph inflated
and the tables grew past the heights the design declares: slide 11's last
phase row landed on the note under the chart. `styles.css` sets 1.2 as the
default; a paragraph with its own `ls` still wins, because that arrives as
an inline style.

## Testing it

    python3 html/tests/prepare.py jobs/260823MKM-RES-VILLA.json

That builds the HTML, builds the PowerPoint from the same data, extracts
every paragraph from the PowerPoint, and prints the two lines to paste into
the browser console. The check proves four things:

* **text** — every paragraph the PowerPoint holds is here, and nothing extra
* **geometry** — no table's last inked row reaches anything drawn below it,
  and no block lands on another by more than a line's leading
* **bleed** — nothing is drawn past the bottom of a page
* **order** — numbers mixed with Arabic carry the left-to-right mark, and
  every paragraph marked right-to-left is actually laid out that way

It does not prove the deck looks right. Nothing automatic can: three
measures were tried and each was wrong in its own way, and the reasons are
written down in `tests/selfcheck.js`. Whether it looks right is a question
for a person with the file open.

## The PDF

`Download PDF` calls the browser's print. Chrome's *Save as PDF*
destination produces real text at 756 × 1008 points, which is the A3 the
PowerPoint uses. Set margins to None and turn background graphics on.

The zoom slider is a screen convenience and is forced back to 1 for
printing, so a deck reviewed at 55% does not print at 55%.
