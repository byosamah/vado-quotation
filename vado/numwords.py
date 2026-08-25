"""Write a number in Arabic words.

A port of the SpellNumberArabic macro from the old Excel form, so the price
on slide 12 no longer needs Excel to produce it.

    >>> spell(1534)
    'ألف و خمسمائة و أربعة و ثلاثون'

Two deliberate departures from the VBA:

* The VBA has no branch for billions, so a number over a billion came out
  with its unit missing. مليار is added here.
* The VBA relied on Excel to strip a trailing "و". That is done directly.

Anything after the decimal point is dropped, as in the original: the deck
quotes whole riyals.
"""
from __future__ import annotations

WA = ' و '

ONES = ['واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة']
TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
         'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']
TENS = ['', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']
HUNDREDS_STEM = ['', '', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثمان', 'تسع']

UNITS = {
    'thousand': ('ألف', 'ألفان', 'آلاف'),
    'million': ('مليون', 'مليونان', 'ملايين'),
    'billion': ('مليار', 'ملياران', 'مليارات'),
}


def spell(value) -> str:
    """The whole part of `value`, in Arabic words."""
    n = int(float(str(value).replace(',', '').strip()))
    if n == 0:
        return 'صفر'
    if n < 0:
        return 'سالب ' + spell(-n)
    return _collapse(_groups(n))


def _groups(n: int) -> str:
    billions, rest = divmod(n, 1_000_000_000)
    millions, rest = divmod(rest, 1_000_000)
    thousands, remainder = divmod(rest, 1_000)

    parts = []
    if billions:
        parts.append(_scaled(billions, 'billion'))
    if millions:
        parts.append(_scaled(millions, 'million'))
    if thousands:
        parts.append(_scaled(thousands, 'thousand'))
    if remainder:
        parts.append(_under_thousand(remainder))
    return WA.join(parts)


def _scaled(n: int, unit: str) -> str:
    """Arabic counts its units three ways: one, two, and many."""
    single, dual, plural = UNITS[unit]
    if n == 1:
        return single
    if n == 2:
        return dual
    if 3 <= n <= 10:
        return f'{_under_thousand(n)} {plural}'
    return f'{_under_thousand(n)} {single}'


def _under_thousand(n: int) -> str:
    hundreds, rest = divmod(n, 100)
    tens, units = divmod(rest, 10)

    parts = []
    if hundreds == 1:
        parts.append('مائة')
    elif hundreds == 2:
        parts.append('مائتان')
    elif hundreds >= 3:
        parts.append(HUNDREDS_STEM[hundreds - 1] + 'مائة')

    if tens == 0 and units > 0:
        parts.append(ONES[units - 1])
    elif tens == 1:
        parts.append(TEENS[units])
    elif tens > 1:
        # Arabic says the unit before the ten: four and thirty
        if units > 0:
            parts.append(ONES[units - 1])
        parts.append(TENS[tens - 1])

    return WA.join(parts)


def _collapse(s: str) -> str:
    s = ' '.join(s.split())
    while s.endswith('و'):
        s = s[:-1].rstrip()
    return s


if __name__ == '__main__':
    for n in (0, 1, 2, 7, 11, 20, 34, 100, 200, 534, 1000, 1534, 2000, 15000,
              125000, 1000000, 2500000, 1234567):
        print(f'{n:>10,}  {spell(n)}')
