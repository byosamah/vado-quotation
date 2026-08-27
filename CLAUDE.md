# VADO TFP

`README.md` covers the PowerPoint build, `html/README.md` the HTML twin,
`mcp/README.md` the connector, `DEPLOY.md` the hosting. This file holds only
what those do not say.

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

## A silent grep means a NUL byte, not an absent match

A scripted write can leave a NUL in a source file: `' other'` reached
`editor.js` as `'\0other'`. `grep` then treats the whole file as binary and
prints nothing and exits 1, which reads exactly like "no matches", so a
search for code that is plainly there comes back empty. `grep -a` sees it
and `python3` never stopped seeing it. To find the file:

    for f in html/src/*.js; do tr -d '\0' < "$f" | cmp -s - "$f" || echo "$f"; done

Neither `file` nor `grep -c` will tell you. `file` still calls a UTF-8
source with a NUL in it "Unicode text", and `grep -c $'\0'` counts every
line in the file, because the shell truncates that pattern to the empty
string. Take the byte out; do not work around it.

## Checking a password-protected site from the shell

**`curl -u` plus `-w '%{url_effective}'` prints the password.** curl renders
the effective URL with the credentials inside it, so a redirect check writes
the office password into whatever is reading the output. It happened here, to
a password set ten minutes earlier, and cost a rotation. Print
`%{http_code}` and nothing else.

**`--data-urlencode` escapes the `%` in your payload.** A check for an
encoded attack, `next=/%09/evil.example`, reached the server as a literal
percent sign and passed while proving nothing. Send the raw body with
`--data` and encode the other fields yourself. Same class as the silent grep
above: it did not fail, it never ran.

## The self-check needs a port you have never used

`python3 html/tests/prepare.py`, then serve `out/` on a fresh port.
`localStorage` is keyed by origin, so a job saved on that port is restored
into the blank build and the check reports ~115 phantom "missing {{tag}} /
extra <value>" failures that read exactly like a regression. Do not clear
that storage to fix it: it is someone's saved work.

The check burns its own port. Its second half loads the filled job and
commits it, so that origin now holds a job and the blank half fails there
ever after. One run, one port, and never a port the team might have used.

## The connector is generated, then committed

`web/api/_mcp/_data.mjs`, `_engine.mjs` and `_knowledge.mjs` are written by
`tools/build_mcp.py`. Never edit them: the next build wins. Edit the file
each one is copied from, then rebuild.

- `_engine.mjs` is `html/src/ctx.js` and `html/src/checks.js`, verbatim, in
  a module that exports `V`. `ctx.js` needs nothing but a bare `V` object,
  which is why this works at all. Keep it that way: a DOM reference in
  `ctx.js` would take the connector down and the browser would not notice.
- `_data.mjs` reads four constants **out of `editor.js`** by regular
  expression: `DERIVED`, `OPTIONAL`, `BY_CONTROL` and `V.PAGE_FIELDS`. They
  decide which values count as missing. Rename one and the build stops with
  a message rather than quietly counting the wrong list.
- Which page prints which value comes from a blank build of the PowerPoint,
  where every unfilled value prints as its own `{{tag}}`.

Node resolves a bare import from the importing file's own folder, so a
`tools/*.mjs` cannot `import '@modelcontextprotocol/server'`: the SDK lives in
`web/node_modules` and the path is spelled out. `npm install` needs
`--cache "$TMPDIR/npmcache"`, because the sandbox cannot write `~/.npm`.

## Three pre-send checks, one referee

`html/src/checks.js` is the rules. The browser draws them, the MCP server
returns them. `tools/presend.py` is separate and has to be: it reads a
built .pptx and can see a `{{tag}}` the PowerPoint really printed.

`tools/check_parity.py` runs both over every job file and fails when they
disagree. Add a rule to one, add it to the other, or the referee stops you.

The browser passes two things `checks.js` cannot work out: `fields`, read
off the rendered spans, and `spill`, which needs the deck laid out. The
server passes the generated map and no spill.

## Three traps the connector fell into

**`form-action` covers the redirect a submission causes**, not just where the
form posts. `/oauth/authorize` answers a correct password with a redirect to
the connector's callback on another origin, so `'self'` alone made Chrome
refuse to send the form at all, naming the page's own URL. Signing in to
Claude failed with nothing on screen to explain it. `/login` carries the same
policy and never showed it, because its redirect comes back here.

**Validate the string you return, not the one you received.** `safeNext`
checked the input's origin and handed back the parsed path, and the parser
removes dot segments while it resolves: `/.//evil.example` arrives with one
slash and leaves as `//evil.example`, which a browser reads as another site.
Two rounds of review to get right.

**`z.record` with an enum key makes every key required.** A caller setting one
phase duration was told the other eight were missing. `z.partialRecord`.

## Deploying: the build is not copied for you

`python3 html/build_html.py` writes `out/VADO-TFP.html` only. Copy it to
`web/index.html`, then push: production builds from GitHub on `main`.
Read `DEPLOY.md` before changing any Vercel setting. The root directory is
`web`, and pointing it at the repository root publishes the office bank
details with no password.

`PYTHON=python3 tools/smoke.sh` builds and checks every job file, generates
the connector bundles, runs the MCP self-test and the parity referee, and is
what `deploy.sh` gates on. Run it before committing.

It skips the two MCP steps when `web/node_modules` is missing and says so.
`cd web && npm install` once.

`tools/mcp_live.sh <url>` is the other half and needs a deployment: Vercel's
routing, the login page, and the whole OAuth flow. It also re-proves that the
site is still password-protected, because the middleware names sixteen exact
paths that skip it.

An environment variable needs a new deployment before it takes effect.
`vercel env add NAME production --force --sensitive` overwrites in place, so
`vercel env rm` is never needed, and it is refused by the permission
classifier anyway. Then `vercel redeploy <url>`, which takes no `--yes`.

**Do not poll `vercel list ... | sed -n '6p'` for Ready.** The line offset
moves as deployments age, and the loop then runs until something kills it;
four were left spinning here. Ask the site for the behaviour you changed
instead, and stop when the answer is the new one.

The push takes longer than a two-minute foreground timeout, because every
commit carries a fresh 1.8 MB `web/index.html`. Run it in the background.
A timed-out push is not a failed one: `git ls-remote --heads origin main`
answers in under a second, and `vercel inspect --logs <deployment>` names
the commit Vercel actually cloned.
