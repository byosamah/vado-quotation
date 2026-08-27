# VADO technical and financial proposal

A rebuild of `TFP00-26-R00 (TEMPLATE) VBA Activated.pptm` as code plus data.
Same 15 slides, same words, same logo, same A3 portrait page. No macros, no
Excel, no Windows.

## Build it

```bash
# blank template: every {{tag}} stays visible
python3 build.py

# a real proposal, then check it before it goes out
python3 build.py --data jobs/sample.json --out out/TFP-250402MKM.pptx
python3 tools/presend.py jobs/sample.json out/TFP-250402MKM.pptx

# one slide only, while you are working on it
python3 build.py --only 11

# rebuild and put the fresh copy in front of PowerPoint in one step
tools/show.sh jobs/<id>.json
```

PowerPoint holds its own copy in memory, so a rebuild under an open file is
invisible until the window is closed and reopened. `tools/show.sh` does
that for you. Use it every round: a check you have to remember to do is a
check you will skip.

The only dependency is `python-pptx`.

## Where things live

| File | What it holds |
|---|---|
| `content.json` | Every word in the deck, plus the 49 merge fields |
| `theme.json` | Colours, fonts, sizes, page furniture coordinates |
| `jobs/*.json` | One file per proposal: the 49 field values, the services sold, the rooms designed |
| `vado/slides/sNN_*.py` | One module per slide. Each reads content, draws shapes |
| `vado/chrome.py` | The header, rule, section rail and footer that repeat |
| `vado/deck.py` | Drawing helpers: text, tables, lines, arrows, pictures |
| `vado/numwords.py` | The price in Arabic words, ported from the Excel macro |
| `assets/` | Logo, wordmark, riyal mark, bank mark, QR, signature, paper |
| `ref/` | The unpacked original and the evidence used to verify the rebuild |
| `tools/show.sh` | Rebuild and reopen in PowerPoint, one command |
| `tools/` | The checkers described below |
| `mcp/` | The connector an employee points their own Claude or ChatGPT at |
| `web/` | The deployment: the browser twin, its password, and the connector |

## Three ways to fill one in

The job file is the master. Every route reads and writes the same file, so a
proposal started one way can be finished another.

| Route | For |
|---|---|
| `build.py --data jobs/x.json` | a .pptx, on a machine with the brand fonts |
| `html/build_html.py` | a browser, no install and no network. See `html/README.md` |
| `https://vado-tfp.vercel.app/mcp` | an employee's own Claude or ChatGPT. See `mcp/README.md` |

## Rules that matter

**Arabic needs two things set on every run.** The Latin face and the
complex-script face. `deck.py` does both from one font alias. Miss the
complex-script face and PowerPoint falls back to Times New Roman.

**Every Arabic paragraph sets `rtl=True`.** Without it PowerPoint reorders
the words.

**Fonts are named, not embedded.** Aller, Aller Light, Aller Display and
GE SS Text Light / Medium / Bold must be installed on the machine that
opens the file. They are the fonts the original used.

**Empty paragraphs carry a size.** `t.blank(1, sz=11, f='cairo')`. A blank
with no size collapses to 18 pt and the page drifts down.

## Check your work

```bash
python3 tools/lint_pptx.py out/VADO-TFP.pptx   # must print 0 problems
python3 tools/compare.py  out/VADO-TFP.pptx    # diff against the original
python3 tools/presend.py jobs/x.json out/x.pptx  # before a client sees it
```

`lint_pptx.py` catches the element-order and duplicate-child mistakes that
make PowerPoint silently repair a file. A repaired file loses formatting
and says nothing. Run it after every change.

`compare.py` reads the unpacked original in `ref/orig_pptm_x` and reports
any paragraph or picture that does not match. See `NOTES.md` for the
differences that are there on purpose.

## What the build refuses to do

`build.py` stops before writing if:

* the four payment percentages do not total 100
* `content.json` has a duplicate section key
* the number of sections does not match the side rail

## A job file

```json
{
  "fields":   { "tfp_number": "...", "costwritten": "auto", "...": "..." },
  "services": ["concept", "engineering", "permit"],
  "spatial":  { "outdoor": ["..."], "floors": [{"name_ar": "...", "rooms_ar": "..."}] }
}
```

`fields` are the 49 merge values. `services` lists the ids that are sold;
everything else is marked N/A on slide 8. `spatial` is the slide 5 room
schedule. Leave any of the three out and the boilerplate stands.

Set `costwritten` to `"auto"` and the build spells the figure in Arabic
words, which is what the Excel macro used to do.

## The merge fields

The 49 field names match the old Excel form exactly, so the tracker sheet
still maps one to one. A field left at its own `{{tag}}` string renders as
that tag, which is how the blank template is produced.
