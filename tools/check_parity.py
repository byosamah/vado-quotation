#!/usr/bin/env python3
"""Make the two pre-send checks answer the same question the same way.

    python3 tools/check_parity.py

There are two implementations and there have to be. `tools/presend.py` reads
a built .pptx and can see things no JavaScript can, such as a `{{tag}}` the
PowerPoint really did print. `html/src/checks.js` runs in the browser and in
the MCP server, where there is no .pptx at all.

Two implementations of one rule is how a rule ends up with two answers, so
they are refereed: every job file is run through both, and the facts that
must agree are compared. What is deliberately NOT compared is wording. One
speaks Arabic to an employee and the other English to whoever built the
deck.

Fails loudly. A checker that has quietly stopped running looks exactly like
a checker that found nothing.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(os.path.dirname(__file__)))
sys.path.insert(0, ROOT)

from vado import numwords                                       # noqa: E402
from vado.context import Ctx                                    # noqa: E402
import importlib.util                                           # noqa: E402

spec = importlib.util.spec_from_file_location(
    'presend', os.path.join(ROOT, 'tools', 'presend.py'))
presend = importlib.util.module_from_spec(spec)
spec.loader.exec_module(presend)


def python_side(job_path):
    """The facts presend.py works out, without its printing."""
    ctx = Ctx(os.path.join(ROOT, 'theme.json'),
              os.path.join(ROOT, 'content.json'), job_path)

    blockers, warnings = [], []
    presend._check_payments(ctx, blockers, warnings)
    presend._check_money(ctx, blockers, warnings)
    presend._check_scope(ctx, warnings)
    presend._check_phases(ctx, warnings)

    total = 0.0
    for key in ('p1', 'p2', 'p3', 'p4'):
        raw = str(ctx.field(key)).strip().rstrip('%')
        try:
            v = float(raw)
        except ValueError:
            total = None
            break
        total += v * 100 if v <= 1 else v

    written = str(ctx.field('costwritten')).strip()
    fee = str(ctx.field('costnumber')).replace(',', '').strip()
    try:
        expected = numwords.spell(float(fee))
    except ValueError:
        expected = None

    return {
        'estimated': sorted(ctx.placeholders),
        'payments_total_p1_p4': total,
        'payment_count': len(ctx.payments()),
        'price_words_disagree': bool(
            expected and not written.startswith('{{') and written != expected),
        'no_duration': sorted((r.get('code') or '').strip()
                              for r in ctx.phases()
                              if r['no'] is not None and not r.get('duration_days')),
        'scope_promises_unsold': sorted(
            w for w in warnings if 'the scope promises' in w),
        'total_days': round(ctx.timeline_plan()['total_days']),
        'fee_in_words': written,
    }


def js_side(job_path):
    run = subprocess.run(
        ['node', os.path.join(ROOT, 'tools', 'checks_report.mjs'), job_path],
        capture_output=True, text=True, cwd=ROOT)
    if run.returncode:
        raise SystemExit('check_parity: the JavaScript checks would not run.\n'
                         + run.stdout + run.stderr)
    return json.loads(run.stdout)


def main():
    jobs = sorted(f for f in os.listdir(os.path.join(ROOT, 'jobs'))
                  if f.endswith('.json'))
    if not jobs:
        raise SystemExit('check_parity: no job files. Nothing was compared, '
                         'which is not the same as nothing being wrong.')

    problems = []
    for name in jobs:
        path = os.path.join(ROOT, 'jobs', name)
        py = python_side(path)
        js = js_side(path)

        def same(what, a, b):
            if a != b:
                problems.append(f'{name}: {what}\n'
                                f'    presend.py says  {a!r}\n'
                                f'    checks.js says   {b!r}')

        same('which values are marked as stand-ins',
             py['estimated'], js['estimated'])
        same('how many payments there are',
             py['payment_count'], js['payment_count'])
        same('whether the price in words disagrees with the figure',
             py['price_words_disagree'], js['price_words_disagree'])
        same('the price in words', py['fee_in_words'], js['fee_in_words'])
        same('which phases have no duration',
             py['no_duration'], js['no_duration'])
        same('how long the work runs', py['total_days'], js['total_days'])
        same('how many scope lines promise something unsold',
             len(py['scope_promises_unsold']),
             len(js['scope_promises_unsold']))

        # The four shares are what presend.py adds up; checks.js adds up the
        # schedule, which may hold more rows. They agree whenever the job
        # carries four payments or fewer, and that is the case worth guarding.
        if py['payment_count'] <= 4 and py['payments_total_p1_p4'] is not None:
            same('whether the payments reach 100 per cent',
                 abs(py['payments_total_p1_p4'] - 100) < 0.01,
                 abs(js['payments_total'] - 100) < 0.01)

        print(f'  compared {name}')

    if problems:
        print('\nThe two checks disagree:\n')
        for p in problems:
            print('  ' + p)
        print(f'\n{len(problems)} disagreement(s).')
        return 1
    print(f'\nall good. {len(jobs)} job(s), both checks agree')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
