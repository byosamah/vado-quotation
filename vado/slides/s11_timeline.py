"""Slide 11 - الخط الزمني للمشروع, the schedule and the Gantt chart.

Reads: content.timeline
Two halves:
  top     the same phase table as slide 9, cut down to phase, deliverable,
          duration
  bottom  a Gantt chart drawn from shapes. Every position is stated in
          weeks, so moving a phase is one number, not a drag.
"""
from pptx.enum.shapes import MSO_SHAPE

from .. import chrome
from ..deck import Table, arrow, rect, textbox, vline

TITLE = 'Project timeline'
SECTION = 'timeline'

COLS = [164.4, 210.4, 155.5]
TABLE_X, TABLE_Y, TABLE_W = 111.8, 230.2, 530.2
HEAD_H = 27.8
BULLET_NONE = 'none'
PHASE_ROW_MIN = 41.3       # two 11 pt lines; the value the original used
WEEK_LABEL_MIN_PT = 26.0   # below this a week cell is too narrow to label


def build(ctx, slide):
    tl = ctx.c('timeline')
    chrome.content_page(ctx, slide, title=ctx.c('sections', 4)['ar'], section=SECTION)

    _copy(ctx, slide, tl)
    _table(ctx, slide, tl)
    _gantt(ctx, slide, tl['gantt'])


def _copy(ctx, slide, tl):
    """Three labels at three fixed positions.

    They used to be one text box holding fourteen empty paragraphs to push
    the lower two down the page, which meant a font change moved both.
    """
    for key, y, size, bold in (('heading_ar', 188.3, 14, True),
                               ('note_ar', 570.0, 11, False),
                               ('footer_heading_ar', 605.0, 14, True)):
        _, t = textbox(ctx, slide, 104.9, y, 550.7, 26.0, autofit=True)
        t.para([{'t': tl[key], 'sz': size, 'b': bold, 'f': 'cairo', 'c': 'ink'}],
               algn='r', rtl=True, ls=1.5)


def _table(ctx, slide, tl):
    # the same phases slide 9 draws, so the two pages cannot disagree
    rows = ctx.phases()
    # A phase row holds the code and the phase name, two 11 pt lines with
    # space above each. Anything under PHASE_ROW_MIN and PowerPoint grows the
    # row anyway, pushing the last one past the bottom of the table.
    heights = [HEAD_H] + [
        max(r.get('h_timeline', r['h']), PHASE_ROW_MIN) if r['no'] is not None
        else r.get('h_timeline', r['h'])
        for r in rows]
    # the frame follows the rows, so the table cannot claim to be shorter
    # than it is and run its last row into the note below
    tbl = Table(ctx, slide, TABLE_X, TABLE_Y, TABLE_W, sum(heights),
                COLS, heights, rtl=True)

    for c, head in enumerate(tl['head_ar']):
        tbl.fill(0, c, 'sand')
        tbl.margins(0, c, anchor='ctr')
        tbl.text(0, c).para([{'t': head, 'sz': 14, 'f': 'ar_medium', 'c': 'ink'}],
                            algn='c', rtl=True, ls=1.0, before=12, margin_left=0)

    for i, row in enumerate(rows, start=1):
        for c in range(3):
            tbl.margins(i, c, anchor='ctr')
        if row['no'] is not None:
            tbl.fill(i, 0, 'sand', alpha=ctx.geo('table', 'sand_tint_alpha'))
            t = tbl.text(i, 0)
            t.para([{'t': row['no'], 'sz': 11, 'f': 'ar_medium', 'c': 'ink'},
                    {'t': row['code'], 'sz': 11, 'f': 'en_display', 'c': 'ink'}],
                   algn='c', rtl=True, ls=1.0, before=12, bullet=BULLET_NONE, margin_left=0)
            t.para([{'t': row['name_ar'], 'sz': 11, 'f': 'ar_medium', 'c': 'ink'}],
                   algn='c', rtl=True, ls=1.0, before=12, margin_left=0)

        t = tbl.text(i, 1)
        for line in row['deliverable_ar']:
            t.para([{'t': line, 'sz': 11, 'f': 'en', 'c': 'ink'}],
                   algn='c', rtl=True, ls=1.5, before=12)

        if row.get('duration_days'):
            tbl.text(i, 2).para([{'t': f"{row['duration_days']} Days",
                                  'sz': 11, 'f': 'en', 'c': 'ink'}],
                                algn='c', rtl=True, ls=1.5, before=12,
                                bullet=BULLET_NONE, margin_left=0)

    _merge_continuations(tbl, rows)


def _merge_continuations(tbl, rows):
    i = 0
    while i < len(rows):
        span = 1
        while i + span < len(rows) and rows[i + span]['no'] is None:
            span += 1
        if span > 1:
            top, bottom = i + 1, i + span
            tbl.merge(top, 0, bottom, 0)
            if rows[i].get('duration_span'):
                tbl.merge(top, 2, bottom, 2)
        i += span


# --------------------------------------------------------------------------
# Gantt
# --------------------------------------------------------------------------

def _gantt(ctx, slide, g):
    """Bars drawn from the durations, so the chart is a picture of the table.

    The grid is as wide as the work needs. A longer technical phase widens
    the chart rather than running a bar off the page.
    """
    t = ctx.geo('timeline')
    plan = ctx.timeline_plan()
    n_weeks = plan['weeks']
    # keep the whole grid inside the page however many weeks it holds
    span_pt = t['week_w'] * (len(g['months']) * g['weeks_per_month'])
    wk = span_pt / n_weeks
    x0 = t['x_start']
    bar_w = t['bar_w'] * wk / t['week_w']

    def wx(week):
        return x0 + week * wk

    def dx(day):
        return wx(day / 7.0)

    # month band
    span = g['weeks_per_month'] * wk - (wk - bar_w)
    for m in range(plan['months']):
        label = g['months'][m] if m < len(g['months']) else f'M{m + 1}'
        mx = wx(m * g['weeks_per_month'])
        rect(ctx, slide, mx, t['month_row_y'], span, t['bar_h'], fill='month_bar')
        _, tx = textbox(ctx, slide, mx + span / 2 - 18.0, t['month_row_y'] - 3.5,
                        36.0, 23.5, autofit=True)
        tx.para([{'t': label, 'sz': 9, 'spc': 3.0, 'f': 'en', 'c': 'white'}], algn='c')

    # week band. On a long programme the cells get narrow, and W1 W2 W3 W4
    # printed in a 15 pt cell is a smear. Past the threshold the cells still
    # draw, giving the eye a rhythm, but the labels come off and the months
    # carry the reading.
    label_weeks = wk >= WEEK_LABEL_MIN_PT
    for i in range(n_weeks):
        bx = wx(i)
        rect(ctx, slide, bx, t['week_row_y'], bar_w, t['bar_h'], fill='week_bar')
        if not label_weeks:
            continue
        _, tx = textbox(ctx, slide, bx + (bar_w - 36.0) / 2, t['week_row_y'] - 2.6,
                        36.0, 17.0, autofit=True)
        tx.para([{'t': g['week_labels'][i % g['weeks_per_month']], 'sz': 8, 'spc': 3.0,
                  'f': 'en', 'c': 'chart_ink'}], algn='c')

    lanes = plan['lanes']
    top, gap = t['lane_y'][0], t.get('lane_gap', 23.9)
    lane_y = [top + i * gap for i in range(len(lanes))]
    row_of = {}
    for i, lane in enumerate(lanes):
        row_of.setdefault(lane['code'], i)

    # dashed drops first, so the lane arrows sit above them
    for i, lane in enumerate(lanes):
        after = (lane['schedule'] or {}).get('after')
        if after is None or after not in row_of:
            continue
        _dashed(ctx, slide, dx(lane['start_day']), lane_y[row_of[after]],
                dx(lane['start_day']), lane_y[i])

    for i, lane in enumerate(lanes):
        y = lane_y[i]
        sx, ex = dx(lane['start_day']), dx(lane['end_day'])
        _, tx = textbox(ctx, slide, t['label_x'], y - 6.5, 35.3, 28.1, autofit=True)
        tx.para([{'t': lane['code'], 'sz': 10, 'b': True, 'spc': 3.0,
                  'f': 'en', 'c': 'chart_ink'}])
        if ex - sx < 1:
            continue                     # a phase with no days has no bar
        _draw_line(ctx, slide, 'parallel' if lane['parallel'] else 'progress',
                   sx + 6.6, y, ex - sx - 6.6)
        _marker(ctx, slide, 'phase_start', sx, y)
        for m in lane['markers']:
            day = lane['end_day'] if m.get('at') == 'end' \
                else lane['start_day'] + (m.get('at_day') or 0)
            _marker(ctx, slide, m['kind'], dx(day), y)

    _gantt_legend(ctx, slide, g['legend'])


def _dashed(ctx, slide, x1, y1, x2, y2):
    """The drop from one phase to the next it triggers."""
    from ..deck import _line
    st = ctx.geo('timeline', 'style', 'lines')['consequential']
    _line(ctx, slide, x1, y1, x2, y2, st['color'], st['weight'], st.get('dash'))


SHAPES = {'diamond': MSO_SHAPE.DIAMOND, 'circle': MSO_SHAPE.OVAL,
          'triangle': MSO_SHAPE.ISOSCELES_TRIANGLE, 'square': MSO_SHAPE.RECTANGLE}


def _marker(ctx, slide, kind, cx, cy, scale=1.0):
    """Draw one named mark. The definition lives in theme.timeline.style."""
    spec = ctx.geo('timeline', 'style', 'markers')[kind]
    w, h = spec['w'] * scale, spec['h'] * scale
    return rect(ctx, slide, cx, cy - h / 2, w, h,
                fill=spec['color'], shape=SHAPES[spec['shape']])


def _draw_line(ctx, slide, name, x, y, w):
    """Draw one named line style, including the second stroke that marks
    work running in parallel."""
    style = ctx.geo('timeline', 'style', 'lines')[name]
    if name == 'parallel':
        arrow(ctx, slide, x, y + style.get('offset', 0.8), w,
              style['color'], weight=style['weight'])
        return _draw_line(ctx, slide, 'progress', x, y, w)
    return arrow(ctx, slide, x, y, w, style['color'],
                 weight=style['weight'], dash=style.get('dash'))


LEGEND_MARKER_GAP = 18.4   # a marker is about 11 pt wide
LEGEND_ARROW_GAP = 63.7    # an arrow is 51.6 pt, so its label sits further out


def _gantt_legend(ctx, slide, legend):
    lines = ctx.geo('timeline', 'style', 'lines')
    col_x = {0: 133.7, 1: 298.8, 2: 488.1}
    row_y = [836.7, 858.4, 880.1]
    for e in legend:
        x, y = col_x[e['col']], row_y[e['row']]
        kind = e['kind']
        if kind in lines:
            _draw_line(ctx, slide, kind, x, y + 9.8, 51.6)
            label_x = x + LEGEND_ARROW_GAP
        else:
            _marker(ctx, slide, kind, x, y + 8.0,
                    scale=ctx.geo('timeline', 'style', 'legend_scale'))
            label_x = x + LEGEND_MARKER_GAP
        _, t = textbox(ctx, slide, label_x, y, 163.0, 14.0, autofit=True)
        t.para([{'t': e['label'], 'sz': 10, 'f': 'en', 'c': 'chart_ink'}])
