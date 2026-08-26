#!/usr/bin/env python3
"""Check a built proposal before it reaches a client.

    python3 tools/presend.py jobs/250402MKM.json out/TFP-250402MKM.pptx

Prints three things:

  BLOCKERS  the file itself is wrong. Exit code 1.
  WARNINGS  a decision for you to make. Exit code 0.
  SUMMARY   every value that went in, so you can read it back.

The point is the summary. A machine can tell you a field is empty; only you
can tell that the plot number is the neighbour's.

A blocker means the PowerPoint is broken, not that the job is unfinished:
a tag still showing on a slide, a fee that is not a number, text that runs
past the footer. Everything a person can weigh and send anyway is a
warning, because the browser twin now prints it after asking once. The two
must agree about what stops a proposal. One this refuses to pass gets
rebuilt by hand instead, and then nothing checks it at all.

They still part on one thing, an unfilled value, and only because the two
files do. The browser leaves empty space where the value belongs. The
PowerPoint writes `{{lotarea}}` on the page, in front of the client.
"""
from __future__ import annotations

import json
import os
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from vado import numwords                                       # noqa: E402
from vado.context import ROOT, Ctx                              # noqa: E402

A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
P = '{http://schemas.openxmlformats.org/presentationml/2006/main}'
TAG = re.compile(r'\{\{\s*([a-zA-Z0-9_]+)\s*\}\}')

# Fields that must be in step with each other.
PAIRS = [
    ('name_title_ar', 'name_title'), ('firstname_ar', 'firstname'),
    ('lastname_ar', 'lastname'), ('project_type_ar', 'project_type'),
    ('city_ar', 'city'), ('district_ar', 'district'),
]

GROUPS = [
    ('Reference', ['tfp_number', 'date', 'tfp_dur']),
    ('Client', ['name_title_ar', 'firstname_ar', 'lastname_ar',
                'name_title', 'firstname', 'lastname', 'phone', 'email']),
    ('Project', ['project_type_ar', 'project_type', 'city_ar', 'city',
                 'district_ar', 'district', 'spatialneeds']),
    ('Land', ['lotarea', 'areasource', 'lotnumber', 'districtnumber']),
    ('Location', ['coordinates', 'nat_address', 'googlelink']),
    ('Balady limits', ['usecode', 'divtype', 'divdesc', 'landuse', 'usedesc',
                       'numberofunits', 'buildingratio', 'minimumelev',
                       'frontsetback', 'sidesetback', 'backsetback', 'floors',
                       'height', 'canaddfloor', 'farratio']),
    ('Architecture', ['ksaarchzone', 'ksaarchlevel', 'archstyle']),
    ('Money', ['costnumber', 'costwritten', 'p1', 'p2', 'p3', 'p4']),
]


def main(job_path, pptx_path):
    ctx = Ctx(os.path.join(ROOT, 'theme.json'),
              os.path.join(ROOT, 'content.json'), job_path)
    blockers, warnings = [], []

    _check_unfilled(pptx_path, blockers)
    _check_placeholders(ctx, warnings)
    _check_payments(ctx, blockers, warnings)
    _check_lists(ctx, blockers)
    _check_pairs(ctx, warnings)
    _check_money(ctx, blockers, warnings)
    _check_rooms(ctx, warnings)
    _check_services(ctx, blockers, warnings)
    _check_scope(ctx, warnings)
    _check_project_fit(ctx, warnings)
    _check_capacity(ctx, pptx_path, blockers, warnings)
    _check_phases(ctx, warnings)
    _check_formats(ctx, warnings)

    print(f'PRE-SEND CHECK   {os.path.basename(pptx_path)}')
    print(f'job              {os.path.relpath(job_path, ROOT)}')
    print()

    if blockers:
        print('BLOCKERS')
        for b in blockers:
            print(f'  x  {b}')
        print()
    if warnings:
        print('WARNINGS')
        for w in warnings:
            print(f'  !  {w}')
        print()
    if not blockers and not warnings:
        print('Nothing to flag.\n')

    _summary(ctx)
    print()
    if blockers:
        print(f'{len(blockers)} blocker(s). Do not send yet.')
        return 1
    print('No blockers. Read the summary above, then open the file, check '
          'slides 5 and 12 with your own eyes, and export the PDF.')
    return 0


# -- checks ----------------------------------------------------------------

def _check_unfilled(pptx_path, blockers):
    """A visible {{tag}} in the file the client opens is the worst outcome.

    This is the one thing the browser twin does not have to stop, because
    it does not have the fault: an unfilled value prints there as empty
    space. Here it prints as itself.
    """
    found = set()
    with zipfile.ZipFile(pptx_path) as z:
        for name in z.namelist():
            if not name.startswith('ppt/slides/slide'):
                continue
            slide = int(re.search(r'slide(\d+)', name).group(1))
            root = ET.fromstring(z.read(name))
            text = ''.join(t.text or '' for t in root.iter(A + 't'))
            for tag in TAG.findall(text):
                found.add((tag, slide))
    for tag, slide in sorted(found, key=lambda x: (x[0], x[1])):
        blockers.append(f'{{{{{tag}}}}} is still showing on slide {slide}')


def _check_placeholders(ctx, warnings):
    """Stand-in values look exactly like real ones, which is the danger.

    A job may fill a field with something plausible so the page can be
    reviewed before the real value arrives. Every such field must be named
    in the job's `placeholders` list. A page that reads correctly is not
    the same as a page that is correct.

    These warn rather than block. A proposal goes out while a بلدي number
    is still being chased, the screen calls these تقديري and asks before it
    prints one, and this has to let out what that lets out.
    """
    if not ctx.job.get('map') and 'map' not in ctx.placeholders:
        warnings.append('slide 4 is using the stand-in site map. Add '
                        '"map": "<file>" to the job, or list "map" under '
                        '"placeholders" to say you know.')
    for name in ctx.placeholders:
        shown = ctx.job.get(name) if name in ctx.job else ctx.field(name)
        if name == 'map':
            shown = ctx.job.get('map') or 'map-placeholder.png'
        warnings.append(f'{name} holds a placeholder: {shown!r}. '
                        f'Replace it and take it out of the job\'s '
                        f'"placeholders" list.')


def _check_payments(ctx, blockers, warnings):
    """A split that is not a number is a broken file. A split that misses
    100 is a decision, so it reads the same way it does on the screen."""
    total, parts = 0.0, []
    for key in ('p1', 'p2', 'p3', 'p4'):
        raw = str(ctx.field(key)).strip().rstrip('%')
        if raw.startswith('{{'):
            return
        try:
            v = float(raw)
        except ValueError:
            blockers.append(f'payment {key} is not a number: {ctx.field(key)!r}')
            return
        v = v * 100 if v <= 1 else v
        parts.append(v)
        total += v
    if abs(total - 100.0) > 0.01:
        warnings.append('payments total {:.0f}% ({}), they should total 100%'
                        .format(total, ' + '.join(f'{p:.0f}' for p in parts)))


def _check_lists(ctx, blockers):
    lists = ctx.c('lists')
    for field, key, label in (('ksaarchzone', 'ksa_arch_zones', 'Saudi architecture zone'),
                              ('ksaarchlevel', 'ksa_arch_levels', 'Saudi architecture level')):
        val = str(ctx.field(field)).strip()
        if val.startswith('{{') or val in lists[key]:
            continue
        blockers.append(f'{label} {val!r} is not on the list. '
                        f'Closest: {_closest(val, lists[key])!r}')


def _check_pairs(ctx, warnings):
    for ar, en in PAIRS:
        a, e = str(ctx.field(ar)).strip(), str(ctx.field(en)).strip()
        if a.startswith('{{') and e.startswith('{{'):
            continue
        if a.startswith('{{') or e.startswith('{{') or not a or not e:
            warnings.append(f'{ar} and {en} are not both filled: {a!r} / {e!r}')
    last = str(ctx.field('lastname'))
    if re.match(r'^Al[A-Z]', last):
        warnings.append(f'lastname {last!r} needs a space after Al, '
                        f'e.g. "Al {last[2:]}"')


def _check_money(ctx, blockers, warnings):
    raw = str(ctx.field('costnumber')).replace(',', '').strip()
    if raw.startswith('{{'):
        return
    try:
        amount = float(raw)
    except ValueError:
        blockers.append(f'costnumber is not a number: {ctx.field("costnumber")!r}')
        return
    if amount < 5000:
        warnings.append(f'the fee is {amount:,.0f} SAR. That is low for a '
                        f'design commission. Confirm it is not missing a zero.')
    if amount > 2_000_000:
        warnings.append(f'the fee is {amount:,.0f} SAR. Confirm the figure.')
    expected = numwords.spell(amount)
    written = str(ctx.field('costwritten')).strip()
    if not written.startswith('{{') and written != expected:
        warnings.append(f'the written price does not match the figure.\n'
                        f'       figure says: {amount:,.0f}\n'
                        f'       words say:   {written}\n'
                        f'       should be:   {expected}')


def _check_rooms(ctx, warnings):
    """Slide 5 lists real rooms. Shipping the previous client's is the
    single easiest mistake to make with this deck."""
    for w in ctx.warnings:
        warnings.append(w)
    if not ctx.job.get('spatial'):
        warnings.append('slide 5 still has the boilerplate room schedule. '
                        'Add "spatial" to the job file, or confirm the rooms '
                        'really are the same as the template.')


SERVICE_ROWS_MAX = 14      # rows that fit above the footer on the services page


def _check_services(ctx, blockers, warnings):
    items = ctx.services()
    sold = [s for s in items if s['included']]
    if not sold:
        blockers.append('no services are included, so slide 8 offers nothing')
    if len(sold) == len(items):
        warnings.append('every service is included. Confirm that is the deal.')
    if len(items) > SERVICE_ROWS_MAX:
        blockers.append(
            f'the services page has {len(items)} rows and fits '
            f'{SERVICE_ROWS_MAX}. The rest will fall past the footer.')


# Words that mean a service is being promised, wherever they appear in the
# scope pages. Matching is loose on purpose: the point is to make a human
# look, not to be clever.
SCOPE_MARKERS = {
    'supervision': ['الإشراف'],
    'interior':    ['التصميم الداخلي'],
    'landscape':   ['لاندسكيب', 'تنسيق الموقع', 'البيئة المبنية'],
    'bidding':     ['المناقصات', 'الطرح'],
    'pm':          ['إدارة المشروع'],
    'bim':         ['النمذجة', 'BIM'],
    'archviz':     ['الإظهار المعماري'],
    'hbu':         ['أعلى استخدام', 'الدراسة العقارية'],
    'permit':      ['رخصة البناء', 'الرخصة'],
    'concept':     ['التصميم المعماري المبدئي', 'الفكرة التصميمية'],
    'engineering': ['المخططات التنفيذية', 'الرسومات التنفيذية'],
}


def _check_scope(ctx, warnings):
    """Does the scope text agree with what is being sold?

    The scope pages are boilerplate that a human edits. Slide 8 is a list
    of what the fee buys. Nothing links them, so the two drift, and they
    drift in a direction that costs money: a scope that still promises
    الإشراف on a job where supervision is marked N/A is a contract saying
    two different things. The client will read the one that favours them.

    This flags both directions. Promising something unsold is the
    expensive mistake and is named as one, but the scope pages are a human
    edit and a human settles them, so it warns rather than stops. Selling
    something the scope never mentions warns too, because the deliverables
    table on slide 9 may already cover it.
    """
    text = ' '.join(ln.get('t', '') for ln in ctx.c('scope')['lines'])
    for svc in ctx.services():
        markers = SCOPE_MARKERS.get(svc['id'], [])
        if not markers:
            continue
        mentioned = any(m in text for m in markers)
        if mentioned and not svc['included']:
            warnings.append(
                f"the scope promises {svc['ar'].strip()} but slide 8 marks it "
                f"N/A. That is a contract saying two things, and the client "
                f"reads the one that favours them. Either sell it or take it "
                f"out of the scope text.")
        elif svc['included'] and not mentioned:
            warnings.append(
                f"{svc['ar'].strip()} is sold but the scope pages never "
                f"mention it. Check slide 9 covers it, or add it.")


def _check_project_fit(ctx, warnings):
    """The scope was written for a building. Say so when it is not one.

    There is no reliable way to tell whether a scope suits a project, so
    this does the small honest thing: it names the project type and asks
    for a human read when the type is not the residential case the
    boilerplate was written around.
    """
    kind = str(ctx.field('project_type_ar')).strip()
    if kind.startswith('{{') or not kind:
        return
    residential = any(w in kind for w in ('فيلا', 'سكني', 'سكنية', 'قصر', 'استراحة'))
    if not residential:
        warnings.append(
            f"the project is {kind}, and the scope pages carry the "
            f"standard building scope written around a residential job. Read "
            f"it against this project before sending: approvals, disciplines "
            f"and deliverables may all differ.")


def _check_capacity(ctx, pptx_path, blockers, warnings):
    """Will the text still fit above the footer?

    The text pages grow downwards as content is added and nothing stops
    them reaching the footer. This counts the paragraphs actually written
    into the biggest text block on each page and compares that against what
    the original file held, which is PowerPoint's own measurement of the
    same text in the real fonts.

    It counts paragraphs, so a paragraph that wraps to four lines costs
    four. That makes it a guard against "someone added ten lines", not a
    prediction of the last millimetre. Only PowerPoint can tell you that.
    """
    cap = ctx.geo('capacity')
    manifest = _manifest(pptx_path)
    with zipfile.ZipFile(pptx_path) as z:
        for row in manifest:
            limit = cap['modules'].get(row['module'])
            if not limit:
                continue
            page = row['slide']
            root = ET.fromstring(z.read(f'ppt/slides/slide{page}.xml'))
            # a slide's own text boxes are <p:txBody>; table cells are
            # <a:txBody>. The page-filling block is always the former.
            biggest = 0
            for body in root.iter(P + 'txBody'):
                biggest = max(biggest, len(body.findall(A + 'p')))
            over = biggest - limit['max']
            if over > 0:
                blockers.append(
                    f"slide {page} ({limit['note']}) has {biggest} paragraphs "
                    f"and room for about {limit['max']}. It will run into the "
                    f"footer. Cut {over} or move them to another page.")
            elif over == 0:
                warnings.append(
                    f"slide {page} ({limit['note']}) is at its limit, "
                    f"{biggest} paragraphs. Nothing more fits.")


def _check_phases(ctx, warnings):
    """Every phase on the deliverables page should also be on the schedule.

    Slides 9 and 11 read the same list now, so they cannot list different
    phases. They can still disagree about time: a phase with no `duration`
    is drawn on slide 9 with a deliverable and a handover, and on slide 11
    with an empty cell and no bar on the chart. A client reads that as work
    with no end date.
    """
    for row in ctx.phases():
        if row['no'] is None:
            continue
        if not row.get('duration_days'):
            warnings.append(
                f"phase {row['no']} {(row.get('code') or '').strip()} "
                f"{row.get('name_ar', '')} has no duration, so it has no bar on "
                f"the chart and an empty cell in the schedule.")
    plan = ctx.timeline_plan()
    weeks = plan['weeks']
    print_days = plan['total_days']
    if print_days > weeks * 7:
        warnings.append(f'the work runs {print_days:.0f} days and the chart grid '
                        f'holds {weeks * 7}. Widen the grid.')


def _manifest(pptx_path):
    """What is on each slide. build.py writes it beside the .pptx because the
    deck has no fixed slide count any more: the scope paginates."""
    path = pptx_path + '.manifest.json'
    if not os.path.exists(path):
        return []
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def _check_formats(ctx, warnings):
    checks = [
        ('date', r'^\d{1,2} [A-Z]{3} \d{4}$', 'expected e.g. "23 AUG 2026"'),
        ('tfp_dur', r'^\d+$', 'expected a plain number of days, e.g. "14"'),
        ('email', r'^[^@\s]+@[^@\s]+\.[^@\s]+$', 'does not look like an email'),
        ('phone', r'^\+?[\d\s]{9,}$', 'expected KSA format, e.g. "055 123 4567"'),
        ('lotarea', r'^[\d,.]+$', 'expected square metres as a number'),
    ]
    for field, pattern, why in checks:
        val = str(ctx.field(field)).strip()
        if val.startswith('{{') or not val:
            continue
        if not re.match(pattern, val):
            warnings.append(f'{field} {val!r}: {why}')


def _closest(value, options):
    best, score = options[0], -1
    for o in options:
        s = len(set(value) & set(o))
        if s > score:
            best, score = o, s
    return best


# -- summary ---------------------------------------------------------------

def _summary(ctx):
    print('SUMMARY  read this back before you send')
    for title, keys in GROUPS:
        print(f'\n  {title}')
        for k in keys:
            v = str(ctx.field(k))
            if v.startswith('{{'):
                mark = ' <- not filled'
            elif k in ctx.placeholders:
                mark = ' <- PLACEHOLDER'
            else:
                mark = ''
            print(f'    {k:<16} {v}{mark}')

    print('\n  The brief on slide 5')
    for g in ctx.spatial()['groups']:
        print(f"    {g['title_ar']}")
        for item in g.get('items') or []:
            print(f"      - {item}")
        for b in g.get('blocks') or []:
            print(f"      {b['name_ar']}: {(b.get('contents_ar') or '').strip()}")

    print(f"\n  Site map on slide 4   {ctx.job.get('map') or 'map-placeholder.png'}")

    who = ctx.signatory()
    print(f"\n  Signed by         {who['name_ar']}  ({who['signature_asset']})")

    print('\n  Services on slide 8')
    for s in ctx.services():
        print(f"    {'IN ' if s['included'] else 'N/A'}  {s['ar'].strip()}")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1], sys.argv[2]))
