/* Drawing primitives, mirroring vado/deck.py one call at a time.
 *
 * The Python measures everything in points from the top-left of the A3
 * page. CSS understands pt, so every number ported from a slide module is
 * used exactly as written. That is the reason this file is short: there is
 * no coordinate system to reconcile.
 */
'use strict';

const V = {};                       // the whole namespace

V.el = function (tag, cls, css) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (css) Object.assign(e.style, css);
  return e;
};

V.pt = v => (Math.round(v * 1000) / 1000) + 'pt';

V.box = function (page, x, y, w, h, cls, css) {
  const e = V.el('div', cls, Object.assign(
    { left: V.pt(x), top: V.pt(y), width: V.pt(w), height: V.pt(h) }, css || {}));
  page.appendChild(e);
  return e;
};

/* ---- alignment maps, same keys the Python uses ---------------------- */

V.ALIGN = { l: 'al-l', r: 'al-r', c: 'al-c', ctr: 'al-c', just: 'al-just' };
V.ANCHOR = { t: 'a-t', ctr: 'a-ctr', b: 'a-b' };

V.LEVEL_STEP = 36;   /* PowerPoint's default list indent, 0.5 inch a level */

/* The natural line height of each font alias, as a multiple of the em,
 * measured from the font files at build time. PowerPoint's line spacing is
 * a percentage of this, so `ls: 1.5` on Cairo is 1.5 x 1.874 and on
 * GE SS Text is 1.5 x 1.245. They are not the same number, which is why a
 * single constant could not work for both. */
V.lineHeight = alias => (window.VADO.lineHeights || {})[alias] || 1.2;

/* What a field is called on the document it is copied from, in Arabic.
 * Parsed at build time out of the skill's fields.md, so the deck and the
 * skill cannot disagree about what a value is called. */
V.label = name => (window.VADO.labels || {})[name] ||
                  { ar: name, source: '', example: '', balady: false };

/* ---- text ----------------------------------------------------------- */

/* One paragraph's worth of runs. A run is the same dict the Python takes:
 *   {t, f (theme alias), sz, b, i, c (colour key or #hex), spc, u}
 * Colour and font alias resolve against the theme, so a change in
 * theme.json moves the HTML and the PowerPoint together.
 */
/* ---- script boundaries, ported from deck.split_scripts ------------- */

const ARABIC_RANGES = [[0x0600,0x06FF],[0x0750,0x077F],[0x08A0,0x08FF],
                       [0xFB50,0xFDFF],[0xFE70,0xFEFF]];
const NEUTRAL = new Set(Array.from('\u00a0 \t .,:;|()[]{}/-\u2013\u2014+*&%#@!?"\'\u060c\u061b\u061f\u2018\u2019\u201c\u201d'));
V.LRM = '\u200e';

V.isArabic = ch => {
  const o = ch.codePointAt(0);
  return ARABIC_RANGES.some(([lo, hi]) => o >= lo && o <= hi);
};

/* Break text at script boundaries. Spaces and punctuation belong to
 * nobody, so they follow their Arabic neighbour: that keeps the gap in
 * "14 يوم" on the Arabic side of the boundary, where the layout engine
 * will not swallow it. */
V.splitScripts = function (text) {
  if (!text) return [[text, false]];
  const segs = [];
  for (const ch of text) {
    const cls = V.isArabic(ch) ? 'ar' : (NEUTRAL.has(ch) ? 'sp' : 'lat');
    if (segs.length && segs[segs.length - 1][0] === cls) segs[segs.length - 1][1] += ch;
    else segs.push([cls, ch]);
  }
  const merged = [];
  segs.forEach(([cls, txt], i) => {
    if (cls !== 'sp') { merged.push([cls, txt]); return; }
    const before = merged.length ? merged[merged.length - 1][0] : null;
    let after = null;
    for (let j = i + 1; j < segs.length; j++)
      if (segs[j][0] !== 'sp') { after = segs[j][0]; break; }
    const target = (before === 'ar' || after === 'ar') ? 'ar'
                 : (before || after || 'lat');
    if (merged.length && target === before) merged[merged.length - 1][1] += txt;
    else merged.push([target, txt]);
  });
  const out = [];
  merged.forEach(([cls, txt]) => {
    if (out.length && out[out.length - 1][0] === cls) out[out.length - 1][1] += txt;
    else out.push([cls, txt]);
  });
  return out.map(([cls, txt]) => [txt, cls === 'ar']);
};

V.Text = class {
  constructor(ctx, host) { this.ctx = ctx; this.host = host; }

  para(runs, o) {
    o = o || {};
    const p = V.el('p');
    if (o.rtl) p.classList.add('rtl');
    p.classList.add(V.ALIGN[o.algn || (o.rtl ? 'r' : 'l')]);
    /* Set after the runs are known, because the multiple depends on which
     * font the paragraph is in. See below. */
    if (o.before != null) p.style.marginTop = V.pt(o.before);
    if (o.after != null) p.style.marginBottom = V.pt(o.after);

    /* Indentation. OOXML marL is the start margin, and in a right-to-left
     * paragraph the start is the right. Both the slide modules that indent
     * mean "in from where the text begins", so both map to the same side. */
    let pad = (o.level || 0) * V.LEVEL_STEP;
    if (o.margin_left != null) pad = o.margin_left;
    if (o.margin_right != null) pad = o.margin_right;
    if (pad) p.style.paddingInlineStart = V.pt(pad);

    if (o.bullet && o.bullet !== 'none') {
      p.classList.add('bul');
      if (o.indent != null) p.style.setProperty('--hang', V.pt(o.indent));
      const mk = V.el('span', 'mk');
      mk.textContent = o.bullet === '1.' || o.bullet === 'auto'
        ? (this._autonum = (this._autonum || 0) + 1) + '.' : o.bullet;
      if (o.indent != null) mk.style.width = V.pt(Math.abs(o.indent));
      p.appendChild(mk);
    }

    if (typeof runs === 'string') runs = [{ t: runs }];
    runs = runs || [];

    /* A paragraph's leading comes from the tallest run in it, the way
     * PowerPoint works it out. `line-height: 1.5` is a multiple, so it
     * needs the right thing to multiply: without this it multiplied the
     * page's inherited 18 pt and gave the 7 pt footer address 27 pt lines,
     * which pushed it 35 pt off the bottom of every page. A paragraph
     * where no run states a size keeps the 18 pt default, which is what
     * the cover's project block and the contents list rely on. */
    const sizes = runs.map(r => r && r.sz).filter(Boolean);
    if (sizes.length) p.style.fontSize = V.pt(Math.max.apply(null, sizes));

    /* A paragraph with no `ls` keeps `normal`, which is already the font's
     * own line height and is what PowerPoint's 100% means. With an `ls`,
     * the multiple applies to that same natural height, so it has to be
     * looked up from the paragraph's own face. */
    /* The paragraph carries the face as well as the runs. A line box is the
     * union of the strut, which comes from the BLOCK's font, and the inline
     * boxes, which come from the runs'. Leave the block on the page's
     * default and an Arabic line is measured against Cairo's taller content
     * area, so it ends up 2 px more than its own line-height. Eight of
     * those stacked put the contents numbers a whole row above their names.
     */
    const alias = (runs.find(r => r && r.f) || {}).f;
    if (alias) p.classList.add('f-' + alias);
    if (o.ls != null) {
      p.style.lineHeight =
        Math.round(o.ls * V.lineHeight(alias) * 1000) / 1000;
    }

    runs.forEach(spec => p.appendChild(this.run(spec)));
    if (!p.textContent) p.appendChild(document.createTextNode(' '));
    this.host.appendChild(p);
    return p;
  }

  /* A run becomes one <span>, carrying the run's styling, with a child
   * span for every {{tag}} inside it.
   *
   * The children are what makes the page fillable. Most values do not sit
   * in a run of their own: the cover's addressee is one string holding
   * three tags, and slide 4's land area is "{{lotarea}} م² · حسب
   * {{areasource}}". Binding whole runs left those unreachable, so a deck
   * that was already filled in had almost nothing you could click.
   *
   * Each piece of text is split at script boundaries and a left-to-right
   * mark goes in front of any non-Arabic piece carrying digits, exactly as
   * deck.py does. Without it the bidi algorithm reads "7 Days" as a number
   * and a word with a right-to-left space between them and draws them in
   * that order, "Days 7". The same fault turned "1. CD" into "CD .1".
   */
  run(spec) {
    const s = V.el('span');
    const raw = spec.t == null ? '' : String(spec.t);

    if (spec.f) s.classList.add('f-' + spec.f);
    if (spec.sz) s.style.fontSize = V.pt(spec.sz);
    if (spec.b) s.style.fontWeight = 'bold';
    if (spec.i) s.style.fontStyle = 'italic';
    if (spec.c) s.style.color = this.ctx.color(spec.c);
    if (spec.spc != null) s.style.letterSpacing = V.pt(spec.spc);
    if (spec.u) s.style.textDecoration = 'underline';

    /* A left-to-right mark on BOTH sides of a digit-bearing piece. The
     * leading one makes the piece a left-to-right run so "7 Days" is not
     * drawn "Days 7". The trailing one holds any punctuation at the end of
     * the piece inside that run: without it the full stop in the phases
     * table's "1. " fell off the end and the cell read ".1". Two marks
     * cost nothing and the pair cannot be half-applied.
     *
     * This runs on any Latin piece, not only one carrying digits, because
     * a full stop at the end of an English sentence has exactly the same
     * problem: slide 9's "All Above Sectors bill of quantities and
     * specifications." was drawn with the full stop at the front of the
     * line. deck.py marks only the digit pieces, so the PowerPoint very
     * likely still shows that. Worth checking there. */
    const marked = text => {
      let out = '';
      V.splitScripts(text).forEach(([piece, arabic]) => {
        out += (!arabic && /[0-9A-Za-z]/.test(piece))
          ? V.LRM + piece + V.LRM : piece;
      });
      return out;
    };

    const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
    let last = 0, m;
    while ((m = re.exec(raw)) !== null) {
      if (m.index > last) s.appendChild(document.createTextNode(marked(raw.slice(last, m.index))));
      const name = m[1];
      const value = this.ctx.fill(m[0]);
      const child = V.el('span');
      const empty = value === m[0];

      /* An unfilled value says what belongs there, in Arabic, rather than
       * showing its tag. "{{lotarea}}" meant nothing to the person holding
       * the deed; "اكتب مساحة الأرض" tells them exactly what to type. The
       * field name is kept on the element so the checks, which compare this
       * page against the PowerPoint, can still read it. */
      child.dataset.field = name;
      if (empty) {
        child.dataset.empty = '1';
        child.classList.add('blank');
        /* The label alone, not "اكتب <label>". In the client block on the
         * cover these sit at 8 pt, and three prompts in a row ran together
         * into a grey smudge nobody could read. The dotted underline is
         * what says "not filled in"; the words only have to say which
         * value belongs here. */
        child.textContent = V.label(name).ar;
      } else {
        child.textContent = marked(value);
        if (this.ctx.estimates.indexOf(name) >= 0) child.classList.add('ph');
      }
      this.ctx.bindEditable(child, name);
      s.appendChild(child);
      last = m.index + m[0].length;
    }
    if (last < raw.length) s.appendChild(document.createTextNode(marked(raw.slice(last))));
    return s;
  }

  blank(n, o) {
    o = o || {};
    for (let i = 0; i < (n || 1); i++) {
      const p = this.para(o.sz ? [{ t: '', sz: o.sz, f: o.f }] : [], o);
      p.style.minHeight =
        V.pt((o.sz || 18) * (o.ls || 1) * V.lineHeight(o.f));
    }
  }
};

V.textbox = function (ctx, page, x, y, w, h, o) {
  o = o || {};
  const ins = o.insets || [7.2, 3.6, 7.2, 3.6];
  const e = V.box(page, x, y, w, h, 'tb ' + V.ANCHOR[o.anchor || 't'], {
    paddingLeft: V.pt(ins[0]), paddingTop: V.pt(ins[1]),
    paddingRight: V.pt(ins[2]), paddingBottom: V.pt(ins[3]),
  });
  if (o.wrap === false) e.classList.add('nowrap');
  /* spAutoFit: the box grows down rather than clipping. Height becomes a
   * floor, which is what PowerPoint does with an autofit text frame. */
  if (o.autofit) { e.style.height = 'auto'; e.style.minHeight = V.pt(h); }
  if (o.rotation) e.style.transform = 'rotate(' + o.rotation + 'deg)';
  return [e, new V.Text(ctx, e)];
};

/* ---- shapes --------------------------------------------------------- */

V.SHAPE_CLASS = { rect: '', triangle: 'tri', diamond: 'dia', circle: 'oval',
                  square: '' };

V.rect = function (ctx, page, x, y, w, h, o) {
  o = o || {};
  const css = {};
  if (o.fill) {
    css.background = ctx.color(o.fill);
    if (o.alpha != null) css.opacity = o.alpha;
  }
  if (o.line) {
    css.borderStyle = 'solid';
    css.borderWidth = V.pt(o.line_w == null ? 1 : o.line_w);
    css.borderColor = ctx.color(o.line);
  }
  if (o.rotation) css.transform = 'rotate(' + o.rotation + 'deg)';
  const cls = 'shape ' + (V.SHAPE_CLASS[o.shape || 'rect'] || '');
  /* An outlined triangle cannot be a clipped box with a border, and the
   * page carries a texture so an inner triangle cannot simply be painted
   * over. SVG strokes the outline directly and needs no trick. */
  if (o.line && o.shape === 'triangle') {
    const t = o.line_w == null ? 1 : o.line_w;
    const wrap = V.box(page, x, y, w, h, '');
    wrap.innerHTML =
      '<svg width="100%" height="100%" viewBox="0 0 ' + w + ' ' + h +
      '" preserveAspectRatio="none"><polygon points="' +
      (w / 2) + ',' + (t / 2) + ' ' + (w - t / 2) + ',' + (h - t / 2) + ' ' +
      (t / 2) + ',' + (h - t / 2) + '" fill="' +
      (o.fill ? ctx.color(o.fill) : 'none') + '" stroke="' + ctx.color(o.line) +
      '" stroke-width="' + t + '" vector-effect="non-scaling-stroke"/></svg>';
    return wrap;
  }
  return V.box(page, x, y, w, h, cls, css);
};

V._line = function (ctx, page, x, y, w, h, color, weight, dash) {
  const horiz = h === 0;
  const css = { color: ctx.color(color) };
  if (dash) {
    css.setProperty = null;
    const e = V.box(page, x, y - (horiz ? weight / 2 : 0), horiz ? w : weight,
                    horiz ? weight : h, 'rule dash', { color: ctx.color(color) });
    e.style.setProperty('--w', V.pt(weight));
    if (!horiz) {
      e.style.borderTop = 'none';
      e.style.borderLeftWidth = V.pt(weight);
      e.style.borderLeftStyle = 'dashed';
      e.style.borderLeftColor = 'currentColor';
      e.style.width = '0';
    }
    return e;
  }
  return V.box(page, horiz ? x : x - weight / 2, horiz ? y - weight / 2 : y,
               horiz ? w : weight, horiz ? weight : h, 'rule', css);
};

V.hline = (ctx, page, x, y, w, color, weight, dash) =>
  V._line(ctx, page, x, y, w, 0, color, weight == null ? 1 : weight, dash);

V.vline = (ctx, page, x, y, h, color, weight, dash) =>
  V._line(ctx, page, x, y, 0, h, color, weight == null ? 1 : weight, dash);

/* A right-pointing arrow: a stem plus a solid triangular head, matching the
 * connector with tailEnd="triangle" that the Python draws. */
V.arrow = function (ctx, page, x, y, w, color, weight, dash) {
  weight = weight == null ? 2.2 : weight;
  const head = Math.max(weight * 2.2, 3.4);
  const e = V.box(page, x, y - head, w, head * 2, 'arrow',
                  { color: ctx.color(color) });
  const stem = V.el('div', 'stem', {
    width: V.pt(Math.max(0, w - head * 1.6)), height: V.pt(weight),
    background: dash ? 'none' : 'currentColor',
  });
  if (dash) {
    stem.style.height = '0';
    stem.style.borderTop = V.pt(weight) + ' dashed currentColor';
  }
  e.appendChild(stem);
  const hd = V.el('div', 'head', {
    borderWidth: V.pt(head) + ' 0 ' + V.pt(head) + ' ' + V.pt(head * 1.7),
    borderLeftColor: 'currentColor',
  });
  e.appendChild(hd);
  return e;
};

V.picture = function (ctx, page, asset, x, y, w, h, o) {
  o = o || {};
  const src = ctx.asset(asset);
  if (o.crop) {
    const c = o.crop, cl = c.left || 0, ct = c.top || 0,
          cr = c.right || 0, cb = c.bottom || 0;
    const wrap = V.box(page, x, y, w, h, '', { overflow: 'hidden' });
    const img = V.el('img', 'pic', {
      position: 'absolute',
      width: V.pt(w / (1 - cl - cr)), height: V.pt(h / (1 - ct - cb)),
      left: V.pt(-cl * w / (1 - cl - cr)), top: V.pt(-ct * h / (1 - ct - cb)),
    });
    img.src = src;
    wrap.appendChild(img);
    return wrap;
  }
  const img = V.el('img', 'pic', {
    position: 'absolute',
    left: V.pt(x), top: V.pt(y), width: V.pt(w), height: V.pt(h),
  });
  img.src = src;
  /* `cover` crops the picture to the frame instead of squashing it. Use it
   * for anything a person supplies, which is never the shape of the box.
   * `position` chooses which part of it survives the crop. */
  if (o.cover) img.style.objectFit = o.fit || 'cover';
  if (o.position) img.style.objectPosition = o.position;
  if (o.transparency) img.style.opacity = 1 - o.transparency;
  if (o.rotation) img.style.transform = 'rotate(' + o.rotation + 'deg)';
  page.appendChild(img);
  return img;
};

/* ---- tables --------------------------------------------------------- */

/* Same surface as deck.Table: build it with column widths and row heights,
 * then style cells one call at a time. Merges are resolved at render time
 * so the calls can arrive in any order, as they do in the slide modules.
 */
V.Table = class {
  constructor(ctx, page, x, y, w, h, cols, rows, o) {
    o = o || {};
    this.ctx = ctx;
    this.cols = cols; this.rows = rows;
    this.nr = rows.length; this.nc = cols.length;
    this.cells = [];
    for (let r = 0; r < this.nr; r++) {
      const row = [];
      for (let c = 0; c < this.nc; c++) {
        row.push({ frag: document.createDocumentFragment(), css: {},
                   anchor: 'a-ctr', span: null, hidden: false });
      }
      this.cells.push(row);
    }
    this.tbl = V.el('table', 't', {
      left: V.pt(x), top: V.pt(y), width: V.pt(w),
      direction: o.rtl ? 'rtl' : 'ltr',
    });
    page.appendChild(this.tbl);
    this._built = false;
    /* Cells arrive after the constructor, so the rows cannot be built yet.
     * The deck flushes every table once all the slides have been drawn:
     * waiting for a microtask instead meant anything reading the finished
     * page, such as the list of fields on it, saw the tables empty. */
    (V.pendingTables || (V.pendingTables = [])).push(this);
  }

  cell(r, c) { return this.cells[r][c]; }

  text(r, c) {
    const cell = this.cells[r][c];
    const holder = V.el('div', 'cell');
    cell.frag.appendChild(holder);
    return new V.Text(this.ctx, holder);
  }

  fill(r, c, color, alpha) {
    const css = this.cells[r][c].css;
    const hex = this.ctx.color(color);
    css.background = alpha == null ? hex : this.ctx.rgba(hex, alpha);
  }

  border(r, c, sides, color, weight) {
    const css = this.cells[r][c].css;
    const hex = this.ctx.color(color || 'hairline');
    const w = V.pt(weight == null ? 1 : weight);
    (sides || 'TB').split('').forEach(s => {
      const side = { T: 'Top', B: 'Bottom', L: 'Left', R: 'Right' }[s];
      css['border' + side] = w + ' solid ' + hex;
    });
  }

  anchor(r, c, a) { this.cells[r][c].anchor = V.ANCHOR[a || 'ctr']; }

  margins(r, c, o) {
    o = o || {};
    const cell = this.cells[r][c];
    const l = o.l == null ? 5.4 : o.l, rr = o.rr == null ? 5.4 : o.rr;
    Object.assign(cell.css, {
      paddingInlineStart: V.pt(l), paddingInlineEnd: V.pt(rr),
      paddingTop: V.pt(o.t || 0), paddingBottom: V.pt(o.b || 0),
    });
    cell.anchor = V.ANCHOR[o.anchor || 'ctr'];
  }

  /* PowerPoint keeps the text of every cell a merge covers, so the covered
   * cells are recorded and their content is folded into the origin at
   * render time. Dropping them lost the "المرحلة" header on slide 9, where
   * the text is written into the covered cell and the origin is empty. */
  merge(r1, c1, r2, c2) {
    const origin = this.cells[r1][c1];
    origin.span = { rows: r2 - r1 + 1, cols: c2 - c1 + 1 };
    origin.covers = [];
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++)
        if (r !== r1 || c !== c1) {
          this.cells[r][c].hidden = true;
          origin.covers.push(this.cells[r][c]);
        }
  }

  render() {
    if (this._built) return;
    this._built = true;
    const cg = V.el('colgroup');
    this.cols.forEach(w => {
      const col = V.el('col'); col.style.width = V.pt(w); cg.appendChild(col);
    });
    this.tbl.appendChild(cg);
    const tb = V.el('tbody');
    for (let r = 0; r < this.nr; r++) {
      const tr = V.el('tr');
      tr.style.height = V.pt(this.rows[r]);
      for (let c = 0; c < this.nc; c++) {
        const cell = this.cells[r][c];
        if (cell.hidden) continue;
        const td = V.el('td', cell.anchor, cell.css);
        if (cell.span) {
          if (cell.span.rows > 1) td.rowSpan = cell.span.rows;
          if (cell.span.cols > 1) td.colSpan = cell.span.cols;
        }
        td.appendChild(cell.frag);
        (cell.covers || []).forEach(cov => td.appendChild(cov.frag));
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
    this.tbl.appendChild(tb);
  }
};
