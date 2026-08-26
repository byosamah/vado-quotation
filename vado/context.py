"""Build context: the theme, the content, the job, and the paths to the assets.

Three layers, each overriding the one above:

  theme.json     how it looks
  content.json   the boilerplate: every word that is the same on every proposal
  jobs/<id>.json this proposal: the 49 field values, the services sold, the
                 rooms designed

A job that says nothing about a thing gets the boilerplate. That is what
makes the blank template and a real proposal the same code path.
"""
from __future__ import annotations

import json
import math
import os
import re

from . import numwords

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

TAG = re.compile(r'\{\{\s*([a-zA-Z0-9_]+)\s*\}\}')


class Ctx:
    def __init__(self, theme_path, content_path, data_path=None):
        self.theme = _load(theme_path)
        self.content = _load(content_path)
        self.theme_path = theme_path
        self.content_path = content_path
        self.data_path = data_path

        self.job = _load(data_path) if data_path else {}
        self.job.pop('_doc', None)

        self.fields = dict(self.content.get('fields', {}))
        self.fields.pop('_doc', None)
        # A job may be {"fields": {...}, ...} or a flat bag of field values.
        overlay = self.job.get('fields') if 'fields' in self.job else {
            k: v for k, v in self.job.items()
            if k not in ('services', 'spatial', 'content', 'signatory',
                         'placeholders', 'durations', 'starts', 'markers',
                         'payments',
                         'timeline_weeks', 'map', 'map_data', 'map_marker',
                         'map_pos', 'map_fit', 'map_opacity')
        }
        self.fields.update(overlay or {})
        self.placeholders = list(self.job.get('placeholders') or [])
        self.warnings = []
        self.unknown_tags = set()
        self._derive()

    # ---- derived values --------------------------------------------------
    AUTO = ('', 'auto')

    @staticmethod
    def _percent(raw):
        """A share of the fee, as a percentage.

        "30", "30%", "٣٠٪" and "0.3" all mean the same thing, and the amount
        column already worked all four out the same way. This makes what is
        PRINTED agree with that arithmetic instead of printing whatever
        happened to be typed.
        """
        text = str(raw)
        # An unfilled share is "{{p1}}", and stripping it down to its digits
        # leaves a 1, which reads as 100%. On a job with a fee and no split
        # that made every stage cost the whole fee. A tag is not a number.
        if '{{' in text:
            return None
        digits = re.sub(r'[^0-9.]', '', text)
        try:
            n = float(digits)
        except ValueError:
            return None
        if n <= 0:
            return None
        return round(n if n > 1 else n * 100, 1)

    def _derive(self):
        """Work out what can be worked out, so no fact is typed twice.

        A fact stated in two places is a fact that will disagree with itself
        eventually. Where one value can be computed from another, set it to
        "auto" in the job and let it follow.
        """
        # The fee, grouped in threes. A six-figure number with no separators
        # is read wrong about as often as it is read right, and this one is
        # the number the client signs against. Typing 50000 prints 50,000.
        fee = str(self.fields.get('costnumber', '')).strip()
        if fee and not fee.startswith('{{') and _is_number(fee):
            head, _, frac = fee.replace(',', '').partition('.')
            self.fields['costnumber'] = f'{int(head):,}' + (('.' + frac) if frac else '')

        # Each stage's share carries its own sign, so the column reads as
        # percentages rather than as four bare numbers.
        #
        # The shares live on the payment rows now, and p1 to p4 follow
        # them. They are still the merge fields: the office tracker maps to
        # those names and tools/presend.py reads them, so a schedule edited
        # on the page has to reach them or the two would quietly disagree.
        # A default row's share IS "{{p1}}", so for an untouched job this
        # writes back exactly what it read, tidied. Rows past the fourth
        # have no field of their own; they are printed and totalled all the
        # same.
        for i, row in enumerate(self.payment_rows()[:4], start=1):
            k = f'p{i}'
            value = str(self.fill(row.get('pct') or ''))
            if '{{' in value:
                # Nothing has been said yet. The studio's own rows carry
                # "{{p1}}" as their share, so leaving the field exactly as
                # it is keeps the blank template round-tripping its own
                # tags; emptying it here made build.py warn that four
                # fields had no value.
                continue
            pct = self._percent(value)
            # The row is the truth. A share cleared on the page clears the
            # field with it, back to the tag, so the cell prints as a blank
            # rather than keeping a number nobody can see any more.
            self.fields[k] = f'{pct:g}%' if pct is not None else '{{%s}}' % k

        number = str(self.fields.get('costnumber', '')).strip()
        written = str(self.fields.get('costwritten', '')).strip()
        if _is_number(number) and written in self.AUTO + ('{{costwritten}}',):
            self.fields['costwritten'] = numwords.spell(number)

        # slide 4's one-line summary of the brief, from slide 5's floor list
        needs = str(self.fields.get('spatialneeds', '')).strip()
        if needs in self.AUTO:
            described = self._describe_floors()
            if described:
                self.fields['spatialneeds'] = described
            else:
                # the brief is not organised by storeys, so no sentence can be
                # counted off it. Leave the tag showing; presend will block.
                self.fields['spatialneeds'] = '{{spatialneeds}}'
                self.warnings.append(
                    'spatialneeds was set to "auto" but the brief on slide 5 '
                    'has no floors to count. Write the one-line summary by hand.')

    ARABIC_COUNTS = {1: 'دور واحد', 2: 'دورين', 3: 'ثلاثة أدوار',
                     4: 'أربعة أدوار', 5: 'خمسة أدوار', 6: 'ستة أدوار'}

    def _describe_floors(self):
        """"فيلا سكنية دورين وملحق علوي", counted off the brief on slide 5.

        Only meaningful when the brief is organised by storeys, which is the
        villa and apartment case. A fuel station's brief has a forecourt and
        a service building, and no sentence of this shape describes it, so
        this returns None and the field stays for a human to write.

        An annexe is counted apart from the storeys because that is how the
        phrase is built in Arabic, and because a client reads "two floors
        plus a roof annexe", not "three floors".
        """
        blocks = [b for g in (self.spatial().get('groups') or [])
                  for b in (g.get('blocks') or [])]
        storeys = [b for b in blocks
                   if any(w in b.get('name_ar', '') for w in ('دور', 'طابق', 'ملحق'))]
        if not storeys:
            return None
        annexes = [b for b in storeys if 'ملحق' in b.get('name_ar', '')]
        main = len(storeys) - len(annexes)
        parts = [str(self.fields.get('project_type_ar', '')).strip()]
        if main in self.ARABIC_COUNTS:
            parts.append(self.ARABIC_COUNTS[main])
        elif main:
            parts.append(f'{main} أدوار')
        if annexes:
            parts.append('وملحق علوي')
        return ' '.join(p for p in parts if p and not p.startswith('{{'))

    # ---- merge fields ----------------------------------------------------
    def fill(self, text):
        """Replace every {{tag}} with its value.

        A field left at its own tag string round-trips unchanged, so the
        default build reproduces the blank template exactly.
        """
        if not isinstance(text, str) or '{{' not in text:
            return text

        # A value the person marked تقريبي says so on the page, in a word
        # the client reads. Without it a stand-in is indistinguishable from
        # a fact three days later.
        #
        # The word goes at the END of the string, not beside the value
        # inside it. Land area is written "{{lotarea}} م² · حسب
        # {{areasource}}", and a mark planted where the tag sits reads
        # «512 تقريبًا م²», which is not a sentence in Arabic. At the end it
        # qualifies the whole statement, which is what an approximate figure
        # does anyway.
        approx = []

        def swap(m):
            name = m.group(1)
            if name in self.fields:
                value = str(self.fields[name])
                if value and not value.startswith('{{') \
                        and name in self.placeholders:
                    approx.append(name)
                return value
            self.unknown_tags.add(name)
            return m.group(0)

        out = TAG.sub(swap, text)
        return (out + ' ' + self.approx_word()) if approx else out

    def approx_word(self):
        """The word that follows a value marked تقريبي on the page."""
        return (self.content.get('marks') or {}).get('approx_ar', 'تقريبًا')

    def field(self, name):
        return self.fields.get(name, '{{%s}}' % name)

    def is_template(self):
        """True when no job was supplied, so tags are meant to stay visible."""
        return not self.data_path

    # ---- theme lookups ---------------------------------------------------
    def color(self, key):
        """Accept a theme key ('ink') or a literal '#RRGGBB'."""
        if key.startswith('#'):
            return key
        try:
            return self.theme['colors'][key]
        except KeyError:
            raise KeyError(f"theme.json has no colour named {key!r}")

    def font(self, alias):
        try:
            return self.theme['fonts'][alias]
        except KeyError:
            raise KeyError(f"theme.json has no font alias named {alias!r}")

    def size(self, name):
        return self.theme['type'][name]

    def geo(self, *path):
        node = self.theme
        for p in path:
            node = node[p]
        return node

    def asset(self, name):
        path = os.path.join(ROOT, 'assets', name)
        if not os.path.exists(path):
            raise FileNotFoundError(f"missing asset: {path}")
        return path

    # ---- content lookups -------------------------------------------------
    def c(self, *path, default=None):
        node = self.content
        for p in path:
            if isinstance(node, list):
                node = node[p]
            elif p in node:
                node = node[p]
            else:
                if default is not None:
                    return default
                raise KeyError('content.json is missing ' + '.'.join(str(x) for x in path))
        return node

    @property
    def sections(self):
        return self.content['sections']

    def section_index(self, key):
        """1-based position of a section, used by the side rail."""
        for i, s in enumerate(self.sections, start=1):
            if s['key'] == key:
                return i
        raise KeyError(f"content.json sections has no key {key!r}")

    # ---- per-job blocks --------------------------------------------------
    def spatial(self):
        """The room schedule on slide 5. Every villa is different, so a job
        overrides the whole block; the labels around it stay boilerplate."""
        block = dict(self.content['spatial'])
        block.update(self.job.get('spatial') or {})
        return block

    def signatory(self):
        """Who signs this proposal.

        The name, the role, the office and the signature image are one
        record, so they cannot be changed apart. Swapping the signer used
        to mean editing two places and hoping; get it wrong and one
        person's signature sits over another person's name.
        """
        block = self.content['signatories']
        sid = self.job.get('signatory') or block['default']
        if sid not in block or sid in ('_doc', 'default'):
            known = [k for k in block if k not in ('_doc', 'default')]
            raise KeyError(f"unknown signatory {sid!r}. Known: {', '.join(known)}")
        return block[sid]

    def address(self, fmt):
        """The office address in one of the declared formats.

        It used to be two hand-written strings, one for the footer and one
        for the contact page, and they disagreed about the postcode. Parts
        plus a format template means there is one address.
        """
        co = self.content['company']
        parts = {k: v for k, v in co['address'].items() if not k.startswith('_')}
        return co['address_formats'][fmt].format(**parts)

    def payment_rows(self):
        """The rows of the payment schedule.

        A job that writes its own list replaces the studio's four entirely,
        and may hold any number of them. A job that says nothing gets the
        default, whose shares are the merge fields p1 to p4.
        """
        own = self.job.get('payments')
        if isinstance(own, list) and own:
            return own
        return self.c('financial', 'payments')

    def trigger(self, row):
        """The word in front of a payment's event, and whether it leads the
        sentence under the heading as well.

        قبل and بعد are prepositions, so they read the same in both. دفعة
        مقدمة names the payment instead, and leading the sentence with it
        made it say دفعة twice. It heads the row and stays out of the
        sentence. A word the person typed is a preposition like عند, so it
        leads.
        """
        words = self.c('financial', 'triggers')
        if row.get('when') == 'custom':
            return {'ar': str(row.get('when_ar') or '').strip(),
                    'in_body': True}
        w = words.get(row.get('when')) or {}
        return {'ar': str(w.get('ar') or '').strip(),
                'in_body': w.get('in_body') is not False}

    def payments(self):
        """The payment schedule, with the riyal amount worked out.

        A payment is three parts: the trigger word, the event, and the
        share. Everything a client reads on that row is built from those
        three, so a payment cannot say one thing in its heading and another
        underneath.

        A client reading "30%" has to multiply to learn what the stage
        costs. Both numbers are already here, so the deck does the sum.
        Where the fee is not a number yet there is no amount to state, and
        the sentence says the share instead.
        """
        fi = self.c('financial')
        fee = str(self.fields.get('costnumber', '')).replace(',', '').strip()
        total = float(fee) if _is_number(fee) else None
        out = []
        for i, row in enumerate(self.payment_rows(), start=1):
            share = self._percent(self.fill(row['pct']))
            amount = f'{total * share / 100:,.2f}' if (total and share) else None
            when = self.trigger(row)
            event = str(self.fill(row.get('event_ar') or '')).strip()
            head = ' '.join(p for p in (when['ar'], event) if p)
            lead = head if when['in_body'] else event
            pct = f'{share:g}%' if share is not None else str(self.fill(row['pct']))
            if amount:
                body = (fi['due_ar'].replace('{when}', lead)
                        .replace('{amount}', amount + ' ' + fi['amount_unit_ar']))
            else:
                body = (fi['due_pct_ar'].replace('{when}', lead)
                        .replace('{pct}', pct))
            out.append({'no': f'{i}.', 'title_ar': head + '.', 'pct': pct,
                        'amount': amount, 'body_ar': [body.strip()],
                        'share': share, 'when': when['ar'], 'event_ar': event})
        return out

    def payment_totals(self):
        """The four shares added up, printed under them.

        A payment schedule that does not reach the whole fee is the kind of
        error that costs a signature, so the deck shows the sum instead of
        asking the client to trust it.
        """
        pays = self.payments()
        pcts, amounts = [], []
        for p in pays:
            if p['share'] is not None:
                pcts.append(p['share'])
            if p['amount']:
                amounts.append(float(p['amount'].replace(',', '')))
        return {
            'pct': f'{sum(pcts):.0f}%' if len(pcts) == len(pays) else '',
            'amount': (f'{sum(amounts):,.2f}'
                       if pays and len(amounts) == len(pays) else None),
        }

    def phases(self):
        """The phases this proposal actually has.

        A phase with `requires` names a service; if that service is not
        sold, the phase is dropped along with its continuation rows. That
        is what stops the deliverables table promising a study the client
        is not paying for, which is what the original did with the
        highest-and-best-use research on phase one.
        """
        sold = {s['id'] for s in self.services() if s['included']}
        # a job sets its own days: {"durations": {"technical": 90}}
        overrides = self.job.get('durations') or {}
        rows, keep = [], True
        for row in self.content['phases']['rows']:
            if row['no'] is not None:
                need = row.get('requires')
                keep = (need is None) or (need in sold)
            if keep:
                row = dict(row)
                if row.get('id') in overrides:
                    row['duration_days'] = overrides[row['id']]
                rows.append(row)
        # renumber so the client never sees 1, 3, 4 after a phase drops out.
        # The trailing ". " matters: without it the cell reads "1CD".
        n = 0
        for row in rows:
            if row['no'] is not None:
                n += 1
                row['no'] = f'{n}. '
        return rows

    def timeline_plan(self):
        """Where every phase sits on the chart, worked out from its duration.

        The chart used to be drawn by hand: each bar had its own start and
        end in weeks, kept nowhere near the duration printed beside it in
        the table. Two of the five disagreed, one of them by six days, and
        nothing could notice. Now the bar length *is* the duration.

        A phase lasts the sum of the days on its own row and its
        continuation rows, so CD is 7 + 21 = 28. It starts when the phase
        named in `after` ends, minus `overlap_days` for work that begins
        before its predecessor finishes.

        Returns one entry per phase plus the number of weeks the grid needs
        to hold them, so a longer project widens the chart instead of
        drawing a bar off the edge of the page.
        """
        rows = self.phases()
        lanes, ends, cursor = [], {}, 0.0
        current = None
        for row in rows:
            if row['no'] is not None:
                current = {
                    'id': row.get('id'),
                    'code': (row.get('code') or '').strip(),
                    'name_ar': row.get('name_ar'),
                    'days': row.get('duration_days') or 0,
                    'schedule': row.get('schedule') or {},
                }
                lanes.append(current)
            elif current is not None:
                current['days'] += row.get('duration_days') or 0

        # A phase a job pins by hand starts on the day it was given,
        # whatever the after/overlap rules would have worked out.
        # Everything downstream still follows, because a dependent phase
        # reads the pinned phase's END day the same way it read a
        # calculated one. So one phase can be moved to the day the client
        # was promised without the rest being retyped.
        pinned = self.job.get('starts') or {}
        for lane in lanes:
            sched = lane['schedule']
            after = sched.get('after')
            base = ends.get(after, cursor) if after else 0.0
            own = pinned.get(lane['id'])
            if isinstance(own, (int, float)):
                start = max(0.0, float(own))
            else:
                start = max(0.0, base - (sched.get('overlap_days') or 0))
            lane['pinned'] = isinstance(own, (int, float))
            lane['start_day'] = start
            lane['end_day'] = start + lane['days']
            lane['parallel'] = bool(sched.get('parallel'))
            # A job may set its own marks on a lane. Which milestones a
            # client sees is a project decision, not a house rule: a job
            # with no municipal step has no approval triangle to draw. The
            # browser has honoured this key since the twin was written and
            # this did not, so a marker taken off a lane on screen was
            # still drawn in the PowerPoint.
            #
            # Only a list counts as an answer. An empty one is an answer
            # and means the lane carries nothing; anything else, including
            # a null left behind by hand, falls back to content.json.
            own = (self.job.get('markers') or {}).get(lane['id'])
            lane['markers'] = own if isinstance(own, list) else (sched.get('markers') or [])
            ends[lane['code']] = lane['end_day']
            cursor = max(cursor, lane['end_day'])

        weeks_needed = max(1, math.ceil(cursor / 7.0)) if cursor else 1
        per_month = self.c('timeline', 'gantt')['weeks_per_month']
        # The grid is as wide as the work needs, unless the job says
        # otherwise. `timeline_weeks` is the stepper on the panel, and the
        # browser has honoured it since the twin was written. This did not,
        # so a chart set to thirteen weeks on screen was built as sixteen
        # and the two files disagreed about the same proposal.
        fitted = max(1, math.ceil(weeks_needed / per_month)) * per_month
        try:
            asked = int(self.job.get('timeline_weeks'))
        except (TypeError, ValueError):
            asked = 0
        # Never narrower than the work. A hand written job could ask for
        # four weeks of grid to hold eighty days and the bars would run off
        # the right of the page.
        weeks = max(weeks_needed, asked) if asked > 0 else fitted
        months = max(1, math.ceil(weeks / per_month))
        return {'lanes': lanes, 'total_days': cursor,
                'weeks': weeks, 'months': months,
                'weeks_needed': weeks_needed, 'fitted_weeks': fitted}

    def phase_codes(self):
        """Legend entries for the codes actually on the page, in first use
        order. A legend naming a phase the deck does not contain, as the
        original did with Bidding Management, invites a question nobody
        wants asked."""
        labels = self.content['phases']['codes']
        seen = []
        for row in self.phases():
            code = (row.get('code') or '').strip()
            if code and code not in seen:
                seen.append(code)
        return [(c, labels[c]) for c in seen if c in labels]

    def services(self):
        """The eleven services with an `included` flag resolved for this job.

        A job says which ids it sells: ["concept", "engineering", "permit"].
        Saying nothing keeps the defaults in content.json, which is what the
        blank template wants."""
        items = [dict(s) for s in self.content['services']['items']]
        sold = self.job.get('services')
        if sold is not None:
            known = {s['id'] for s in items}
            for sid in sold:
                if sid not in known:
                    raise KeyError(
                        f"job lists an unknown service id {sid!r}. "
                        f"Known ids: {', '.join(sorted(known))}")
            for s in items:
                s['included'] = s['id'] in sold
        return items


def _is_number(s):
    try:
        float(str(s).replace(',', ''))
        return True
    except ValueError:
        return False


def _load(path):
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)
