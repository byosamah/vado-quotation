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

## The self-check needs a port you have never used

`python3 html/tests/prepare.py`, then serve `out/` on a fresh port.
`localStorage` is keyed by origin, so a job saved on that port is restored
into the blank build and the check reports ~115 phantom "missing {{tag}} /
extra <value>" failures that read exactly like a regression. Do not clear
that storage to fix it: it is someone's saved work.

## Rebuilding for the web is two steps

`python3 html/build_html.py` writes `out/VADO-TFP.html` only.
`cp out/VADO-TFP.html web/index.html` before deploying.
