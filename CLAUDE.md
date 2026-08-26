# VADO TFP

`README.md` covers the PowerPoint build, `html/README.md` the HTML twin,
`DEPLOY.md` the hosting. This file holds only what those do not say.

## html/src/styles.css is two stylesheets in one file

Lines 1-129 draw the A3 page and are a port of the Python. Editing them
changes the client document. Everything below draws the tool around it.
Say which half you are in before you edit.

- `@media print` must stay the LAST rule. It switches the tool off.
- Responsive rules must be `@media screen and (...)`, never a bare
  `@media (max-width: ...)`. The phone layout sets `#stage {position:
  fixed}`, and a fixed stage prints one screenful, not fifteen pages.
- Panel field labels come from the skill's `references/fields.md`. The
  captions printed on the page come from `content.json`. Same Arabic,
  two files.
- `#rail *` and `#panel *` set `max-width: 100%`. An id rule beats a
  class, so a class `max-width` inside either needs the id in front of it.
- To see what will really print, flip the print block to `screen` through
  `document.styleSheets` and screenshot the page. The same trick tests a
  breakpoint when `resize_window` refuses. Never call `window.print()` in
  a browser check: the dialog freezes the extension. Stub it and count.

## editor.js

- **A commit redraws everything.** `set()` calls `changed()`, which
  re-renders all fifteen pages and rebuilds `#page-form` and the rail. A
  control that reacts to a press while a box has focus loses that press:
  the node it started on is gone before mouseup, so the click never fires.
  Act on `mousedown`, focus inside `setTimeout(..., 0)` so it lands after
  the rebuild, and treat `e.detail === 0` as the keyboard's click.
- **A press that also has to keep typing must re-read the model.** The
  press fires before the box's own `blur`, so a handler holding the copy
  the panel was drawn from writes back a copy taken before the typing was
  committed, and the typing disappears. `brief()` shows the shape: blur
  whatever has focus, then read the value back fresh inside the timeout.
- **Arabic counts go through `arCount(n, one, two, few, many)`.**
  `ar(n) + ' قيمة'` is wrong at one, at two, and at three to ten.
- **A handler written inside a `forEach` must not read a `let` declared
  outside it.** `durations()` walked the phase list with one `parent`
  variable, and every end-day box on the page edited whichever phase the
  walk finished on. Copy it into a `const` inside the loop body.
- **A field the panel offers is a field some page draws.** `onPage` is read
  off the rendered spans, which is what stops the list going stale. A value
  the page prints only when it is given has no span while it is empty, so
  it must be named in `V.PAGE_FIELDS` or there is no box to fill it in;
  if it may stay empty, in `OPTIONAL` or it is «ناقص» forever; and if a
  page's own control edits it, in `BY_CONTROL` or the panel draws a second
  box beside the control. `p1` to `p4` are all three: named on page 12,
  edited by the payment rows, counted by neither.
- **`_percent` must refuse a tag.** «{{p1}}» stripped to its digits is a
  `1`, which reads as 100%. On a job with a fee and no split that made
  every stage cost the whole fee, and nothing on screen said so.

## A page that decides its own page count

`s09_phases` and `s06_scope` both declare `pages(ctx)`. The scope counts
lines against a budget; the phases measure. `adjust()` writes what each
phase really took into `ctx.phaseHeights`, and if that changes the answer
it calls `ctx.relayout()`, which redraws the deck once, deferred and
guarded. It cannot loop: what a phase measures does not depend on the page
it landed on. The budget itself is `theme.phases_page.rows_room`, one
number, because `vado/slides/s09_phases.py` breaks the page too and the two
must break it in the same place.

## Anything measured must be measured again after the fonts load

The pages are laid out before the base64 faces arrive, and the fallback is
narrower than Cairo. `s09_phases.adjust()` read a table twenty points short
and parked the legend on the last two rows. `document.fonts.ready` re-runs
`show()`; `beforeprint` re-runs every page's `adjust()`.

## The self-check needs a port you have never used

`python3 html/tests/prepare.py`, then serve `out/` on a fresh port.
`localStorage` is keyed by origin, so a job saved on that port is restored
into the blank build and the check reports ~115 phantom "missing {{tag}} /
extra <value>" failures that read exactly like a regression. Do not clear
that storage to fix it: it is someone's saved work.

## Deploying: the build is not copied for you

`python3 html/build_html.py` writes `out/VADO-TFP.html` only. Copy it to
`web/index.html`, then push: production builds from GitHub on `main`.
Read `DEPLOY.md` before changing any Vercel setting. The root directory is
`web`, and pointing it at the repository root publishes the office bank
details with no password.
