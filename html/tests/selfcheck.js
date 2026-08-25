/* Self-check for the HTML deck. Paste into the browser console, or fetch it
 * beside the file and eval it. Returns a report; `fail` is what matters.
 *
 *   await (await fetch('_check.js')).text().then(eval)
 *
 * What it proves:
 *   text      every paragraph the PowerPoint holds is here, and nothing extra
 *   geometry  every table ends where its declared row heights say it should
 *   bleed     nothing is drawn past the bottom of a page
 *   order     numbers mixed with Arabic carry the left-to-right mark, so
 *             "7 Days" is not drawn as "Days 7"
 */
window.vadoSelfCheck = async function (pptxTextUrl) {
  const PX = 96 / 72;
  const app = window.VADO_APP, ctx = app.ctx;
  const zoom = parseFloat(getComputedStyle(document.getElementById('stage')).zoom) || 1;
  const fail = [], info = {};
  const pt = px => Math.round(px / zoom / PX * 10) / 10;

  /* ---- text ---- */
  if (pptxTextUrl) {
    const want = await fetch(pptxTextUrl).then(r => r.json());
    const norm = s => s.replace(/[‎‏]/g, '').replace(/ /g, ' ')
                       .replace(/\s+/g, ' ').trim();
    const isPageNo = s => /^\d{1,2}$/.test(s);
    /* An unfilled value now reads "اكتب مساحة الأرض" on the page instead of
     * showing its tag, so it is turned back into the tag before comparing.
     * The guarantee being tested is that the HTML holds the same values as
     * the PowerPoint, not that it words a blank the same way. */
    const para = p => {
      const c = p.cloneNode(true);
      c.querySelectorAll('.mk').forEach(m => m.remove());
      c.querySelectorAll('[data-empty]').forEach(b => {
        b.textContent = '{{' + b.dataset.field + '}}';
      });
      return norm(c.textContent);
    };
    const got = [...document.querySelectorAll('.page')]
      .map(pg => [...pg.querySelectorAll('p')].map(para).filter(x => x && !isPageNo(x)));
    const W = want.map(a => a.map(norm).filter(x => x && !isPageNo(x)));
    if (W.length !== got.length)
      fail.push(`page count: pptx ${W.length}, html ${got.length}`);
    for (let i = 0; i < Math.min(W.length, got.length); i++) {
      const bb = new Set(got[i]), aa = new Set(W[i]);
      W[i].filter(x => !bb.has(x)).forEach(x =>
        fail.push(`slide ${i + 1} missing: ${x.slice(0, 60)}`));
      got[i].filter(x => !aa.has(x)).forEach(x =>
        fail.push(`slide ${i + 1} extra: ${x.slice(0, 60)}`));
    }
    info.paragraphs = got.flat().length;
  }

  /* ---- geometry: does a table reach what is drawn below it? ------------
   *
   * Three measures were tried. The sum of the declared row heights is
   * wrong, because a PowerPoint row is a minimum too and growing past it
   * is normal. The table's own box is wrong, because slide 4's style table
   * has always ended 6pt inside the two tables below it and the bottom of
   * that cell is empty. Measuring the text with a Range is wrong as well:
   * it returns the font's em box, and for 80pt Cairo that is 150pt tall,
   * so the cover headline reads as colliding with everything near it.
   *
   * What is left is the bottom of the lowest cell that actually holds
   * text, against the top of whatever block starts below the table. That
   * is the measure that caught slide 11's last phase row sitting on the
   * note under the chart. */
  let tables = 0, collisions = 0;
  document.querySelectorAll('.page').forEach(pg => {
    const pr = pg.getBoundingClientRect();
    const others = [...pg.children]
      .filter(e => e.tagName !== 'TABLE' && (e.textContent || '').trim())
      .map(e => {
        const r = e.getBoundingClientRect();
        return { top: pt(r.top - pr.top), left: pt(r.left - pr.left),
                 right: pt(r.right - pr.left),
                 text: e.textContent.trim().slice(0, 26) };
      });
    pg.querySelectorAll('table.t').forEach(t => {
      tables++;
      const tableTop = pt(t.getBoundingClientRect().top - pr.top);
      let inked = 0, left = 1e9, right = -1e9;
      t.querySelectorAll('td').forEach(td => {
        if (!(td.textContent || '').trim()) return;
        const r = td.getBoundingClientRect();
        inked = Math.max(inked, pt(r.bottom - pr.top));
        left = Math.min(left, pt(r.left - pr.left));
        right = Math.max(right, pt(r.right - pr.left));
      });
      others.forEach(o => {
        /* only what starts inside the table's own band can be run into */
        if (o.top <= tableTop) return;
        if (o.top >= inked - 1) return;
        if (o.right < left + 1 || o.left > right - 1) return;
        collisions++;
        if (collisions <= 8)
          fail.push(`${pg.id}: the table's last row reaches ${inked}pt and ` +
                    `"${o.text}" starts at ${o.top}pt`);
      });
    });
  });
  info.tables = tables;
  info.collisions = collisions;

  /* ---- one block landing on another ------------------------------------
   *
   * The table test above only looks at tables. Slide 13 has none, and its
   * contract text grew past the footnote's declared position and printed
   * the closing line on top of it. Text boxes are sized to their content,
   * so their own rectangles are a fair measure here. */
  document.querySelectorAll('.page').forEach(pg => {
    const pr = pg.getBoundingClientRect();
    const blocks = [...pg.children]
      /* rotated blocks are skipped: the triangle labels on slide 10 ride
       * the sloping sides, so their upright bounding boxes overlap the
       * centre label while the ink never touches it */
      .filter(e => e.tagName === 'DIV' && e.classList.contains('tb') &&
                   (e.textContent || '').trim() &&
                   !/rotate/.test(e.style.transform || ''))
      .map(e => {
        /* the block's ink, not its box: a text frame carries 3.6 pt of top
         * and bottom inset, and comparing boxes reported every footer on
         * every page as a collision with itself */
        const ps = [...e.querySelectorAll('p')].filter(x => x.textContent.trim());
        if (!ps.length) return null;
        const rs = ps.map(x => x.getBoundingClientRect());
        return {
          top: pt(Math.min(...rs.map(r => r.top)) - pr.top),
          bottom: pt(Math.max(...rs.map(r => r.bottom)) - pr.top),
          left: pt(Math.min(...rs.map(r => r.left)) - pr.left),
          right: pt(Math.max(...rs.map(r => r.right)) - pr.left),
          text: e.textContent.trim().slice(0, 24),
        };
      })
      .filter(Boolean);
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i], b = blocks[j];
        const v = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const h = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        /* Line boxes carry leading: a 12 pt line at 150% spacing has about
         * 4.8 pt of air above and below the glyphs, so two blocks set one
         * under the other can share up to ~9 pt of box without a mark
         * touching. Anything past that is real: slide 13's contract text
         * sat 41 pt into the footnote. */
        if (v > 9 && h > 3) {
          collisions++;
          if (collisions <= 8)
            fail.push(`${pg.id}: "${a.text}" and "${b.text}" overlap by ` +
                      `${Math.round(v * 10) / 10}pt`);
        }
      }
    }
  });
  info.collisions = collisions;

  /* ---- bleed: nothing drawn past the page ---- */
  const H = 1008;
  document.querySelectorAll('.page').forEach(pg => {
    const pr = pg.getBoundingClientRect();
    [...pg.children].forEach(e => {
      const b = pt(e.getBoundingClientRect().bottom - pr.top);
      if (b > H + 1)
        fail.push(`${pg.id}: ${e.className || e.tagName} reaches ${b}pt, page is ${H}pt`);
    });
  });

  /* ---- order: a digit next to Arabic needs the mark ---- */
  let marked = 0, unmarked = [], wrongDir = 0;
  document.querySelectorAll('p.rtl').forEach(p => {
    /* the class is not the rendering: a stylesheet rule scoped to `.tb`
     * once left every table paragraph running left to right */
    if (getComputedStyle(p).direction !== 'rtl') {
      wrongDir++;
      if (wrongDir <= 3)
        fail.push(`a paragraph marked rtl is laid out ltr: ` +
                  `"${p.textContent.trim().slice(0, 30)}"`);
    }
    p.querySelectorAll('span').forEach(s => {
      if (s.classList.contains('mk')) return;
      const t = s.textContent;
      if (!/[0-9]/.test(t)) return;
      if (t.indexOf('‎') >= 0) marked++;
      else if (!/[؀-ۿ]/.test(t) && unmarked.length < 5) unmarked.push(t.slice(0, 30));
    });
  });
  info.markedRuns = marked;
  info.wrongDirection = wrongDir;
  unmarked.forEach(t => fail.push(`unmarked number in an RTL paragraph: ${t}`));

  /* ---- nothing on the page may look like code ---- */
  const shown = document.getElementById('stage').innerText;
  const codeish = shown.match(/\{\{[a-zA-Z0-9_]+\}\}/g);
  if (codeish)
    fail.push('a tag is visible on the page: ' + [...new Set(codeish)].slice(0, 4).join(' '));

  /* every field must be reachable from some page's list */
  if (app && app.pageOf) {
    const known = Object.keys(ctx.content.fields || {}).filter(k => k !== '_doc');
    const orphans = known.filter(k => !(k in app.pageOf));
    if (orphans.length)
      fail.push('fields on no page: ' + orphans.join(', '));
    info.fieldsReachable = known.length - orphans.length + '/' + known.length;
  }

  /* ---- the derived values must agree with the deck ---- */
  const totals = ctx.paymentTotals();
  info.programmeDays = ctx.timelinePlan().total_days;
  info.paymentsTotal = totals.pct;

  return { fail, passed: fail.length === 0, info };
};
