/* The fifteen slide renderers, ported from vado/slides/*.py.
 *
 * Every coordinate is the number the Python uses. Where a comment in the
 * Python explains why a number is what it is, the comment is carried over,
 * because that reasoning is the part that is expensive to rediscover.
 */
'use strict';

const INK = 'ink';

/* ---- page furniture, from vado/chrome.py ---------------------------- */

V.chrome = {
  logoBlock(ctx, page) {
    const g = ctx.geo('chrome', 'logo_mark');
    V.picture(ctx, page, 'logo-mark.png', g.x, g.y, g.w, g.h);
    const w = ctx.geo('chrome', 'logo_word');
    V.picture(ctx, page, 'logo-full.png', w.x, w.y, w.w, w.h, { crop: w.crop });
  },

  pageTitle(ctx, page, text) {
    const g = ctx.geo('chrome', 'title');
    const [, t] = V.textbox(ctx, page, g.x, g.y, g.w, g.h, { autofit: true });
    t.para([{ t: text, sz: ctx.size('page_title'), f: 'ar_medium', c: INK }],
           { algn: 'r', rtl: true, ls: 1.5 });
  },

  headerRule(ctx, page) {
    const g = ctx.geo('chrome', 'rule');
    V.hline(ctx, page, g.x, g.y, g.w, 'paper', g.weight);
    const c = g.cap;
    V.rect(ctx, page, c.x, c.y, c.w, c.h, { fill: 'paper' });
  },

  /* One square per section. Every square is drawn, so the rail reads as a
   * checklist of what the proposal contains and where you are in it. The
   * original painted three of eight, which made it look like an ornament. */
  sectionRail(ctx, page, current) {
    const g = ctx.geo('chrome', 'rail');
    for (let i = 1; i <= ctx.sections.length; i++) {
      const y = g.y_top + (i - 1) * (g.size + g.gap);
      V.rect(ctx, page, g.x, y, g.size, g.size,
             { fill: i === current ? g.current : g.color });
    }
  },

  footer(ctx, page, withPageNumber, pageNo) {
    const g = ctx.geo('chrome', 'footer');
    const co = ctx.c('company');
    const sz = ctx.size('footer'), small = ctx.size('footer_small');

    const r = g.rule;
    V.hline(ctx, page, r.x, r.y, r.w, 'ink', r.weight);

    const a = g.address;
    let [, t] = V.textbox(ctx, page, a.x, a.y, a.w, a.h, { autofit: true });
    t.para([{ t: co.office_ar, sz, f: 'ar_light', c: INK }],
           { algn: 'r', rtl: true, ls: 1.5, bullet: 'none', margin_left: 0, indent: 0 });
    t.para([{ t: ctx.address('footer_ar'), sz, f: 'ar_light', c: INK }],
           { algn: 'r', rtl: true, ls: 1.5, bullet: 'none', margin_left: 0, indent: 0 });

    const reg = g.registry;
    [, t] = V.textbox(ctx, page, reg.x, reg.y, reg.w, reg.h, { autofit: true });
    t.para([{ t: ' ' + co.cr_label_ar + ' ' + co.cr_number, sz: small,
              f: 'ar_light', c: INK, spc: 0.4 }], { algn: 'r', rtl: true, ls: 1.5 });
    t.para([{ t: co.chamber_label_ar + ' ' + co.chamber_number, sz: small,
              f: 'ar_light', c: INK, spc: 0.4 }], { algn: 'r', rtl: true, ls: 1.5 });

    const w = g.web;
    [, t] = V.textbox(ctx, page, w.x, w.y, w.w, w.h, { autofit: true });
    t.para([{ t: co.website, sz, f: 'cairo_semi', c: INK, b: true, spc: 0.4 }],
           { algn: 'r' });

    if (withPageNumber !== false) {
      const pn = g.page_number;
      const [, tn] = V.textbox(ctx, page, pn.x, pn.y, pn.w, pn.h, { wrap: false });
      tn.para([{ t: String(pageNo), sz: ctx.size('body'), f: 'en', c: INK }],
              { algn: 'c' });
    }
  },

  contentPage(ctx, page, title, section, pageNo) {
    V.chrome.logoBlock(ctx, page);
    V.chrome.headerRule(ctx, page);
    V.chrome.pageTitle(ctx, page, title);
    V.chrome.sectionRail(ctx, page, ctx.sectionIndex(section));
    V.chrome.footer(ctx, page, true, pageNo);
  },
};

/* ---- slide 1: cover -------------------------------------------------- */

V.slides = {};

V.slides.s01_cover = {
  title: 'Cover',
  build(ctx, page) {
    const g = ctx.geo('cover'), co = ctx.c('company'), cv = ctx.c('cover');

    let p = g.logo;
    V.picture(ctx, page, 'logo-full.png', p.x, p.y, p.w, p.h);

    let b = g.company_ar, t;
    [, t] = V.textbox(ctx, page, b.x, b.y, b.w, b.h, { autofit: true });
    t.para([{ t: co.name_ar, sz: 16, b: true, f: 'ar_light', c: INK }],
           { algn: 'r', rtl: true, ls: 1.5 });

    b = g.company_en;
    [, t] = V.textbox(ctx, page, b.x, b.y, b.w, b.h, { autofit: true });
    t.para([{ t: co.name_en, sz: 16, b: true, f: 'en', c: INK }],
           { algn: 'r', rtl: true });

    b = g.kicker;
    [, t] = V.textbox(ctx, page, b.x, b.y, b.w, b.h, { autofit: true });
    t.para([{ t: cv.kicker_ar, sz: 18, f: 'ar_light', c: INK }],
           { algn: 'r', rtl: true, ls: 1.5 });

    b = g.headline;
    [, t] = V.textbox(ctx, page, b.x, b.y, b.w, b.h, { autofit: true });
    const words = cv.headline_ar;
    const hs = { sz: b.size, b: true, spc: -1.5, f: 'cairo', c: 'maroon_deep' };
    t.para([Object.assign({}, hs, { t: words[0] }),
            Object.assign({}, hs, { t: ' ' }),
            Object.assign({}, hs, { t: words[1] })], { algn: 'r', rtl: true });

    b = g.subhead;
    [, t] = V.textbox(ctx, page, b.x, b.y, b.w, b.h, { autofit: true });
    t.para([{ t: cv.subhead_ar, sz: 28, spc: -1.5, f: 'ar_medium', c: INK }],
           { algn: 'r', rtl: true });

    b = g.project;
    [, t] = V.textbox(ctx, page, b.x, b.y, b.w, b.h, { autofit: true });
    t.para([{ t: 'تصميم ', f: 'ar_light', c: INK },
            { t: '{{project_type_ar}}', f: 'ar_light', c: INK }],
           { algn: 'r', rtl: true, ls: 1.5 });
    t.para([{ t: '{{city_ar}} | {{district_ar}}', f: 'ar_light', c: INK }],
           { algn: 'r', rtl: true, ls: 1.5 });

    const v = g.vrule;
    V.vline(ctx, page, v.x, v.y, v.h, INK, v.weight);
    const h = g.hrule;
    V.hline(ctx, page, h.x, h.y, h.w, 'muted', h.weight);

    b = g.english;
    [, t] = V.textbox(ctx, page, b.x, b.y, b.w, b.h, { autofit: true });
    [cv.english_line1,
     '{{name_title}} {{firstname}} {{lastname}} {{project_type}}',
     '{{city}} | {{district}}'].forEach(line => {
      t.para([{ t: line, sz: 12, spc: -0.7, f: 'en_light', c: INK }],
             { algn: 'r', ls: 1.5 });
    });

    this.metaTable(ctx, page, g.meta_table, cv.meta_rows);
    this.coverFooter(ctx, page, g.footer, co);
  },

  /* Value on the left, label on the right, no rules. The label can span
   * rows. rtl sets the base direction so "14 يوم" reads number-then-word
   * right to left; algn keeps the flush edge where the design has it. */
  metaTable(ctx, page, g, rows) {
    const heights = rows.map(() => g.row_h);
    const tbl = new V.Table(ctx, page, g.x, g.y, g.w, g.h, g.cols, heights);
    rows.forEach((row, i) => {
      tbl.anchor(i, 0); tbl.anchor(i, 1);
      tbl.text(i, 0).para(
        [{ t: row.value, sz: 8, spc: 0.4, f: 'cairo', c: INK }],
        { rtl: true, algn: 'l' });
      if (row.label_ar) {
        tbl.text(i, 1).para(
          [{ t: row.label_ar, sz: 9, b: true, spc: 0.4, f: 'cairo', c: INK }],
          { rtl: true, algn: 'l' });
      }
    });
    const span = rows[0].span || 1;
    if (span > 1) tbl.merge(0, 1, span - 1, 1);
  },

  coverFooter(ctx, page, g, co) {
    const sz = g.size;
    let b = g.address, t;
    [, t] = V.textbox(ctx, page, b.x, b.y, b.w, b.h, { autofit: true });
    t.para([{ t: co.office_ar, sz, f: 'ar_bold', c: INK }],
           { algn: 'r', rtl: true, ls: 1.5, bullet: 'none', margin_left: 0, indent: 0 });
    t.para([{ t: ctx.address('footer_ar'), sz, f: 'ar_light', c: INK }],
           { algn: 'r', rtl: true, ls: 1.5, bullet: 'none', margin_left: 0, indent: 0 });

    b = g.registry;
    [, t] = V.textbox(ctx, page, b.x, b.y, b.w, b.h, { autofit: true });
    t.para([{ t: ' ' + co.cr_label_ar + ' ' + co.cr_number, sz,
              f: 'ar_light', c: INK, spc: 0.4 }], { algn: 'r', rtl: true, ls: 1.5 });
    t.para([{ t: co.chamber_label_ar + ' ' + co.chamber_number, sz,
              f: 'ar_light', c: INK, spc: 0.4 }], { algn: 'r', rtl: true, ls: 1.5 });

    b = g.web;
    [, t] = V.textbox(ctx, page, b.x, b.y, b.w, b.h, { autofit: true });
    t.para([{ t: co.website_caps, sz, f: 'en_display', c: INK, spc: 0.4 }]);
  },
};

/* ---- slide 2: contents ---------------------------------------------- */

V.slides.s02_contents = {
  title: 'Contents',
  build(ctx, page, _p, pageNo) {
    const cn = ctx.c('contents');
    let t;
    [, t] = V.textbox(ctx, page, 255.5, 298.1, 408.3, 123.6, { autofit: true });
    t.para([{ t: cn.title_ar, sz: 96, b: true, spc: -1.5, f: 'ar_bold', c: 'maroon' }],
           { algn: 'r', rtl: true });

    [, t] = V.textbox(ctx, page, 367.9, 450.0, 180.3, 265.0, { autofit: true });
    ctx.sections.forEach(s => {
      t.para(this.split(s.ar, s.medium_words || 0), { algn: 'r', rtl: true, ls: 1.5 });
    });

    /* The numbers are a tint behind the list, not a second column of
     * information, so the colour lives in the theme. */
    const g = ctx.geo('contents');
    [, t] = V.textbox(ctx, page, 548.2, 450.0, 49.6, 265.4, { autofit: true });
    for (let i = 1; i <= ctx.sections.length; i++) {
      t.para([{ t: String(i).padStart(2, '0'), sz: g.number_size, f: 'en',
                c: g.number_color }], { algn: 'l', ls: 1.5 });
    }
    V.chrome.footer(ctx, page, true, pageNo);
  },

  /* The first N words are set in the medium weight, the rest in light. */
  split(name, mediumWords) {
    if (mediumWords <= 0)
      return [{ t: name, f: 'ar_light', c: 'ink_soft' }];
    const parts = name.split(' ');
    return [{ t: parts.slice(0, mediumWords).join(' '), f: 'ar_medium', c: 'ink_soft' },
            { t: ' ' + parts.slice(mediumWords).join(' '), f: 'ar_light', c: 'ink_soft' }];
  },
};

/* ---- slide 3: the covering letter ----------------------------------- */

V.slides.s03_intro = {
  title: 'Introduction',
  section: 'intro',
  SALUTATION_TAB: 300.0,
  build(ctx, page, _p, pageNo) {
    const it = ctx.c('intro');
    V.chrome.contentPage(ctx, page, ctx.c('sections', 0).ar, this.section, pageNo);

    let t;
    [, t] = V.textbox(ctx, page, 177.4, 188.3, 449.4, 341.7, { autofit: true });
    t.blank(2, { sz: 14, f: 'cairo', algn: 'just', rtl: true, ls: 1.5 });
    /* Addressee on the right, honorific held away from it by a declared
     * stop rather than literal tabs, which move when the name length or
     * the font changes. */
    /* A left tab stop puts what follows it AT 300 pt from the start edge,
     * which in Arabic is 300 pt in from the right. An inline spacer of that
     * width instead ADDS 300 pt after the name, which overflowed the box
     * and dropped "حفظه الله" onto its own line. Giving the name a box
     * exactly the width of the stop reproduces the tab. */
    const sal = t.para([], { algn: 'just', rtl: true, ls: 1.5 });
    const held = V.el('span');
    held.style.display = 'inline-block';
    held.style.width = V.pt(this.SALUTATION_TAB);
    held.appendChild(t.run({ t: it.salutation_ar, sz: 14, b: true,
                             f: 'cairo', c: INK }));
    sal.appendChild(held);
    sal.appendChild(document.createTextNode(' '));  /* so copied text breaks */
    sal.appendChild(t.run({ t: it.salutation_honorific_ar, sz: 14, b: true,
                            f: 'cairo', c: INK }));
    t.blank(1, { sz: 11, f: 'cairo', algn: 'just', rtl: true, ls: 1.5 });
    it.body_ar.forEach(para => {
      t.para(para.map(r => ({ t: r.t, b: !!r.b, sz: 12, f: 'cairo', c: INK })),
             { algn: 'just', rtl: true, ls: 1.5 });
    });

    const who = ctx.signatory();
    [, t] = V.textbox(ctx, page, 177.4, 673.0, 449.4, 165.4, { autofit: true });
    t.para([{ t: it.signoff_ar, sz: 12, f: 'cairo', c: INK }],
           { algn: 'just', rtl: true, ls: 1.5 });
    t.para([{ t: who.name_ar, sz: 12, b: true, f: 'cairo', c: INK }],
           { algn: 'just', rtl: true, ls: 1.5 });
    t.blank(1, { sz: 12, f: 'cairo', algn: 'just', rtl: true, ls: 1.5 });
    t.blank(3, { sz: 10, f: 'cairo', algn: 'just', rtl: true, ls: 1.5 });
    t.para([{ t: who.role_ar, sz: 10, f: 'cairo', c: INK }],
           { algn: 'just', rtl: true, ls: 1.5 });
    t.para([{ t: who.office_ar, sz: 12, b: true, f: 'cairo', c: INK }],
           { algn: 'just', rtl: true, ls: 1.5 });

    V.picture(ctx, page, who.signature_asset, 483.5, 718.6, 170.6, 85.3);
  },
};

/* ---- slide 4: the project data sheet -------------------------------- */

V.slides.s04_project = {
  title: 'Project data',
  section: 'project',
  build(ctx, page, _p, pageNo) {
    const pr = ctx.c('project');
    V.chrome.contentPage(ctx, page, ctx.c('sections', 1).ar, this.section, pageNo);

    this.summary(ctx, page, pr);

    let t;
    [, t] = V.textbox(ctx, page, 142.2, 616.9, 548.0, 24.2, { autofit: true });
    t.para([{ t: pr.regulatory_heading_ar, sz: 14, f: 'ar_medium', c: INK }],
           { algn: 'just', rtl: true });

    this.styleTable(ctx, page, pr);
    this.limitsTable(ctx, page, pr);
    this.useTable(ctx, page, pr);

    [, t] = V.textbox(ctx, page, 406.9, 896.0, 283.3, 26.7, { autofit: true });
    t.para([{ t: pr.source_note_ar, sz: 8, f: 'ar_light', c: INK }],
           { algn: 'r', rtl: true });
  },

  summary(ctx, page, pr) {
    const rows = pr.summary_rows, loc = pr.location_lines;
    const heights = rows.map(r => r.h).concat(loc.map(l => l.h));
    const cols = [410.3, 20.6, 144.6];
    const tbl = new V.Table(ctx, page, 114.7, 188.0, 575.4, 412.8, cols, heights);

    rows.forEach((row, i) => {
      tbl.merge(i, 0, i, 1);
      tbl.margins(i, 0, { anchor: 'ctr' });
      tbl.margins(i, 2, { anchor: 'ctr' });
      if (row.value_ar)
        tbl.text(i, 0).para([{ t: row.value_ar, sz: 14, f: 'cairo', c: INK }],
                            { algn: 'r', rtl: true });
      if (row.label_ar)
        tbl.text(i, 2).para([{ t: row.label_ar, sz: 14, f: 'ar_medium', c: INK }],
                            { algn: 'r', rtl: true });
    });

    /* the three micro lines that sit inside the location block */
    const base = rows.length;
    loc.forEach((line, j) => {
      const r = base + j;
      tbl.margins(r, 0, { l: 0, t: 0, rr: 0, b: 0, anchor: 'ctr' });
      tbl.text(r, 0).para([{ t: line.value, sz: line.size, f: line.font,
                             c: line.color }], { algn: 'r', rtl: true });
    });

    tbl.merge(3, 2, 5, 2);
    tbl.merge(6, 2, heights.length - 1, 2);
    tbl.merge(base, 1, heights.length - 1, 1);

    this.siteMap(ctx, page);
    V.picture(ctx, page, 'icon-gmaps.png', 531.6, 576.8, 13.2, 18.2);
  },

  /* The plot in its street context, faded back so the numbers still lead.
   *
   * No marker square. The original stamps a coloured block over the middle
   * of whatever image is supplied, which lands on the building as often as
   * on the plot and nobody could say what it was for. The PowerPoint still
   * draws it; this does not.
   *
   * The image is cropped to the block rather than squashed into it. A
   * photo or a map screenshot is almost never the shape of the frame, and
   * stretching it to fit is the one thing that always looks wrong.
   */
  siteMap(ctx, page) {
    if (ctx.isTemplate()) return;
    const g = ctx.geo('site_map');
    const asset = ctx.job.map || 'map-placeholder.png';
    const pos = ctx.job.map_pos || { x: 50, y: 50 };
    V.picture(ctx, page, asset, g.x, g.y, g.w, g.h, {
      transparency: g.transparency,
      cover: true,
      fit: ctx.job.map_fit || 'cover',
      position: pos.x + '% ' + pos.y + '%',
    });
  },

  styleTable(ctx, page, pr) {
    const row = pr.arch_style_rows[0];
    const tbl = new V.Table(ctx, page, 345.5, 645.3, 337.1, 50.4,
                            [208.7, 128.4], [49.1]);
    tbl.margins(0, 0, { anchor: 't' });
    tbl.margins(0, 1, { anchor: 'ctr' });
    const t = tbl.text(0, 0);
    row.values.forEach(v => t.para([{ t: v, sz: 12, f: 'ar_light', c: INK }],
                                   { algn: 'r', rtl: true, margin_left: 0 }));
    tbl.text(0, 1).para([{ t: row.label_ar, sz: 12, f: 'ar_light', c: INK }],
                        { algn: 'r', rtl: true, margin_left: 0 });
  },

  limitsTable(ctx, page, pr) {
    const rows = pr.limits_rows, rowH = 21.6;
    const tbl = new V.Table(ctx, page, 108.6, 689.2, 283.3, rowH * rows.length,
                            [163.2, 120.1], rows.map(() => rowH));
    rows.forEach((row, i) => {
      [[0, row.value], [1, row.label_ar]].forEach(([c, val]) => {
        tbl.margins(i, c, { anchor: 'ctr' });
        tbl.border(i, c, 'TB', 'hairline', ctx.geo('table', 'hairline_w'));
        tbl.text(i, c).para([{ t: val, sz: 12, f: 'ar_light', c: INK }],
                            { algn: 'r', rtl: true, margin_left: 0 });
      });
    });
  },

  useTable(ctx, page, pr) {
    const rows = pr.use_rows;
    /* right-to-left: the label column is the one on the right */
    const tbl = new V.Table(ctx, page, 410.5, 689.2, 268.1, 194.1,
                            [125.2, 142.9], rows.map(r => r.h), { rtl: true });
    rows.forEach((row, i) => {
      [0, 1].forEach(c => {
        tbl.margins(i, c, { l: 6.5, t: 3.3, rr: 6.5, b: 3.3, anchor: 'ctr' });
        tbl.border(i, c, 'TB', 'hairline', ctx.geo('table', 'hairline_w'));
      });
      /* these cells carry mixed text such as "س-1-ب سكني" and
       * "سكني بنسبة 60% ...", which misorders without a base direction */
      tbl.text(i, 0).para([{ t: row.label_ar, sz: 12, f: 'ar_light', c: INK }],
                          { rtl: true, algn: 'l' });
      tbl.text(i, 1).para([{ t: row.value, sz: 12, f: 'ar_light', c: INK }],
                          { rtl: true, algn: 'c' });
    });
  },
};

/* ---- slide 5: the brief --------------------------------------------- */

/* This page has no fixed shape. A villa has floors; a fuel station has a
 * forecourt and a service building. So it is a list of groups, and a group
 * holds a flat list of items, or blocks that each name a part and say what
 * is in it, or both. That is the whole model, and it is why the page can
 * carry a villa on Monday and a petrol station on Tuesday. */
V.slides.s05_spatial = {
  title: 'The brief',
  section: 'scope',
  build(ctx, page, _p, pageNo) {
    const sp = ctx.spatial(), ind = sp.indent;
    V.chrome.contentPage(ctx, page, ctx.c('sections', 2).ar, this.section, pageNo);

    const [, t] = V.textbox(ctx, page, 149.9, 188.2, 492.7, 532.7, { autofit: true });

    const line = (txt, sz, bold, level, step) =>
      t.para([{ t: txt, sz: sz || 11, b: !!bold, f: 'cairo', c: INK }],
             { algn: 'just', rtl: true, ls: 1.5, level: level,
               margin_right: step ? ind[step] : null });
    const gap = sz => t.blank(1, { sz, f: 'cairo', algn: 'just', rtl: true, ls: 1.5 });

    line(sp.heading_ar, 14, true);
    gap(14);
    line(sp.lead_ar, 12);
    gap(12);
    if (sp.lot_label_ar) line(sp.lot_label_ar, 12, true);

    const groups = sp.groups;
    groups.forEach((group, i) => {
      line(group.title_ar, 12, true, 1);
      if (group.includes !== false) line(sp.includes_label_ar, 11, false, null, 'includes');
      (group.items || []).forEach(item => line(item, 11, true, null, 'item'));
      (group.blocks || []).forEach(block => {
        line(block.name_ar, 11, true, null, 'item');
        if (block.contents_ar) line(block.contents_ar, 11, false, null, 'rooms');
      });
      if (i < groups.length - 1) gap(12);
    });

    gap(11); gap(11);
    line(sp.note_ar, 11);
    gap(11);
  },
};

/* ---- slides 6+: the scope ------------------------------------------- */

/* One list of lines flowing across as many pages as it needs. A villa
 * fills two. A project with more disciplines fills three, and the deck
 * grows rather than the text running into the footer. */
V.slides.s06_scope = {
  title: 'Scope of work',
  section: 'scope',
  BULLET_INDENT: -13.5,
  BULLET_MARGIN: 121.5,
  BOX: [149.9, 188.2, 492.7, 732.6],

  pages(ctx) { return this.paginateIndices(ctx).length; },

  build(ctx, page, pageIdx, pageNo) {
    const sc = ctx.c('scope');
    const chunks = this.paginate(ctx);
    V.chrome.contentPage(ctx, page, ctx.c('sections', 2).ar, this.section, pageNo);

    const [x, y, w, h] = this.BOX;
    const [, t] = V.textbox(ctx, page, x, y, w, h, { autofit: true });

    if (pageIdx === 0) {
      t.para([{ t: sc.heading_ar, sz: 14, b: true, f: 'cairo', c: INK }],
             { algn: 'just', rtl: true, ls: 1.5 });
      t.blank(1, { sz: 14, f: 'cairo', algn: 'just', rtl: true, ls: 1.5 });
      t.para([{ t: sc.lead_ar, sz: 12, f: 'cairo', c: INK }],
             { algn: 'just', rtl: true, ls: 1.5 });
      t.blank(1, { sz: 12, f: 'cairo', algn: 'just', rtl: true, ls: 1.5 });
    }
    this.renderLines(t, chunks[pageIdx] || [], sc.indent_step || 36.0);
  },

  /* Page one is shorter because the heading and the lead sit above the
   * lines. A page_break starts a new page even when there is room, which
   * is how phase two keeps its own opening.
   *
   * Split by index rather than by line, so the editor can say which entry
   * in the full list a row on this page belongs to. One loop, two views. */
  paginateIndices(ctx) {
    const sc = ctx.c('scope');
    const cap = sc.page_capacity, leadCost = 4;
    const out = [];
    let current = [], budget = cap - leadCost;
    sc.lines.forEach((line, i) => {
      if (line.page_break || current.length >= budget) {
        if (current.length) { out.push(current); current = []; budget = cap; }
        if (line.page_break) return;
      }
      current.push(i);
    });
    if (current.length) out.push(current);
    return out.length ? out : [[]];
  },

  paginate(ctx) {
    const lines = ctx.c('scope').lines;
    return this.paginateIndices(ctx).map(ix => ix.map(i => lines[i]));
  },

  /* Indentation is a right margin, because Arabic starts on the right. It
   * used to be leading tab characters, which move whenever the font or a
   * name length changes. */
  renderLines(t, lines, step) {
    lines.forEach(ln => {
      const kw = { algn: 'just', rtl: true, ls: 1.5 };
      if (ln.bullet) {
        kw.bullet = ln.bullet; kw.level = 3;
        kw.indent = this.BULLET_INDENT; kw.margin_left = this.BULLET_MARGIN;
      } else if (ln.level_indent) {
        kw.margin_right = ln.level_indent * step;
      }
      t.para([{ t: ln.t, sz: ln.sz || 11, b: !!ln.b, f: 'cairo', c: INK }], kw);
    });
  },
};

/* ---- slide 8: the services checklist -------------------------------- */

/* Included services stack first in ink, the rest follow in muted grey.
 * This replaces the old VADO_Services_Update macro: nothing is dragged by
 * hand any more. */
V.slides.s08_services = {
  title: 'Services included',
  section: 'scope',
  build(ctx, page, _p, pageNo) {
    const sv = ctx.c('services'), g = ctx.geo('services');
    V.chrome.contentPage(ctx, page, ctx.c('sections', 2).ar, this.section, pageNo);

    let t;
    [, t] = V.textbox(ctx, page, 104.2, 183.9, 559.6, 30.6, { autofit: true });
    t.para([{ t: sv.heading_ar, sz: 14, b: true, f: 'cairo', c: INK }],
           { algn: 'r', ls: 1.5 });

    const items = ctx.services();
    const ordered = items.filter(s => s.included).concat(items.filter(s => !s.included));

    ordered.forEach((item, i) => {
      const y = g.y_top + i * g.row_gap;
      const colour = item.included ? 'ink' : 'service_off';

      /* The English runs left to right from the start of the box and the
       * Arabic under it runs right to left to the end of it, which is what
       * PowerPoint does with a justified line and what the original deck
       * shows. Laying the Arabic out left to right, as a bare `justify`
       * does in a browser, left both lines starting at the same edge and
       * the pairing stopped reading as a pair. */
      [, t] = V.textbox(ctx, page, g.name.x, y, g.name.w, g.row_h, { autofit: true });
      t.para([{ t: item.en, sz: 11, f: 'en_light', c: colour }],
             { algn: 'just', level: 1, ls: 1.5 });
      t.para([{ t: item.ar, sz: 10, f: 'ar_medium', c: colour }],
             { algn: 'r', rtl: true, level: 1, ls: 1.5 });

      [, t] = V.textbox(ctx, page, g.status.x, y, g.status.w, g.row_h, { autofit: true });
      if (item.included) {
        t.para([{ t: sv.yes_en, sz: 11, f: 'en', c: colour }],
               { algn: 'just', level: 1, ls: 1.5 });
        t.para([{ t: sv.yes_ar, sz: 10, f: 'ar_medium', c: colour }],
               { algn: 'r', rtl: true, level: 1, ls: 1.5 });
      } else {
        t.para([{ t: sv.no_en, sz: 11, f: 'en', c: colour }],
               { algn: 'just', level: 1, ls: 1.5 });
      }
    });
  },
};

/* ---- slide 9: phases and deliverables ------------------------------- */

V.slides.s09_phases = {
  title: 'Phases + deliverables',
  section: 'scope',
  COLS: [37.9, 114.4, 162.3, 191.2, 77.4],
  HEAD_H: 24.8,
  BULLET: '',
  LEGEND_COLS: { 0: [72.3, 117.3], 1: [347.1, 392.1] },
  LEGEND_ROWS: [822.8, 847.5, 872.5],

  build(ctx, page, _p, pageNo) {
    const ph = ctx.c('phases');
    V.chrome.contentPage(ctx, page, ctx.c('sections', 2).ar, this.section, pageNo);

    let t;
    [, t] = V.textbox(ctx, page, 104.9, 188.3, 492.7, 29.9, { autofit: true });
    t.para([{ t: ph.heading_ar, sz: 14, b: true, f: 'cairo', c: INK }],
           { algn: 'r', rtl: true, ls: 1.5 });

    /* the phases this job actually has: a phase whose service was not sold
     * is gone from here and from the schedule on slide 11 together */
    const rows = ctx.phases();
    const heights = [this.HEAD_H].concat(rows.map(r => r.h));
    const tbl = new V.Table(ctx, page, 72.3, 240.3, 583.2, 564.5,
                            this.COLS, heights, { rtl: true });

    const heads = ['', ph.head_ar[0], ph.head_ar[1], ph.head_ar[2], ph.head_ar[3]];
    for (let c = 0; c < 5; c++) {
      tbl.fill(0, c, 'sand');
      tbl.margins(0, c, { anchor: 'ctr' });
      if (heads[c]) {
        tbl.text(0, c).para([{ t: heads[c], sz: 14, f: 'ar_medium', c: INK }],
                            { algn: 'c', rtl: true, ls: 1.0, before: 12, margin_left: 0 });
      }
    }
    tbl.merge(0, 0, 0, 1);

    rows.forEach((row, idx) => {
      const i = idx + 1;
      for (let c = 0; c < 5; c++) tbl.margins(i, c, { anchor: 'ctr' });
      if (row.no != null) {
        const a = ctx.geo('table', 'sand_tint_alpha');
        tbl.fill(i, 0, 'sand', a);
        tbl.fill(i, 1, 'sand', a);
        tbl.text(i, 0).para([{ t: row.no, sz: 11, f: 'ar_medium', c: INK }],
                            { algn: 'c', rtl: true, ls: 1.0, before: 12, margin_left: 0 });
        const tc = tbl.text(i, 1);
        tc.para([{ t: row.code, sz: 11, f: 'en_display', c: INK }],
                { algn: 'c', rtl: true, ls: 1.0, before: 12, bullet: 'none', margin_left: 0 });
        tc.para([{ t: row.name_ar, sz: 11, f: 'ar_medium', c: INK }],
                { algn: 'c', rtl: true, ls: 1.0, before: 12, margin_left: 0 });
      }

      let tt = tbl.text(i, 2);
      row.deliverable_ar.forEach(line =>
        tt.para([{ t: line, sz: 11, f: 'en', c: INK }],
                { algn: 'c', rtl: true, ls: 1.5, before: 12 }));

      tt = tbl.text(i, 3);
      row.detail.forEach(line =>
        tt.para([{ t: line, sz: 11, f: 'en', c: INK }],
                { algn: 'r', rtl: true, ls: 1.5, bullet: this.BULLET,
                  indent: -27.0, margin_left: 27.0 }));

      if (row.handover) {
        tbl.text(i, 4).para([{ t: row.handover, sz: 11, f: 'en', c: INK }],
                            { algn: 'c', rtl: true, ls: 1.5, before: 12 });
      }
    });

    this.mergeContinuations(tbl, rows);
    this.legend(ctx, page, ctx.phaseCodes());
  },

  /* A run of rows whose `no` is null belongs to the phase above. */
  mergeContinuations(tbl, rows) {
    let i = 0;
    while (i < rows.length) {
      let span = 1;
      while (i + span < rows.length && rows[i + span].no == null) span++;
      if (span > 1) {
        const top = i + 1, bottom = i + span;
        tbl.merge(top, 0, bottom, 0);
        tbl.merge(top, 1, bottom, 1);
        if (rows[i].handover) tbl.merge(top, 4, bottom, 4);
      }
      i += span;
    }
  },

  /* Two columns of code plus label, filled top to bottom. Only the codes
   * on the page appear: the original named a phase no row used, and a
   * client asking "where is that phase" is a question nobody wants. */
  legend(ctx, page, codes) {
    const perCol = this.LEGEND_ROWS.length;
    codes.forEach(([code, label], i) => {
      const [codeX, labelX] = this.LEGEND_COLS[Math.min(Math.floor(i / perCol), 1)];
      const y = this.LEGEND_ROWS[i % perCol];
      let t;
      [, t] = V.textbox(ctx, page, codeX, y, 40.9, 15.0, { autofit: true });
      t.para([{ t: code, sz: 11, b: true, spc: 3.0, f: 'en', c: 'chart_ink' }]);
      [, t] = V.textbox(ctx, page, labelX, y, 234.2, 15.0, { autofit: true });
      t.para([{ t: label, sz: 11, f: 'en', c: 'chart_ink' }]);
    });
  },
};

/* ---- slide 10: the design method ------------------------------------ */

V.slides.s10_method = {
  title: 'Design methodology',
  section: 'method',
  build(ctx, page, _p, pageNo) {
    const me = ctx.c('method'), SOFT = 'ink_soft';
    V.chrome.contentPage(ctx, page, ctx.c('sections', 3).ar, this.section, pageNo);

    let t;
    [, t] = V.textbox(ctx, page, 104.9, 188.3, 519.4, 259.6, { autofit: true });
    /* The first principle sits on the heading line, the rest below it. The
     * data is a plain list either way, so adding one is a single edit. */
    const principles = me.principles_ar;
    const indent = me.principles_indent == null ? 108.0 : me.principles_indent;
    t.para([{ t: me.principles_heading_ar + '  ', sz: 14, b: true, f: 'cairo', c: INK },
            { t: principles[0] + ' ', sz: 14, f: 'cairo', c: INK }],
           { algn: 'just', rtl: true, ls: 1.5 });
    principles.slice(1).forEach(p =>
      t.para([{ t: p, sz: 14, f: 'cairo', c: INK }],
             { algn: 'just', rtl: true, ls: 1.5, margin_right: indent }));
    t.blank(1, { sz: 14, f: 'cairo', algn: 'just', rtl: true, ls: 1.5 });
    t.para([{ t: me.style_label_ar, sz: 14, b: true, f: 'cairo', c: INK },
            { t: me.style_value, sz: 14, f: 'cairo', c: INK }],
           { algn: 'just', rtl: true, ls: 1.5 });
    t.blank(1, { sz: 14, f: 'cairo', algn: 'just', rtl: true, ls: 1.5 });
    t.para([{ t: me.method_heading_ar, sz: 14, b: true, f: 'cairo', c: INK }],
           { algn: 'just', rtl: true, ls: 1.5 });

    this.triangle(ctx, page, me.triangle);

    [, t] = V.textbox(ctx, page, 287.7, 460.2, 363.4, 145.6, { autofit: true });
    t.para([{ t: me.lead_ar, sz: 11, f: 'cairo', c: SOFT }],
           { algn: 'just', rtl: true, ls: 1.5 });

    [, t] = V.textbox(ctx, page, 103.6, 643.3, 547.6, 205.5, { autofit: true });
    me.pillars.forEach((pillar, i) => {
      if (i) t.blank(1, { sz: 11, f: 'cairo', algn: 'just', rtl: true, ls: 1.5 });
      t.para([{ t: pillar.name_ar, sz: 11, b: true, f: 'cairo', c: SOFT },
              { t: pillar.sep, sz: 11, f: 'cairo', c: SOFT },
              { t: ' ', sz: 11, f: 'cairo', c: SOFT },
              { t: pillar.body_ar, sz: 11, f: 'cairo', c: SOFT }],
             { algn: 'just', rtl: true, ls: 1.5 });
    });
  },

  /* The triangle is drawn from shapes, not an image, so the three pillar
   * names follow whatever content.json says. */
  triangle(ctx, page, tri) {
    V.rect(ctx, page, 118.0, 472.2, 144.5, 124.6,
           { line: INK, line_w: 3.0, shape: 'triangle' });
    const label = (x, y, w, text, rot) => {
      const [, t] = V.textbox(ctx, page, x, y, w, 21.8,
                              { autofit: true, rotation: rot });
      t.para([{ t: text, sz: 12, f: 'cairo', c: INK }], { algn: 'c' });
    };
    /* the two upper labels ride the sloping sides of the triangle */
    label(61.1, 514.4, 151.0, tri.top_left_ar, 300.0);
    label(169.9, 514.3, 148.1, tri.top_right_ar, 60.0);
    label(118.0, 601.6, 144.5, tri.bottom_ar);
    label(118.0, 545.0, 144.5, tri.centre_ar);
  },
};

/* ---- slide 11: the schedule and the Gantt chart --------------------- */

V.slides.s11_timeline = {
  title: 'Project timeline',
  section: 'timeline',
  COLS: [164.4, 210.4, 155.5],
  TABLE_X: 111.8, TABLE_Y: 230.2, TABLE_W: 530.2,
  HEAD_H: 27.8,
  PHASE_ROW_MIN: 41.3,      /* two 11 pt lines; the value the original used */
  WEEK_LABEL_MIN_PT: 26.0,  /* below this a week cell is too narrow to label */
  LEGEND_MARKER_GAP: 18.4,  /* a marker is about 11 pt wide */
  LEGEND_ARROW_GAP: 63.7,   /* an arrow is 51.6 pt, so its label sits further */

  build(ctx, page, _p, pageNo) {
    const tl = ctx.c('timeline');
    V.chrome.contentPage(ctx, page, ctx.c('sections', 4).ar, this.section, pageNo);
    this.copy(ctx, page, tl);
    this.table(ctx, page, tl);
    this.gantt(ctx, page, tl.gantt);
  },

  /* Three labels at three fixed positions. They used to be one text box
   * holding fourteen empty paragraphs to push the lower two down, which
   * meant a font change moved both. */
  copy(ctx, page, tl) {
    [['heading_ar', 188.3, 14, true],
     ['note_ar', 570.0, 11, false],
     ['footer_heading_ar', 605.0, 14, true]].forEach(([key, y, size, bold]) => {
      const [, t] = V.textbox(ctx, page, 104.9, y, 550.7, 26.0, { autofit: true });
      t.para([{ t: tl[key], sz: size, b: bold, f: 'cairo', c: INK }],
             { algn: 'r', rtl: true, ls: 1.5 });
    });
  },

  table(ctx, page, tl) {
    const rows = ctx.phases();
    /* A phase row holds the code and the phase name, two 11 pt lines with
     * space above each. Anything under PHASE_ROW_MIN and PowerPoint grows
     * the row anyway, pushing the last one past the bottom of the table. */
    const heights = [this.HEAD_H].concat(rows.map(r =>
      r.no != null ? Math.max(r.h_timeline == null ? r.h : r.h_timeline,
                              this.PHASE_ROW_MIN)
                   : (r.h_timeline == null ? r.h : r.h_timeline)));
    const total = heights.reduce((a, b) => a + b, 0);
    const tbl = new V.Table(ctx, page, this.TABLE_X, this.TABLE_Y, this.TABLE_W,
                            total, this.COLS, heights, { rtl: true });

    tl.head_ar.forEach((head, c) => {
      tbl.fill(0, c, 'sand');
      tbl.margins(0, c, { anchor: 'ctr' });
      tbl.text(0, c).para([{ t: head, sz: 14, f: 'ar_medium', c: INK }],
                          { algn: 'c', rtl: true, ls: 1.0, before: 12, margin_left: 0 });
    });

    rows.forEach((row, idx) => {
      const i = idx + 1;
      for (let c = 0; c < 3; c++) tbl.margins(i, c, { anchor: 'ctr' });
      if (row.no != null) {
        tbl.fill(i, 0, 'sand', ctx.geo('table', 'sand_tint_alpha'));
        const t = tbl.text(i, 0);
        t.para([{ t: row.no, sz: 11, f: 'ar_medium', c: INK },
                { t: row.code, sz: 11, f: 'en_display', c: INK }],
               { algn: 'c', rtl: true, ls: 1.0, before: 12, bullet: 'none', margin_left: 0 });
        t.para([{ t: row.name_ar, sz: 11, f: 'ar_medium', c: INK }],
               { algn: 'c', rtl: true, ls: 1.0, before: 12, margin_left: 0 });
      }
      const td = tbl.text(i, 1);
      row.deliverable_ar.forEach(line =>
        td.para([{ t: line, sz: 11, f: 'en', c: INK }],
                { algn: 'c', rtl: true, ls: 1.5, before: 12 }));

      if (row.duration_days) {
        tbl.text(i, 2).para([{ t: row.duration_days + ' Days', sz: 11, f: 'en', c: INK }],
                            { algn: 'c', rtl: true, ls: 1.5, before: 12,
                              bullet: 'none', margin_left: 0 });
      }
    });

    let i = 0;
    while (i < rows.length) {
      let span = 1;
      while (i + span < rows.length && rows[i + span].no == null) span++;
      if (span > 1) {
        const top = i + 1, bottom = i + span;
        tbl.merge(top, 0, bottom, 0);
        if (rows[i].duration_span) tbl.merge(top, 2, bottom, 2);
      }
      i += span;
    }
  },

  /* Bars drawn from the durations, so the chart is a picture of the table.
   * The grid is as wide as the work needs: a longer technical phase widens
   * the chart rather than running a bar off the page. */
  gantt(ctx, page, g) {
    const t = ctx.geo('timeline');
    const plan = ctx.timelinePlan();
    const nWeeks = plan.weeks;
    const spanPt = t.week_w * (g.months.length * g.weeks_per_month);
    const wk = spanPt / nWeeks;
    const x0 = t.x_start;
    const barW = t.bar_w * wk / t.week_w;
    const wx = week => x0 + week * wk;
    const dx = day => wx(day / 7.0);

    const span = g.weeks_per_month * wk - (wk - barW);
    for (let m = 0; m < plan.months; m++) {
      const label = m < g.months.length ? g.months[m] : 'M' + (m + 1);
      const mx = wx(m * g.weeks_per_month);
      V.rect(ctx, page, mx, t.month_row_y, span, t.bar_h, { fill: 'month_bar' });
      const [, tx] = V.textbox(ctx, page, mx + span / 2 - 18.0, t.month_row_y - 3.5,
                               36.0, 23.5, { autofit: true });
      tx.para([{ t: label, sz: 9, spc: 3.0, f: 'en', c: 'white' }], { algn: 'c' });
    }

    /* On a long programme the cells get narrow, and W1 W2 W3 W4 printed in
     * a 15 pt cell is a smear. Past the threshold the cells still draw,
     * giving the eye a rhythm, but the labels come off. */
    const labelWeeks = wk >= this.WEEK_LABEL_MIN_PT;
    for (let i = 0; i < nWeeks; i++) {
      const bx = wx(i);
      V.rect(ctx, page, bx, t.week_row_y, barW, t.bar_h, { fill: 'week_bar' });
      if (!labelWeeks) continue;
      const [, tx] = V.textbox(ctx, page, bx + (barW - 36.0) / 2, t.week_row_y - 2.6,
                               36.0, 17.0, { autofit: true });
      tx.para([{ t: g.week_labels[i % g.weeks_per_month], sz: 8, spc: 3.0,
                 f: 'en', c: 'chart_ink' }], { algn: 'c' });
    }

    const lanes = plan.lanes;
    const top = t.lane_y[0], gap = t.lane_gap == null ? 23.9 : t.lane_gap;
    const laneY = lanes.map((_, i) => top + i * gap);
    const rowOf = {};
    lanes.forEach((lane, i) => {
      if (!(lane.code in rowOf)) rowOf[lane.code] = i;
    });

    /* dashed drops first, so the lane arrows sit above them */
    lanes.forEach((lane, i) => {
      const after = (lane.schedule || {}).after;
      if (after == null || !(after in rowOf)) return;
      const st = ctx.geo('timeline', 'style', 'lines').consequential;
      const x = dx(lane.start_day);
      const y1 = laneY[rowOf[after]], y2 = laneY[i];
      V.vline(ctx, page, x, Math.min(y1, y2), Math.abs(y2 - y1),
              st.color, st.weight, st.dash);
    });

    lanes.forEach((lane, i) => {
      const y = laneY[i];
      const sx = dx(lane.start_day), ex = dx(lane.end_day);
      const [, tx] = V.textbox(ctx, page, t.label_x, y - 6.5, 35.3, 28.1,
                               { autofit: true });
      tx.para([{ t: lane.code, sz: 10, b: true, spc: 3.0, f: 'en', c: 'chart_ink' }]);
      if (ex - sx < 1) return;          /* a phase with no days has no bar */
      this.drawLine(ctx, page, lane.parallel ? 'parallel' : 'progress',
                    sx + 6.6, y, ex - sx - 6.6);
      this.marker(ctx, page, 'phase_start', sx, y);
      lane.markers.forEach(m => {
        const day = m.at === 'end' ? lane.end_day
                                   : lane.start_day + (m.at_day || 0);
        this.marker(ctx, page, m.kind, dx(day), y);
      });
    });

    this.ganttLegend(ctx, page, g.legend);
  },

  /* Draw one named mark. The definition lives in theme.timeline.style. */
  marker(ctx, page, kind, cx, cy, scale) {
    scale = scale == null ? 1.0 : scale;
    const spec = ctx.geo('timeline', 'style', 'markers')[kind];
    const w = spec.w * scale, h = spec.h * scale;
    return V.rect(ctx, page, cx, cy - h / 2, w, h,
                  { fill: spec.color, shape: spec.shape });
  },

  /* One named line style, including the second stroke that marks work
   * running in parallel. */
  drawLine(ctx, page, name, x, y, w) {
    const style = ctx.geo('timeline', 'style', 'lines')[name];
    if (name === 'parallel') {
      V.arrow(ctx, page, x, y + (style.offset == null ? 0.8 : style.offset), w,
              style.color, style.weight);
      return this.drawLine(ctx, page, 'progress', x, y, w);
    }
    return V.arrow(ctx, page, x, y, w, style.color, style.weight, style.dash);
  },

  ganttLegend(ctx, page, legend) {
    const lines = ctx.geo('timeline', 'style', 'lines');
    const colX = { 0: 133.7, 1: 298.8, 2: 488.1 };
    const rowY = [836.7, 858.4, 880.1];
    legend.forEach(e => {
      const x = colX[e.col], y = rowY[e.row];
      let labelX;
      if (e.kind in lines) {
        this.drawLine(ctx, page, e.kind, x, y + 9.8, 51.6);
        labelX = x + this.LEGEND_ARROW_GAP;
      } else {
        this.marker(ctx, page, e.kind, x, y + 8.0,
                    ctx.geo('timeline', 'style', 'legend_scale'));
        labelX = x + this.LEGEND_MARKER_GAP;
      }
      /* The label reads right to left like the rest of the deck, but stays
       * flush to the mark it names rather than to the far side of its box. */
      const [, t] = V.textbox(ctx, page, labelX, y, 163.0, 14.0, { autofit: true });
      t.para([{ t: e.label, sz: 10, f: 'cairo', c: 'chart_ink' }],
             { rtl: true, algn: 'l' });
    });
  },
};

/* ---- slide 12: the price and the payment schedule ------------------- */

V.slides.s12_financial = {
  title: 'Financial proposal',
  section: 'financial',
  LEFT: 104.5, WIDTH: 527.5,
  LEAD_Y: 191.9, TOTAL_Y: 262.0,
  PAYMENTS_HEAD_Y: 322.0, TABLE_Y: 352.0, BANK_GAP: 68.0,

  build(ctx, page, _p, pageNo) {
    const fi = ctx.c('financial'), co = ctx.c('company');
    V.chrome.contentPage(ctx, page, ctx.c('sections', 5).ar, this.section, pageNo);

    let t;
    [, t] = V.textbox(ctx, page, this.LEFT, this.LEAD_Y, this.WIDTH, 44.0,
                      { autofit: true });
    fi.lead_ar.forEach(line =>
      t.para([{ t: line, sz: 11, f: 'ar_light', c: INK }],
             { algn: 'r', rtl: true, ls: 1.5 }));

    this.total(ctx, page, fi);

    [, t] = V.textbox(ctx, page, this.LEFT, this.PAYMENTS_HEAD_Y, this.WIDTH, 22.0,
                      { autofit: true });
    t.para([{ t: fi.payments_heading_ar, sz: 11, b: true, f: 'cairo', c: INK }],
           { algn: 'r', rtl: true, ls: 1.5 });

    const bottom = this.paymentsTable(ctx, page, fi);
    this.bank(ctx, page, fi, co, bottom + this.BANK_GAP);
  },

  /* The riyal symbol is an image and an image cannot follow text, so the
   * figure gets its own box with a fixed left edge and the symbol sits a
   * fixed gap to the left of it. The number grows rightwards, away from
   * the symbol, so the two cannot overlap however long the figure is.
   * Pinning the image to a page coordinate put it on the heading once and
   * on the written amount once. */
  total(ctx, page, fi) {
    const m = fi.riyal_mark;
    const figureY = this.TOTAL_Y + 22.0;
    let t;

    [, t] = V.textbox(ctx, page, this.LEFT, this.TOTAL_Y, this.WIDTH, 22.0,
                      { autofit: true });
    t.para([{ t: fi.total_label_ar.replace(/[\s:]+$/, ''), sz: 11, b: true,
              f: 'ar_bold', c: INK }], { algn: 'r', rtl: true, ls: 1.5 });

    [, t] = V.textbox(ctx, page, m.figure_x, figureY,
                      this.LEFT + this.WIDTH - m.figure_x, 24.0,
                      { autofit: true, wrap: false });
    t.para([{ t: fi.total_number, sz: 14, b: true, f: 'cairo_xbold', c: INK }],
           { algn: 'l' });
    V.picture(ctx, page, m.asset, m.figure_x - m.gap, figureY + m.dy, m.w, m.h);

    [, t] = V.textbox(ctx, page, this.LEFT, figureY + 24.0, this.WIDTH, 22.0,
                      { autofit: true });
    t.para([{ t: fi.total_written_ar, sz: 11, f: 'ar_medium', c: INK },
            { t: ' ', sz: 11, f: 'ar_medium', c: INK },
            { t: fi.currency_note_ar, sz: 11, f: 'ar_medium', c: INK }],
           { algn: 'r', rtl: true, ls: 1.5 });
  },

  /* Four stages and a total, right to left. It used to be four paragraphs
   * chasing one tab stop, which lined up on the single row whose title was
   * short enough. A table aligns by construction. */
  paymentsTable(ctx, page, fi) {
    const cols = fi.columns, pays = ctx.payments(), widths = cols.widths;
    const heights = pays.map(() => cols.row_h).concat([cols.total_h]);
    const tbl = new V.Table(ctx, page, this.LEFT, this.TABLE_Y,
                            widths.reduce((a, b) => a + b, 0),
                            heights.reduce((a, b) => a + b, 0),
                            widths, heights, { rtl: true });

    pays.forEach((pay, i) => {
      for (let c = 0; c < 4; c++) tbl.margins(i, c, { anchor: 't' });
      tbl.text(i, 0).para([{ t: pay.no.replace(/\.$/, ''), sz: 11, b: true,
                             f: 'cairo', c: INK }],
                          { algn: 'r', rtl: true, ls: 1.5 });
      const cell = tbl.text(i, 1);
      cell.para([{ t: pay.title_ar, sz: 11, b: true, f: 'cairo', c: INK }],
                { algn: 'r', rtl: true, ls: 1.5 });
      pay.body_ar.forEach(body =>
        cell.para([{ t: body, sz: 10, f: 'cairo', c: INK }],
                  { algn: 'r', rtl: true, ls: 1.4 }));
      tbl.text(i, 2).para([{ t: pay.pct, sz: 11, b: true, f: 'cairo', c: INK }],
                          { algn: 'r', rtl: true, ls: 1.5 });
      if (pay.amount)
        tbl.text(i, 3).para([{ t: pay.amount, sz: 11, b: true, f: 'cairo', c: INK }],
                            { algn: 'r', rtl: true, ls: 1.5 });
    });

    /* the last row adds them up in front of the client, which is the
     * cheapest possible proof that the split really is the whole fee */
    const last = pays.length, totals = ctx.paymentTotals();
    for (let c = 0; c < 4; c++) {
      tbl.margins(last, c, { anchor: 'ctr' });
      tbl.border(last, c, 'T', 'ink', 0.75);
    }
    tbl.text(last, 1).para([{ t: fi.total_row_ar, sz: 11, b: true, f: 'cairo', c: INK }],
                           { algn: 'r', rtl: true });
    tbl.text(last, 2).para([{ t: totals.pct, sz: 11, b: true, f: 'cairo', c: INK }],
                           { algn: 'r', rtl: true });
    if (totals.amount)
      tbl.text(last, 3).para([{ t: totals.amount, sz: 11, b: true, f: 'cairo', c: INK }],
                             { algn: 'r', rtl: true });
    return this.TABLE_Y + heights.reduce((a, b) => a + b, 0);
  },

  /* Heading, rule, mark, account, IBAN. No blank lines doing the spacing. */
  bank(ctx, page, fi, co, y) {
    let t;
    [, t] = V.textbox(ctx, page, this.LEFT, y, this.WIDTH, 22.0, { autofit: true });
    t.para([{ t: fi.bank_heading_ar, sz: 11, b: true, f: 'cairo', c: INK }],
           { algn: 'r', rtl: true, ls: 1.5 });
    V.hline(ctx, page, this.LEFT, y + 22.0, this.WIDTH, 'hairline', 0.75);

    V.picture(ctx, page, co.bank_name_asset, this.LEFT + this.WIDTH - 124.6,
              y + 32.0, 124.6, 47.3);

    [, t] = V.textbox(ctx, page, this.LEFT, y + 42.0, this.WIDTH - 148.0, 40.0,
                      { autofit: true });
    t.para([{ t: co.bank_account_name, sz: 10, f: 'en_light', c: INK }],
           { algn: 'r', ls: 1.5 });
    t.para([{ t: co.iban, sz: 12, f: 'en', c: INK }], { algn: 'r', ls: 1.5 });
  },
};

/* ---- slide 13: the conditions and the contract ---------------------- */

/* Signing this page forms the agreement, so nothing on it is positioned by
 * counting blank paragraphs. Before this, six empty paragraphs held the
 * footnote clear of the signatures, which meant a font change could drop
 * it onto one. */
V.slides.s13_agreement = {
  title: 'Agreement',
  section: 'agreement',
  LEFT: 104.9, WIDTH: 537.8, BODY_Y: 196.4,
  NOTE_INDENT: 27.0, NOTE_HANG: -27.0, BULLET_INDENT: 63.0,

  build(ctx, page, _p, pageNo) {
    const ag = ctx.c('agreement');
    V.chrome.contentPage(ctx, page, ctx.c('sections', 6).ar, this.section, pageNo);

    let t, box;
    [box, t] = V.textbox(ctx, page, this.LEFT, this.BODY_Y, this.WIDTH, 470.0,
                         { autofit: true });

    t.para([{ t: ag.notes_heading_ar, sz: 16, f: 'ar_medium', c: INK }],
           { algn: 'r', rtl: true, ls: 1.5, after: 8 });
    ag.notes.forEach(note => {
      if (note.level === 0) {
        t.para([{ t: note.t, sz: 12, f: 'ar_light', c: INK }],
               { algn: 'r', rtl: true, ls: 1.5, after: 8, bullet: '1.',
                 indent: this.NOTE_HANG, margin_left: this.NOTE_INDENT });
      } else {
        t.para([{ t: note.t, sz: 12, f: 'ar_light', c: INK }],
               { algn: 'r', rtl: true, ls: 1.5, level: 1, bullet: '•',
                 indent: this.NOTE_HANG, margin_left: this.BULLET_INDENT });
      }
    });

    t.para([{ t: ag.contract_heading_ar, sz: 16, f: 'ar_medium', c: INK }],
           { algn: 'r', rtl: true, ls: 1.5, after: 8, bullet: 'none',
             indent: 0, margin_left: 0 });
    t.para([{ t: ag.basmala_ar, sz: 12, f: 'ar_medium', c: INK }],
           { algn: 'c', rtl: true, ls: 1.5, after: 8 });
    t.para([{ t: ag.contract_body_ar, sz: 12, f: 'en', c: INK }],
           { algn: 'c', rtl: true, ls: 1.5, after: 8 });
    t.para([{ t: ag.closing_ar, sz: 12, f: 'en', c: INK }],
           { algn: 'c', rtl: true, ls: 1.5, after: 8 });

    /* The footnote and the two signature blocks sit at declared positions,
     * which is right: counting blank paragraphs to place them is what put
     * the footnote on a signature before. But the contract text above them
     * is set in Aller in the PowerPoint and in Cairo here, and Cairo is
     * wider, so it takes an extra line and runs past where the footnote
     * starts. Rather than let the closing line land on the footnote, the
     * whole lower block drops to clear it, keeping the gap the design
     * declares between the two. With Aller installed the body fits and
     * nothing moves. */
    /* Everything below the contract text is drawn where the design says.
     * How far it has to move to clear the text can only be known once the
     * page is laid out, and a page is built while it is still hidden, so
     * that happens in adjust() below. Measuring here returned a height of
     * zero, the arithmetic produced NaN, and the footnote and both
     * signature blocks collapsed to the top of the page. */
    box.dataset.body = '1';

    let fn;
    [fn, t] = V.textbox(ctx, page, this.LEFT, ag.footnote_y, this.WIDTH, 22.0,
                        { autofit: true });
    fn.dataset.lower = ag.footnote_y;
    t.para([{ t: ag.footnote_ar, sz: 10, f: 'en', c: INK }],
           { algn: 'r', rtl: true, ls: 1.5 });

    ag.parties.forEach(party => {
      const el = this.party(ctx, page, party, ag.signature_y);
      el.dataset.lower = ag.signature_y;
    });
  },

  /* Run when the page becomes visible. The contract text is set in Aller in
   * the PowerPoint and in Cairo here, and Cairo is wider, so it can take an
   * extra line and run past where the footnote is pinned. The lower block
   * drops to clear it, keeping the gap the design declares between the
   * footnote and the signatures. */
  adjust(ctx, page) {
    const body = page.querySelector('[data-body]');
    const pr = page.getBoundingClientRect();
    if (!body || !pr.height) return;
    const perPt = pr.height / 1008;
    const bottom = (body.getBoundingClientRect().bottom - pr.top) / perPt;
    const ag = ctx.c('agreement');
    const drop = Math.max(0, bottom + 4 - ag.footnote_y);
    page.querySelectorAll('[data-lower]').forEach(el => {
      el.style.top = V.pt(parseFloat(el.dataset.lower) + drop);
    });
  },

  /* Both sides are built here so they cannot drift apart: the consultant
   * used to run left to right while the owner ran right to left, on the
   * same page, both holding Arabic. */
  party(ctx, page, party, y) {
    let signatory = party.signatory_ar;
    if (party.side === 'consultant') signatory = ctx.signatory().name_prefixed_ar;

    /* Reads the way a contract is signed: which party this is, what they
     * are to the job, who they are, then room to put a pen on the paper.
     * The designation used to sit at the bottom, under the name, where it
     * read as an afterthought rather than as the heading of the block.
     *
     * The two sides end level. The consultant names a person as well as the
     * company, so it takes one blank line fewer to land in the same place.
     */
    const [el, t] = V.textbox(ctx, page, party.x, y, party.w, 155.0, { autofit: true });
    t.para([{ t: party.party_ar, sz: 12, f: 'ar_medium', c: INK }],
           { algn: 'c', rtl: true, ls: 1.5 });
    t.para([{ t: party.role_ar, sz: 10.5, f: 'en', c: INK }],
           { algn: 'c', rtl: true, ls: 1.5 });
    t.blank(1, { sz: 12, f: 'en', algn: 'c', rtl: true, ls: 1.5 });
    t.para([{ t: party.name_ar, sz: 12, f: 'ar_medium', c: INK }],
           { algn: 'c', rtl: true, ls: 1.5 });
    if (signatory) {
      t.para([{ t: signatory, sz: 12, f: 'ar_medium', c: INK }],
             { algn: 'c', rtl: true, ls: 1.5 });
      t.blank(2, { sz: 12, f: 'en', algn: 'c', rtl: true, ls: 1.5 });
    } else {
      t.blank(3, { sz: 12, f: 'ar_medium', algn: 'c', rtl: true, ls: 1.5 });
    }
    return el;
  },
};

/* ---- slide 14: contact ---------------------------------------------- */

V.slides.s14_contact = {
  title: 'Contact',
  section: 'contact',
  build(ctx, page, _p, pageNo) {
    const ct = ctx.c('contact'), co = ctx.c('company');
    V.chrome.contentPage(ctx, page, ctx.c('sections', 7).ar, this.section, pageNo);

    const q = ctx.geo('contact', 'qr');
    V.picture(ctx, page, q.asset, q.x, q.y, q.w, q.h);
    /* A heavy bar anchoring the QR code. It is unlabelled in the original
     * and nobody has said what it is for, so it is kept and named rather
     * than quietly deleted. Remove the entry from theme.contact to drop it. */
    const u = ctx.geo('contact', 'qr_underline');
    V.hline(ctx, page, u.x, u.y, u.w, u.color, u.weight);

    const [, t] = V.textbox(ctx, page, 261.5, 188.3, 381.1, 470.5, { autofit: true });
    const line = (txt, o) => {
      o = o || {};
      const after = o.after === undefined ? 8 : o.after;
      if (txt === '') {
        t.blank(1, { sz: 11, f: 'cairo', algn: 'r', rtl: true, ls: 1.5,
                     after, level: o.level });
        return;
      }
      t.para([{ t: txt, sz: 11, b: !!o.bold, f: 'cairo', c: INK }],
             { algn: 'r', rtl: true, ls: 1.5, after, level: o.level });
    };

    line(ct.lead_ar);
    line('');
    line(co.name_ar_short, { bold: true, level: 4 });
    line(co.contact_phone, { level: 4 });
    line(co.contact_email, { level: 4 });
    line(ctx.address('contact_line1_ar'), { level: 4, after: null });
    line(ctx.address('contact_line2_ar'), { level: 4, after: null });
    line(co.website + ' ', { level: 4 });
    line('');
    ct.closing_ar.slice(0, 2).forEach(p => { line(p); line(''); });
    ct.closing_ar.slice(2).forEach(p => line(p));
    line(ct.team_ar, { bold: true });
  },
};

/* ---- slide 15: the closing page ------------------------------------- */

V.slides.s15_closing = {
  title: 'Closing',
  build(ctx, page) {
    const co = ctx.c('company');
    V.rect(ctx, page, 30.9, 0.1, 21.7, 145.8, { fill: 'ink' });

    let t;
    [, t] = V.textbox(ctx, page, -39.2, 76.0, 163.7, 20.0,
                      { autofit: true, rotation: 270.0 });
    t.para([{ t: co.website_caps, sz: 10.5, spc: 3.0, f: 'en_display', c: 'white' }],
           { algn: 'r', margin_left: 0, before: 0, after: 0 });

    [, t] = V.textbox(ctx, page, 42.7, 816.0, 546.4, 29.1, { autofit: true });
    t.para([{ t: co.tagline_en, sz: 18, spc: 6.0, f: 'en_display', c: 'ink' }],
           { algn: 'c', margin_left: 0, before: 0, after: 0 });
  },
};

/* ---- the deck order, from build.py ---------------------------------- */

V.SLIDE_ORDER = ['s01_cover', 's02_contents', 's03_intro', 's04_project',
                 's05_spatial', 's06_scope', 's08_services', 's09_phases',
                 's10_method', 's11_timeline', 's12_financial',
                 's13_agreement', 's14_contact', 's15_closing'];

/* A module may declare pages(ctx) and take a page index, which is how the
 * scope grows from two pages to three without anything else moving. */
V.renderDeck = function (ctx, stage) {
  stage.textContent = '';
  const manifest = [];
  let number = 0;
  V.SLIDE_ORDER.forEach(name => {
    const mod = V.slides[name];
    const count = mod.pages ? mod.pages(ctx) : 1;
    for (let p = 0; p < count; p++) {
      number += 1;
      const page = V.el('div', 'page');
      page.id = 'page-' + number;
      page.style.setProperty('--paper', 'url(' + ctx.asset('master-bg.png') + ')');
      stage.appendChild(page);
      mod.build(ctx, page, p, number);
      manifest.push({ slide: number, module: name, title: mod.title, page: p });
    }
  });
  (V.pendingTables || []).forEach(t => t.render());
  V.pendingTables = [];
  return manifest;
};
