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
- **Arabic counts go through `arCount(n, one, two, few, many)`.**
  `ar(n) + ' قيمة'` is wrong at one, at two, and at three to ten.

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
