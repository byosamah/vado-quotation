/* The panel: fill one page, move to the next, check it, print it.
 *
 * The whole deck is rendered and stays in the document; only the current
 * page is shown. That is what lets printing produce all fifteen pages
 * without re-rendering anything, and it is why moving between pages costs
 * nothing.
 *
 * Nothing here decides what a field means. The Arabic labels, where each
 * value comes from and a real example all arrive in the bundle, parsed at
 * build time out of the skill's fields.md.
 */
'use strict';

const STORE = 'vado-tfp-job-v1';
const AT = 'vado-tfp-page-v1';
const TPL = 'vado-tfp-templates-v1';
const SEEN = 'vado-tfp-intro-v1';

/* Fields on closed lists: a value the check would reject cannot be typed. */
const LIST_FOR = { ksaarchzone: 'ksa_arch_zones', ksaarchlevel: 'ksa_arch_levels',
                   archstyle: 'arch_styles' };

/* Worked out from other answers, so they are shown but not typed into. */
const DERIVED = {
  costwritten: 'يُكتب تلقائياً بالحروف من الرقم أعلاه',
  spatialneeds: 'يُبنى تلقائياً من أدوار صفحة ٥',
};

/* Values that read left to right whatever the interface language. */
const LTR = new Set(['tfp_number', 'date', 'phone', 'email', 'coordinates',
                     'googlelink', 'nat_address', 'name_title', 'firstname',
                     'lastname', 'project_type', 'city', 'district']);

/* The heading for each group of fields, and where that group comes from.
 * The source is said once here instead of once per box: twenty-eight
 * repetitions of "من بلدي" is not information, it is wallpaper. */
const GROUPS = [
  { ar: 'المرجع', src: 'من جدول المتابعة' },
  { ar: 'العميل', src: 'من العميل' },
  { ar: 'المشروع', src: 'من اجتماع البداية' },
  { ar: 'الأرض', src: 'من الصك' },
  { ar: 'الموقع', src: 'من الخرائط' },
  { ar: 'المحددات التنظيمية', src: 'من بلدي' },
  { ar: 'العمارة', src: 'قرار تصميمي' },
  { ar: 'الأتعاب', src: 'قرار تجاري' },
];

/* Groups where a value can be a stand-in rather than a fact, so each one
 * offers the تقديري mark. It was on the fifteen Balady fields alone, which
 * left the coordinates, the national address, the map link and both
 * architecture lists with no way to be marked or unmarked by hand, even
 * though jobs arrive with exactly those flagged. */
const ESTIMATABLE = new Set([3, 4, 5, 6]);

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const ar = n => String(n).replace(/[0-9]/g, d => AR_DIGITS[+d]);

V.App = class {
  constructor(data) {
    this.ctx = new V.Ctx(data);
    this.ctx.onBind = (span, name) => this.bind(span, name);
    this.stage = document.getElementById('stage');
    this.restore();
    this.render();
    this.page = this.rememberedPage();
    this.wire();
    this.show(this.page);
    this.loadTemplates();          /* the office's list, fetched in the background */
  }

  get job() { return this.ctx.job; }

  /* ---- the model --------------------------------------------------- */

  set(name, value) {
    const f = this.job.fields || (this.job.fields = {});
    if (value === '' || value == null) delete f[name];
    else f[name] = value;
    this.changed();
  }

  markEstimate(name, on) {
    const list = this.job.placeholders || (this.job.placeholders = []);
    const at = list.indexOf(name);
    if (on && at < 0) list.push(name);
    if (!on && at >= 0) list.splice(at, 1);
    this.changed();
  }

  changed() {
    this.ctx.recompute();
    this.persist();
    this.render();
    this.show(this.page);
  }

  persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.job));
      localStorage.setItem(AT, String(this.page || 1));
      this.storageOk = true;
    } catch (e) { this.storageOk = false; }
    const note = document.getElementById('store-note');
    if (note) note.hidden = this.storageOk !== false;
  }

  restore() {
    if (Object.keys(this.job).length) return;   /* a pre-filled build wins */
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) this.ctx.job = JSON.parse(raw);
      this.ctx.recompute();
    } catch (e) { /* a corrupt store must not stop the file opening */ }
  }

  introSeen() {
    try { return localStorage.getItem(SEEN) === '1'; }
    catch (e) { return false; }
  }

  rememberedPage() {
    try {
      const n = parseInt(localStorage.getItem(AT), 10);
      if (n >= 1 && n <= this.manifest.length) return n;
    } catch (e) { /* ignore */ }
    return 1;
  }

  /* ---- rendering ---------------------------------------------------- */

  render() {
    this.manifest = V.renderDeck(this.ctx, this.stage);
    /* Which fields appear on which page, read off the rendered pages
     * rather than listed by hand. A field that moves to another slide
     * moves in this list on its own. */
    this.onPage = this.manifest.map(m => {
      const pg = document.getElementById('page-' + m.slide);
      const seen = [];
      pg.querySelectorAll('[data-field]').forEach(el => {
        if (seen.indexOf(el.dataset.field) < 0) seen.push(el.dataset.field);
      });
      /* Listed in the order a person gathers them, not the order they are
       * drawn. Someone holding the deed answers every land value at once,
       * instead of meeting them scattered between the client's phone
       * number and the fee. The order is the skill's own: fields.md lists
       * them by source, and each entry carries its place in that file. */
      const rank = n => {
        const m = V.label(n);
        return [m.group == null ? 99 : m.group, m.order == null ? 999 : m.order];
      };
      return seen.sort((a, b) => {
        const x = rank(a), y = rank(b);
        return x[0] - y[0] || x[1] - y[1];
      });
    });
    this.pageOf = {};
    this.onPage.forEach((names, i) => names.forEach(n => {
      if (!(n in this.pageOf)) this.pageOf[n] = i + 1;
    }));
  }

  /* Type straight onto the page. A blank shows what belongs in it; typing
   * over it replaces the whole prompt rather than appending to it. */
  bind(span, name) {
    if (DERIVED[name]) return;
    span.contentEditable = 'true';
    span.spellcheck = false;
    span.title = V.label(name).ar;
    span.addEventListener('focus', () => {
      if (span.dataset.empty) span.textContent = '';
    });
    span.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); span.blur(); }
      if (e.key === 'Escape') { span.blur(); this.show(this.page); }
    });
    span.addEventListener('blur', () => {
      const v = span.textContent.replace(/[‎‏]/g, '').trim();
      const now = span.dataset.empty ? '' : String(this.ctx.field(name));
      if (v !== now) this.set(name, v);
      else this.show(this.page);
    });
  }

  /* ---- moving between pages ----------------------------------------- */

  show(n) {
    this.page = Math.max(1, Math.min(this.manifest.length, n));
    this.stage.querySelectorAll('.page').forEach((p, i) =>
      p.classList.toggle('current', i + 1 === this.page));
    this.fit();
    /* Anything a slide can only work out once it is on screen. A page is
     * built while hidden, so a module that needs real measurements does
     * them here instead. */
    const mod = V.slides[this.manifest[this.page - 1].module];
    if (mod && mod.adjust)
      mod.adjust(this.ctx, document.getElementById('page-' + this.page));
    this.buildForm();
    this.syncBands();
    this.persist();
  }

  needs(n) {
    return this.onPage[n - 1].some(f => !DERIVED[f]);
  }

  nextNeeding(from) {
    for (let n = from + 1; n <= this.manifest.length; n++)
      if (this.needs(n) && this.missingOn(n).length) return n;
    return null;
  }

  missingOn(n) {
    return this.onPage[n - 1].filter(f =>
      !DERIVED[f] && String(this.ctx.field(f)).indexOf('{{') === 0);
  }

  /* Fit the page to the space it has. The zoom is set on the page itself:
   * on the stage it would scale the stage's own box and the fit would walk
   * away with every call.
   *
   * The page is 756 x 1008 points, which is 1008 x 1344 pixels. Fitting on
   * height alone was enough while the stage was always the wide middle
   * column. On a phone the stage is 366 px across, so a height fit handed
   * back a page half a screen wider than the screen and the only way to
   * read it was to scroll sideways. Take whichever of the two fits is
   * smaller and the page is inside the box both ways. */
  fit() {
    const cs = getComputedStyle(this.stage);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const availH = this.stage.clientHeight - padY;
    const availW = this.stage.clientWidth - padX;
    const byH = availH / 1344;
    const byW = availW / 1008;
    /* A hidden stage measures zero, which would pin the zoom at the floor
     * and stay there once it is shown again. Leave it alone until it has a
     * size to be measured against. */
    if (availH <= 0 || availW <= 0) return;
    const pct = this.zoomPct ||
      Math.max(8, Math.min(100, Math.floor(Math.min(byH, byW) * 100)));
    this.setZoom(pct);
    const z = document.getElementById('zoom');
    if (z && !this.zoomPct) z.value = pct;
  }

  /* The two fixed bands on a phone: the heading above and the way forward
   * below. The page is laid between them, and a page name that wraps to a
   * second line moves the boundary, so it is measured rather than guessed. */
  syncBands() {
    const head = document.getElementById('panel-head');
    const nav = document.getElementById('nav');
    if (!head || !nav) return;
    /* The height of the two bars is not where they end. The panel has its
     * own padding above the heading and a gap below it, so an offsetHeight
     * of 69 put the top of the paper 22 px too high and clipped it. Read
     * the edges off the viewport instead and the arithmetic is already
     * done. */
    const hb = head.getBoundingClientRect().bottom;
    const nt = nav.getBoundingClientRect().top;
    const r = document.documentElement.style;
    r.setProperty('--m-head', Math.max(0, Math.round(hb)) + 'px');
    r.setProperty('--m-nav', Math.max(0, Math.round(window.innerHeight - nt)) + 'px');
  }

  /* ---- the two views a narrow screen has room for ------------------- */

  showPage(on) {
    this.menu(false);
    document.body.classList.toggle('show-page', !!on);
    const f = document.getElementById('tab-form');
    const p = document.getElementById('tab-page');
    if (f && p) {
      f.classList.toggle('is-on', !on);
      p.classList.toggle('is-on', !!on);
      f.setAttribute('aria-pressed', String(!on));
      p.setAttribute('aria-pressed', String(!!on));
    }
    /* The stage had no size while it was hidden, so it could not be fitted
     * until now. */
    this.syncBands();
    this.fit();
  }

  menu(on) {
    const open = on === undefined
      ? !document.body.classList.contains('menu-open') : !!on;
    document.body.classList.toggle('menu-open', open);
    const scrim = document.getElementById('scrim');
    const btn = document.getElementById('btn-menu');
    if (scrim) scrim.hidden = !open;
    if (btn) btn.setAttribute('aria-expanded', String(open));
  }

  setZoom(pct) {
    this.stage.querySelectorAll('.page').forEach(p => { p.style.zoom = pct / 100; });
  }

  /* ---- the form for this page --------------------------------------- */

  buildForm() {
    const m = this.manifest[this.page - 1];
    document.getElementById('page-where').textContent =
      'صفحة ' + ar(this.page) + ' من ' + ar(this.manifest.length);
    document.getElementById('page-name').textContent = V.PAGE_NAMES[m.module] || '';

    const filled = this.countFilled();
    document.getElementById('meter').style.width =
      Math.round(filled / this.total() * 100) + '%';
    document.getElementById('meter-label').textContent =
      ar(filled) + ' من ' + ar(this.total()) + ' قيمة مكتملة';

    const host = document.getElementById('page-form');
    host.textContent = '';

    const names = this.onPage[this.page - 1];
    const extra = V.PAGE_CONTROLS[m.module];

    /* Templates and the picture belong at the top of the page they change,
     * not on the far side of the screen under twenty-eight text boxes. */
    if (this.templateKey()) this.buildTemplates(host);
    if (extra && V.CONTROLS_FIRST[m.module]) this[extra](host);

    /* Somebody opening this for the first time lands on seventeen empty
     * boxes with nothing telling them what to do. One paragraph, on the
     * first page only, so it never becomes noise. */
    if (this.page === 1 && !this.introSeen()) {
      const intro = V.el('div', 'intro');
      const txt = V.el('p', 'intro-txt');
      txt.innerHTML =
        '<b>اكتب في المربعات، ثم اضغط التالي.</b> ' +
        'ما تكتبه يظهر على الصفحة ويُحفظ تلقائياً. ' +
        'وقبل أن ترسل، افتح <b>قبل الإرسال</b>.';
      const x = V.el('button', 'intro-x');
      x.type = 'button';
      x.textContent = '×';
      x.title = 'إخفاء';
      x.setAttribute('aria-label', 'إخفاء');
      x.addEventListener('click', () => {
        try { localStorage.setItem(SEEN, '1'); } catch (e) { /* ignore */ }
        intro.remove();
      });
      intro.appendChild(txt);
      intro.appendChild(x);
      host.appendChild(intro);
    }

    if (!names.length && !extra) {
      host.classList.add('resting');
      const box = V.el('div', 'nothing');
      box.innerHTML = '<b>هذه الصفحة ثابتة</b>' +
        'لا تحتاج منك شيئاً. هي جزء من كل عرض ترسله الشركة.';
      host.appendChild(box);
      /* Only when the next page wanting something is further than the one
       * التالي already goes to. Otherwise it is a second button that does
       * exactly what the first does, sitting right above it. */
      const jump = this.nextNeeding(this.page);
      if (jump && jump > this.page + 1) {
        const b = V.el('button', 'quiet jump');
        b.textContent = 'أو اقفز إلى صفحة ' + ar(jump) + '، أول صفحة تحتاج تعبئة';
        b.addEventListener('click', () => this.show(jump));
        host.appendChild(b);
      }
    } else {
      host.classList.remove('resting');
    }

    if (names.length) {
      const h = V.el('h3');
      const left = this.missingOn(this.page).length;
      h.textContent = 'ما تحتاجه هذه الصفحة' +
        (left ? '  ·  ناقص ' + ar(left) : '  ·  مكتملة');
      host.appendChild(h);

      /* A heading whenever the source changes, so someone holding the
       * Balady page can see where its fifteen begin and end. */
      let group = null;
      let card = host;          /* fields with no group stay in the flow */
      names.forEach(name => {
        const g = V.label(name).group;
        if (g !== group) {
          group = g;
          const meta = GROUPS[g];
          if (meta) {
            card = V.el('section', 'fgroup');
            const head = V.el('div', 'group-head');
            const t = V.el('span', 'g-name'); t.textContent = meta.ar;
            const src = V.el('span', 'g-src'); src.textContent = meta.src;
            head.appendChild(t); head.appendChild(src);
            card.appendChild(head);
            if (ESTIMATABLE.has(g)) {
              const note = V.el('p', 'group-note');
              note.textContent = 'علّم أي قيمة لم تأتِ من المصدر بعلامة تقديري.';
              card.appendChild(note);
            }
            host.appendChild(card);
          } else {
            card = host;
          }
        }
        card.appendChild(this.fieldRow(name));
      });
    }

    if (extra && !V.CONTROLS_FIRST[m.module]) this[extra](host);
  }

  total() {
    const f = this.ctx.content.fields || {};
    return Object.keys(f).filter(k => k !== '_doc' && !DERIVED[k]).length;
  }

  countFilled() {
    const f = this.ctx.content.fields || {};
    return Object.keys(f).filter(k =>
      k !== '_doc' && !DERIVED[k] &&
      String(this.ctx.field(k)).indexOf('{{') !== 0).length;
  }

  fieldRow(name) {
    const meta = V.label(name);
    const wrap = V.el('div', 'f');
    if (this.ctx.estimates.indexOf(name) >= 0) wrap.classList.add('is-est');

    /* No per-field source line: the group heading above already says it. */
    const lab = V.el('div', 'lab');
    const nm = V.el('span', 'name'); nm.textContent = meta.ar;
    lab.appendChild(nm);
    wrap.appendChild(lab);

    if (DERIVED[name]) {
      const p = V.el('p', 'note');
      const v = String(this.ctx.field(name));
      p.textContent = (v.indexOf('{{') === 0 ? '—' : v) + ' · ' + DERIVED[name];
      wrap.appendChild(p);
      return wrap;
    }

    let input;
    const listName = LIST_FOR[name];
    if (listName) {
      input = V.el('select');
      const blank = V.el('option'); blank.value = ''; blank.textContent = '— اختر —';
      input.appendChild(blank);
      (this.ctx.content.lists[listName] || []).forEach(v => {
        const o = V.el('option'); o.value = v; o.textContent = v;
        input.appendChild(o);
      });
    } else {
      input = V.el('input');
      input.type = 'text';
      /* "مثال: 250402MKM-RES-VILLA" was drawn "250402مثال: MKM-RES-VILLA".
       * The example is Latin, the word before it is Arabic, and without a
       * mark between them the layout engine splits the value in half. The
       * same fault the deck has, in a text box this time. */
      if (meta.example) {
        const mixed = /[A-Za-z0-9]/.test(meta.example);
        input.placeholder = 'مثال: ' + (mixed ? V.LRM : '') + meta.example;
      }
      if (LTR.has(name)) input.classList.add('ltr');
    }
    const cur = String(this.ctx.field(name));
    input.value = cur.indexOf('{{') === 0 ? '' : cur;
    input.dataset.field = name;
    input.addEventListener('change', () => this.set(name, input.value.trim()));
    /* light up the value on the page while the box has focus, so nobody
     * has to hunt for what they are changing */
    input.addEventListener('focus', () => this.highlight(name, true));
    input.addEventListener('blur', () => this.highlight(name, false));
    /* Hovering the row lights it too, so running an eye down the list
     * shows where each value lands without clicking into anything. */
    wrap.addEventListener('mouseenter', () => this.highlight(name, true));
    wrap.addEventListener('mouseleave', () => {
      if (document.activeElement !== input) this.highlight(name, false);
    });
    wrap.appendChild(input);

    /* A value typed to make the page reviewable has to be marked as one.
     * The sentence explaining it is said once in the group heading; here it
     * is a single word. */
    if (ESTIMATABLE.has(meta.group)) {
      const est = V.el('label', 'est');
      const cb = V.el('input'); cb.type = 'checkbox';
      cb.checked = this.ctx.estimates.indexOf(name) >= 0;
      cb.addEventListener('change', () => this.markEstimate(name, cb.checked));
      const t = V.el('span'); t.textContent = 'تقديري';
      est.appendChild(cb); est.appendChild(t);
      wrap.appendChild(est);
    }
    return wrap;
  }

  highlight(name, on) {
    const pg = document.getElementById('page-' + this.page);
    if (!pg) return;
    pg.querySelectorAll('[data-field="' + name + '"]').forEach(el =>
      el.classList.toggle('field-lit', on));
  }

  /* ---- the controls that belong to one page ------------------------- */

  /* Slide 5 is the page most likely to carry the previous client's villa
   * into this one, so it is fully editable and never inherited quietly.
   *
   * The structure on the page is a hierarchy: groups hold floors, floors
   * hold rooms. The panel used to flatten all three into identical boxes
   * with no labels, and the box holding the rooms, which is the whole point
   * of the page, was the one cut off at the edge.
   */
  brief(host) {
    const sp = this.ctx.spatial();
    const groups = JSON.parse(JSON.stringify(sp.groups || []));
    const commit = () => {
      this.job.spatial = Object.assign({}, this.job.spatial, { groups });
      this.changed();
    };

    /* Deleting a floor takes its rooms with it, so it asks first. */
    const deleter = (title, fn) => {
      const b = V.el('button', 'mini danger');
      b.textContent = '×';
      b.title = title;
      let armed = false;
      b.addEventListener('click', () => {
        if (!armed) {
          armed = true;
          b.textContent = 'احذف؟';
          b.classList.add('armed');
          setTimeout(() => {
            armed = false; b.textContent = '×'; b.classList.remove('armed');
          }, 4000);
          return;
        }
        fn();
      });
      return b;
    };

    const labelled = (text, control) => {
      const wrap = V.el('label', 'sub-f');
      const cap = V.el('span'); cap.textContent = text;
      wrap.appendChild(cap); wrap.appendChild(control);
      return wrap;
    };

    const h = V.el('h3'); h.textContent = 'الأدوار والمساحات';
    host.appendChild(h);
    const sub = V.el('p', 'group-note');
    sub.textContent = 'ملخص صفحة ٤ يُبنى من هذه الأدوار، فأي دور تضيفه يظهر هناك.';
    host.appendChild(sub);

    groups.forEach((g, gi) => {
      const card = V.el('div', 'grp');

      const head = V.el('div', 'grp-head');
      const ti = V.el('input');
      ti.type = 'text'; ti.value = g.title_ar || '';
      ti.placeholder = 'اسم المجموعة';
      ti.addEventListener('change', () => { g.title_ar = ti.value; commit(); });
      head.appendChild(ti);
      head.appendChild(deleter('احذف المجموعة وكل ما فيها',
                               () => { groups.splice(gi, 1); commit(); }));
      card.appendChild(head);

      const body = V.el('div', 'grp-body');

      (g.blocks || []).forEach((b, bi) => {
        const blk = V.el('div', 'blk');
        const nameRow = V.el('div', 'row');
        const nm = V.el('input');
        nm.type = 'text'; nm.value = b.name_ar || '';
        nm.placeholder = 'مثال: الدور الأرضي';
        nm.addEventListener('change', () => { b.name_ar = nm.value; commit(); });
        nameRow.appendChild(nm);
        nameRow.appendChild(deleter('احذف الدور وما فيه',
                                    () => { g.blocks.splice(bi, 1); commit(); }));
        blk.appendChild(labelled('الدور', nameRow));

        /* a box you can read: it wraps and grows instead of scrolling
         * sideways past the edge of the panel */
        const ct = V.el('textarea');
        ct.rows = 2;
        ct.value = b.contents_ar || '';
        ct.placeholder = 'مجلس , صالة معيشة , مطبخ';
        ct.addEventListener('change', () => { b.contents_ar = ct.value; commit(); });
        blk.appendChild(labelled('ما فيه', ct));

        body.appendChild(blk);
      });

      (g.items || []).forEach((item, ii) => {
        const row = V.el('div', 'row');
        const inp = V.el('input');
        inp.type = 'text'; inp.value = item;
        inp.placeholder = 'مثال: موقف 3 سيارات';
        inp.addEventListener('change', () => { g.items[ii] = inp.value; commit(); });
        row.appendChild(inp);
        row.appendChild(deleter('احذف العنصر',
                                () => { g.items.splice(ii, 1); commit(); }));
        body.appendChild(labelled('عنصر', row));
      });

      const add = V.el('div', 'row add');
      [['+ دور', () => (g.blocks || (g.blocks = []))
          .push({ name_ar: '', contents_ar: '' })],
       ['+ عنصر', () => (g.items || (g.items = [])).push('')]]
        .forEach(([txt, fn]) => {
          const b = V.el('button', 'mini');
          b.textContent = txt;
          b.addEventListener('click', () => { fn(); commit(); });
          add.appendChild(b);
        });
      body.appendChild(add);

      card.appendChild(body);
      host.appendChild(card);
    });

    const addGroup = V.el('button', 'mini wide');
    addGroup.textContent = '+ مجموعة جديدة';
    addGroup.addEventListener('click', () => {
      groups.push({ title_ar: '', blocks: [] });
      commit();
    });
    host.appendChild(addGroup);
  }

  /* Slides 6 and 7 are the scope: the studio's own words, and normally the
   * same on every proposal. Editing here changes THIS proposal only. The
   * standard wording lives in content.json, and changing it there is the
   * studio deciding rather than one person typing, which is why the
   * restore button exists and says so.
   *
   * context.py honours the same job key, so a scope edited here reaches the
   * PowerPoint as well. The two outputs cannot drift apart.
   */
  /* What a job sells is a commercial decision tied to the fee, so there is
   * no default and no suggestion by project type. */
  services(host) {
    const h = V.el('h3'); h.textContent = 'الخدمات المشمولة';
    host.appendChild(h);
    const sub = V.el('p', 'sub');
    sub.textContent = 'ما تختاره هنا يحدد المراحل في صفحة ٩ والجدول في صفحة ١١.';
    host.appendChild(sub);

    this.ctx.services().forEach(item => {
      const row = V.el('div', 'chk');
      const cb = V.el('input');
      cb.type = 'checkbox';
      cb.checked = !!item.included;
      cb.addEventListener('change', () => {
        this.job.services = this.ctx.services()
          .filter(s => (s.id === item.id ? cb.checked : s.included))
          .map(s => s.id);
        this.changed();
      });
      const lab = V.el('div');
      const arName = V.el('div'); arName.textContent = item.ar;
      const enName = V.el('span', 'en'); enName.textContent = item.en;
      lab.appendChild(arName); lab.appendChild(enName);
      row.appendChild(cb); row.appendChild(lab);
      host.appendChild(row);
    });
  }

  /* The number of days is the only thing needed. The bar length, where a
   * bar starts, the dashed drops and how wide the grid is all follow.
   *
   * Every row that carries days gets a box, continuation rows included.
   * Only the numbered phases had one before, so the twenty-one days of
   * drawings inside the concept phase could not be reached from here at
   * all: the panel said 7 while the chart drew 28.
   */
  durations(host) {
    const plan = this.ctx.timelinePlan();
    const byId = {};
    plan.lanes.forEach(l => { byId[l.id] = l; });

    const total = V.el('div', 'readout');
    total.innerHTML = '<b>' + ar(Math.round(plan.total_days)) + ' يوماً</b>' +
      'مدة المشروع كاملاً';
    host.appendChild(total);

    const h = V.el('h3'); h.textContent = 'مدة كل مرحلة، بالأيام';
    host.appendChild(h);

    let parent = null;
    this.ctx.phases().forEach(row => {
      if (!row.id) return;
      const isPhase = row.no != null;
      if (isPhase) parent = byId[row.id];

      const wrap = V.el('div', 'f' + (isPhase ? '' : ' cont'));
      const lab = V.el('div', 'lab');
      const nm = V.el('span', 'name');
      nm.textContent = isPhase ? row.name_ar
                               : (row.deliverable_ar || [])[0] || 'تكملة';
      lab.appendChild(nm);
      if (isPhase) {
        const code = V.el('span', 'src'); code.textContent = (row.code || '').trim();
        lab.appendChild(code);
      }
      wrap.appendChild(lab);

      const input = V.el('input');
      input.type = 'number'; input.min = '0'; input.classList.add('ltr');
      input.value = row.duration_days == null ? '' : row.duration_days;
      input.addEventListener('change', () => {
        const d = this.job.durations || (this.job.durations = {});
        if (input.value === '') delete d[row.id];
        else d[row.id] = parseInt(input.value, 10);
        this.changed();
      });
      wrap.appendChild(input);

      /* what this phase costs the programme, so a change is not silent */
      if (isPhase && parent) {
        const span = V.el('p', 'lane-span');
        span.textContent = 'من اليوم ' + ar(Math.round(parent.start_day)) +
          ' إلى ' + ar(Math.round(parent.end_day)) +
          (parent.days !== (row.duration_days || 0)
            ? ' · ' + ar(parent.days) + ' يوماً بالكامل' : '');
        wrap.appendChild(span);
        const ov = (row.schedule || {}).overlap_days;
        if (ov) {
          const note = V.el('p', 'lane-note');
          note.textContent = 'تبدأ قبل انتهاء ' + (row.schedule.after || '') +
            ' بـ ' + ar(ov) + ' يوماً، لأنها تُقدَّم على رسومات جارية.';
          wrap.appendChild(note);
        }
      }
      host.appendChild(wrap);
    });

    this.chartWidth(host, plan);
    this.laneMarkers(host, plan);
  }

  /* How many weeks the grid holds. It fits the work by default; a job can
   * widen or tighten it. */
  chartWidth(host, plan) {
    const h = V.el('h3'); h.textContent = 'عرض الرسم';
    host.appendChild(h);

    const auto = !(parseInt(this.job.timeline_weeks, 10) > 0);
    const row = V.el('div', 'stepper');
    const minus = V.el('button', 'mini'); minus.textContent = '−';
    const val = V.el('span', 'stepper-val');
    val.textContent = ar(plan.weeks) + ' أسبوعاً';
    const plus = V.el('button', 'mini'); plus.textContent = '+';
    const setWeeks = n => {
      const lo = Math.max(1, plan.weeksNeeded);
      this.job.timeline_weeks = Math.max(lo, n);
      this.changed();
    };
    minus.addEventListener('click', () => setWeeks(plan.weeks - 1));
    plus.addEventListener('click', () => setWeeks(plan.weeks + 1));
    minus.disabled = plan.weeks <= plan.weeksNeeded;
    row.appendChild(minus); row.appendChild(val); row.appendChild(plus);
    host.appendChild(row);

    const note = V.el('p', 'lane-note');
    note.textContent = auto
      ? 'يتسع تلقائياً للعمل: ' + ar(plan.weeksNeeded) + ' أسبوعاً كحد أدنى.'
      : 'عرض مخصص. الحد الأدنى ' + ar(plan.weeksNeeded) + ' أسبوعاً.';
    host.appendChild(note);

    if (!auto) {
      const back = V.el('button', 'mini wide');
      back.textContent = 'ارجع للعرض التلقائي';
      back.addEventListener('click', () => {
        delete this.job.timeline_weeks;
        this.changed();
      });
      host.appendChild(back);
    }
  }

  /* The marks on each bar. Which milestones a client is shown is a project
   * decision: a job with no municipal step has no approval triangle. */
  laneMarkers(host, plan) {
    const h = V.el('h3'); h.textContent = 'العلامات على الرسم';
    host.appendChild(h);
    const note = V.el('p', 'group-note');
    note.textContent = 'العلامة تُرسم على شريط المرحلة في اليوم الذي تحدده.';
    host.appendChild(note);

    plan.lanes.forEach(lane => {
      const card = V.el('div', 'grp');
      const head = V.el('div', 'grp-head');
      const t = V.el('span');
      t.style.cssText = 'flex:1 1 auto;font:600 12px CairoSemiBold,sans-serif';
      t.textContent = (lane.code ? lane.code + ' · ' : '') + (lane.name_ar || '');
      head.appendChild(t);
      card.appendChild(head);

      const body = V.el('div', 'grp-body');
      const marks = lane.markers.slice();
      const commit = () => {
        const all = this.job.markers || (this.job.markers = {});
        all[lane.id] = marks;
        this.changed();
      };

      marks.forEach((m, i) => {
        const row = V.el('div', 'row');
        const kind = V.el('select');
        const names = V.markerNames(this.ctx);
        Object.keys(names).forEach(k => {
          const o = V.el('option'); o.value = k; o.textContent = names[k];
          if (k === m.kind) o.selected = true;
          kind.appendChild(o);
        });
        kind.addEventListener('change', () => { m.kind = kind.value; commit(); });

        const day = V.el('input');
        day.type = 'number'; day.min = '0'; day.max = String(lane.days);
        day.classList.add('ltr');
        day.style.flex = '0 0 62px';
        day.value = m.at === 'end' ? lane.days : (m.at_day || 0);
        day.title = 'اليوم داخل المرحلة';
        day.addEventListener('change', () => {
          const v = Math.max(0, Math.min(lane.days, parseInt(day.value, 10) || 0));
          if (v >= lane.days) { m.at = 'end'; delete m.at_day; }
          else { delete m.at; m.at_day = v; }
          commit();
        });

        const del = V.el('button', 'mini danger');
        del.textContent = '×';
        del.addEventListener('click', () => { marks.splice(i, 1); commit(); });

        row.appendChild(kind); row.appendChild(day); row.appendChild(del);
        body.appendChild(row);
      });

      const add = V.el('button', 'mini');
      add.textContent = '+ علامة';
      add.addEventListener('click', () => {
        marks.push({ kind: 'document_submission', at: 'end' });
        commit();
      });
      body.appendChild(add);
      card.appendChild(body);
      host.appendChild(card);
    });
  }

  /* The four shares are printed added up in front of the client, so they
   * have to reach the whole fee. */
  money(host) {
    const totals = this.ctx.paymentTotals();
    const unset = ['p1', 'p2', 'p3', 'p4']
      .some(k => String(this.ctx.field(k)).indexOf('{{') === 0);
    const p = V.el('p', 'sub');
    if (unset) p.textContent = 'الدفعات غير محددة بعد.';
    else {
      const ok = Math.abs(totals.raw - 100) < 0.01;
      p.textContent = 'مجموع الدفعات ' + ar(Math.round(totals.raw * 10) / 10) +
        '٪' + (ok ? ' · صحيح' : ' · يجب أن يكون ١٠٠');
      p.style.color = ok ? '#93d39b' : '#ff8f8f';
      p.style.opacity = 1;
    }
    host.appendChild(p);
  }

  /* The plot in its street context. Without one the stand-in is used, and
   * it is marked as a stand-in. */
  map(host) {
    const h = V.el('h3'); h.textContent = 'صورة الموقع';
    host.appendChild(h);
    const inp = V.el('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.addEventListener('change', () => {
      const file = inp.files[0];
      if (!file) return;
      const fr = new FileReader();
      fr.onload = () => {
        /* Keep the real file name: the picture is carried in `map_data` for
         * this page, and `map` stays a name whoever builds the PowerPoint
         * can drop into assets/ and find. */
        const name = file.name.replace(/[^\w.-]+/g, '-');
        this.ctx.assets[name] = fr.result;
        this.job.map = name;
        this.job.map_data = fr.result;
        this.markEstimate('map', false);
        this.changed();
      };
      fr.readAsDataURL(file);
    });
    host.appendChild(inp);
    const note = V.el('p', 'note');
    note.textContent = this.job.map
      ? 'الصورة محفوظة داخل هذا الملف باسم ' + this.job.map +
        '. تُقصّ لتملأ الإطار بدون تشويه.'
      : 'لم تُرفع صورة بعد، والصفحة تعرض صورة مؤقتة.';
    host.appendChild(note);
    if (!this.job.map) return;

    /* Which part of the picture survives the crop. A plot is rarely in the
     * middle of the shot somebody took, and until now the middle was all
     * you got. */
    const pos = this.job.map_pos || (this.job.map_pos = { x: 50, y: 50 });
    const slider = (label, axis) => {
      const wrap = V.el('label', 'crop');
      const cap = V.el('span');
      cap.textContent = label;
      const inp = V.el('input');
      inp.type = 'range'; inp.min = '0'; inp.max = '100'; inp.step = '1';
      inp.value = pos[axis];
      inp.disabled = this.job.map_fit === 'contain';
      /* redraw the picture live, and only write to the job when let go, so
       * dragging does not rebuild the deck on every pixel */
      const live = () => {
        pos[axis] = +inp.value;
        const img = document.querySelector(
          '#page-' + this.page + ' img[style*="object-fit"]');
        if (img) img.style.objectPosition = pos.x + '% ' + pos.y + '%';
      };
      inp.addEventListener('input', live);
      inp.addEventListener('change', () => { live(); this.persist(); });
      wrap.appendChild(cap); wrap.appendChild(inp);
      host.appendChild(wrap);
    };
    slider('يمين ويسار', 'x');
    slider('أعلى وأسفل', 'y');

    const whole = V.el('label', 'est');
    const cb = V.el('input'); cb.type = 'checkbox';
    cb.checked = this.job.map_fit === 'contain';
    cb.addEventListener('change', () => {
      this.job.map_fit = cb.checked ? 'contain' : 'cover';
      this.changed();
    });
    const t = V.el('span'); t.textContent = 'أظهر الصورة كاملة بدون قص';
    whole.appendChild(cb); whole.appendChild(t);
    host.appendChild(whole);

    const drop = V.el('button', 'mini');
    drop.textContent = 'احذف الصورة';
    drop.addEventListener('click', () => {
      delete this.job.map; delete this.job.map_data;
      delete this.job.map_pos; delete this.job.map_fit;
      this.changed();
    });
    host.appendChild(drop);
  }

  /* ---- templates ------------------------------------------------------
   *
   * A whole job, saved under a name, so the next proposal of the same kind
   * starts from a filled page instead of an empty one. It is a snapshot of
   * everything, the client's name and slide 5's rooms included, which is
   * why applying one has to be a deliberate two-step act and why the rail
   * says out loud what it carries.
   */

  /* Templates belong to a page, not to the proposal. Page 4 is the case
   * that earns one: the Balady limits, the architecture zone and the plot
   * details repeat across every job in the same district, while the client
   * and the fee never repeat at all. A whole-proposal template would carry
   * the last client's name into the next one, which is the exact mistake
   * the deck already guards against on slide 5. */
  /* Templates live with the office, not in one person's browser. They are
   * fetched when the page opens and written through /api/templates, so a
   * template saved by anyone is a template everyone has. What is kept in
   * this browser is only a cache, so the list still draws before the fetch
   * lands, or if the tool was opened from a downloaded file. */
  templates() { return this._shared || this.cachedTemplates(); }

  cachedTemplates() {
    try { return JSON.parse(localStorage.getItem(TPL)) || {}; }
    catch (e) { return {}; }
  }

  cacheTemplates(all) {
    this._shared = all;
    try { localStorage.setItem(TPL, JSON.stringify(all)); } catch (e) { /* ignore */ }
  }

  async loadTemplates() {
    try {
      const res = await fetch('/api/templates', { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      this.cacheTemplates(await res.json());
      this.templatesLive = true;
    } catch (e) {
      this.templatesLive = false;   /* say so rather than pretend */
    }
    if (this.templateKey()) this.show(this.page);
  }

  async pushTemplate(op, page, name, template) {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, page, name, template }),
    });
    if (!res.ok) throw new Error('save failed: ' + res.status);
    this.cacheTemplates(await res.json());
  }

  templateKey() {
    const m = this.manifest[this.page - 1];
    return V.TEMPLATE_PAGES[m.module] ? m.module : null;
  }

  buildTemplates(host) {
    const key = this.templateKey();
    if (!key || !host) return;

    const fields = this.onPage[this.page - 1].filter(f => !DERIVED[f]);
    const all = this.templates()[key] || {};
    const names = Object.keys(all);

    const box = V.el('div', 'tpl-box');
    const h = V.el('h3');
    h.textContent = 'قوالب هذه الصفحة';
    box.appendChild(h);

    const pick = V.el('div', 'row');
    const sel = V.el('select');
    const none = V.el('option');
    none.value = '';
    none.textContent = names.length ? '— ابدأ من قالب —' : '— لا يوجد قوالب —';
    sel.appendChild(none);
    names.forEach(n => {
      const o = V.el('option'); o.value = n; o.textContent = n;
      sel.appendChild(o);
    });
    sel.disabled = !names.length;

    const use = V.el('button', 'mini');
    use.textContent = 'استخدم';
    use.disabled = true;
    const del = V.el('button', 'mini');
    del.textContent = '×';
    del.title = 'احذف القالب';
    del.disabled = true;

    let armed = false;
    const reset = () => {
      armed = false; use.textContent = 'استخدم'; use.classList.remove('armed');
    };
    sel.addEventListener('change', () => {
      use.disabled = del.disabled = !sel.value;
      reset();
    });
    use.addEventListener('click', () => {
      const tpl = all[sel.value];
      if (!tpl) return;
      /* it overwrites what is already typed, so it asks once */
      const clashes = Object.keys(tpl.fields || {})
        .some(k => (this.job.fields || {})[k] !== undefined);
      if (clashes && !armed) {
        armed = true;
        use.textContent = 'يستبدل؟';
        use.classList.add('armed');
        setTimeout(reset, 4000);
        return;
      }
      const f = this.job.fields || (this.job.fields = {});
      Object.assign(f, tpl.fields || {});
      const est = this.job.placeholders || (this.job.placeholders = []);
      (tpl.placeholders || []).forEach(n => {
        if (est.indexOf(n) < 0) est.push(n);
      });
      this.changed();
    });
    del.addEventListener('click', async () => {
      del.disabled = true;
      try {
        await this.pushTemplate('del', key, sel.value);
        this.show(this.page);
      } catch (e) { del.disabled = false; }
    });
    pick.appendChild(sel); pick.appendChild(use); pick.appendChild(del);
    box.appendChild(pick);

    const save = V.el('div', 'row');
    const nm = V.el('input');
    nm.type = 'text';
    nm.placeholder = 'اسم قالب جديد';
    const btn = V.el('button', 'mini');
    btn.textContent = 'احفظ قيم هذه الصفحة';
    const doSave = async () => {
      const name = nm.value.trim();
      if (!name) { nm.focus(); return; }
      const values = {};
      fields.forEach(f => {
        const v = this.ctx.field(f);
        if (String(v).indexOf('{{') !== 0) values[f] = v;
      });
      btn.disabled = true; btn.textContent = 'يحفظ…';
      try {
        await this.pushTemplate('put', key, name, {
          fields: values,
          placeholders: this.ctx.estimates.filter(n => n in values),
        });
        this.show(this.page);
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'تعذّر الحفظ، حاول مرة أخرى';
      }
    };
    btn.addEventListener('click', doSave);
    nm.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });
    save.appendChild(nm); save.appendChild(btn);
    box.appendChild(save);

    const warn = V.el('p', 'note warn-soft');
    warn.textContent = 'يحفظ ' + ar(fields.length) +
      ' قيمة من هذه الصفحة فقط. لا يحفظ اسم العميل ولا الأتعاب.';
    box.appendChild(warn);

    const where = V.el('p', 'note');
    if (this.templatesLive === false) {
      where.classList.add('warn-soft');
      where.textContent = 'تعذّر الوصول إلى قوالب المكتب. هذه نسخة على هذا الجهاز.';
    } else {
      where.textContent = 'قوالب المكتب: ما تحفظه هنا يراه كل من لديه الرابط.';
    }
    box.appendChild(where);

    host.appendChild(box);
  }

  /* ---- before you send ---------------------------------------------- */

  /* The last place a wrong number gets caught, and the only place the PDF
   * button lives. The read-back is deliberate: only a person who knows the
   * project can catch a wrong plot number. */
  review() {
    const host = document.getElementById('review-body');
    host.textContent = '';
    const missing = [], estimates = [], problems = [], ok = [];

    Object.keys(this.ctx.content.fields || {}).forEach(name => {
      if (name === '_doc' || DERIVED[name]) return;
      if (String(this.ctx.field(name)).indexOf('{{') !== 0) return;
      missing.push({ what: V.label(name).ar, where: this.pageOf[name] });
    });

    this.ctx.estimates.forEach(name => {
      if (name === 'map') {
        estimates.push({ what: 'صورة الموقع', where: this.pageOf.coordinates,
                         detail: 'الصفحة تعرض صورة مؤقتة' });
        return;
      }
      const v = String(this.ctx.field(name));
      estimates.push({ what: V.label(name).ar, where: this.pageOf[name],
                       detail: v.indexOf('{{') === 0 ? '' : v });
    });

    const shares = ['p1', 'p2', 'p3', 'p4'].map(k => String(this.ctx.field(k)));
    const totals = this.ctx.paymentTotals();
    if (shares.some(v => v.indexOf('{{') === 0))
      problems.push({ what: 'الدفعات غير محددة', detail: '' });
    else if (Math.abs(totals.raw - 100) > 0.01)
      problems.push({ what: 'مجموع الدفعات ' + ar(Math.round(totals.raw * 10) / 10) + '٪',
                      detail: 'يجب أن يكون ١٠٠٪' });

    const fee = String(this.ctx.fields.costnumber || '');
    if (fee && fee.indexOf('{{') < 0) {
      const spelled = V.num.spell(fee);
      const shown = String(this.ctx.fields.costwritten || '');
      if (shown && shown.indexOf('{{') < 0 && shown.trim() !== spelled)
        problems.push({ what: 'المبلغ بالحروف لا يطابق الرقم',
                        detail: 'الرقم يقول: ' + spelled });
    }

    /* A warning, not a blocker, because presend.py treats it as one. The
     * two paths must not disagree about what stops a proposal: a job the
     * PowerPoint would let out cannot be one this refuses to print. */
    const noDuration = this.ctx.phases()
      .filter(r => r.no != null && !r.duration_days).map(r => (r.code || '').trim());
    if (noDuration.length)
      estimates.push({ what: 'مراحل بلا مدة: ' + noDuration.join('، '),
                       detail: 'العميل يقرأها كعمل بلا تاريخ انتهاء' });

    /* A scope still promising something slide 8 marks N/A is a contract
     * that says two different things, and it gets read the other way. */
    const sold = new Set(this.ctx.services().filter(s => s.included).map(s => s.id));
    const scopeText = this.ctx.c('scope').lines.map(l => l.t).join(' ');
    this.ctx.services().forEach(s => {
      if (!sold.has(s.id) && s.ar && scopeText.indexOf(s.ar) >= 0)
        problems.push({ what: 'نطاق العمل ما زال يعد بـ «' + s.ar + '»',
                        detail: 'وصفحة ٨ تضعها غير مشمولة' });
    });

    if (fee && fee.indexOf('{{') < 0)
      ok.push({ what: 'الأتعاب  ' + fee + ' ريال',
                detail: this.ctx.fields.costwritten || '' });
    ok.push({ what: 'الخدمات  ' + ar(sold.size) + ' من ' +
                    ar(this.ctx.services().length) });
    ok.push({ what: 'المدة  ' + ar(Math.round(this.ctx.timelinePlan().total_days)) +
                    ' يوماً' });
    const client = [this.ctx.field('name_title_ar'), this.ctx.field('firstname_ar'),
                    this.ctx.field('lastname_ar')].join(' ');
    if (client.indexOf('{{') < 0) ok.push({ what: 'العميل  ' + client });
    const proj = String(this.ctx.field('project_type_ar'));
    if (proj.indexOf('{{') < 0)
      ok.push({ what: 'المشروع  ' + proj + ' · ' + this.ctx.field('city_ar') });

    const section = (title, rows, cls, mark) => {
      if (!rows.length) return;
      const h = V.el('h3'); h.textContent = title;
      host.appendChild(h);
      rows.forEach(r => {
        const row = V.el('div', 'chk-row ' + cls);
        const m = V.el('div', 'mark'); m.textContent = mark;
        const w = V.el('div', 'what');
        w.appendChild(document.createTextNode(r.what));
        if (r.detail) {
          const d = V.el('div', 'detail'); d.textContent = r.detail;
          w.appendChild(d);
        }
        const where = V.el('div', 'where');
        where.textContent = r.where ? 'صفحة ' + ar(r.where) : '';
        if (r.where) {
          where.style.cursor = 'pointer';
          where.addEventListener('click', () => {
            this.closeReview(); this.show(r.where);
          });
        }
        row.appendChild(m); row.appendChild(w); row.appendChild(where);
        host.appendChild(row);
      });
    };

    section('ناقص، لا يمكن الإرسال قبل تعبئته', missing, 'miss', '✕');
    section('مشاكل', problems, 'miss', '✕');
    section('قيم تقديرية', estimates, 'est', '⚠');
    section('تم', ok, 'ok', '✓');

    if (!missing.length && !problems.length && !estimates.length) {
      const p = V.el('p', 'note');
      p.style.color = '#93d39b';
      p.textContent = 'لا يوجد ما يمنع الإرسال. اقرأ الصفحات مرة أخيرة قبل أن ترسل.';
      host.appendChild(p);
    }

    const blocked = missing.length > 0 || problems.length > 0;
    const pdf = document.getElementById('btn-pdf');
    const note = document.getElementById('pdf-note');
    pdf.disabled = blocked;

    if (blocked) {
      note.textContent = 'عبّئ الصفوف المعلَّمة ✕ أولاً.';
      note.style.color = '#ff8f8f';
    } else if (estimates.length) {
      /* An estimate that reads correctly is indistinguishable from a real
       * value three days later, so sending one has to be a decision. */
      note.textContent = '';
      note.style.color = '';
      const ack = V.el('label', 'est');
      ack.style.justifyContent = 'center';
      const cb = V.el('input'); cb.type = 'checkbox';
      const t = V.el('span');
      t.textContent = 'أعلم أن العرض يحتوي ' + ar(estimates.length) +
                      ' قيمة تقديرية غير مؤكدة';
      ack.appendChild(cb); ack.appendChild(t);
      note.appendChild(ack);
      pdf.disabled = true;
      cb.addEventListener('change', () => { pdf.disabled = !cb.checked; });
    } else {
      note.textContent = 'يفتح نافذة الطباعة. اختر «حفظ كـ PDF».';
      note.style.color = '';
    }

    document.getElementById('review').hidden = false;
  }

  closeReview() { document.getElementById('review').hidden = true; }

  /* A page turn on a phone means the next thing to type, so the fields come
   * back with it. On a wide screen nothing is hidden and this is just show. */
  step(by) {
    this.menu(false);
    this.show(this.page + by);
    if (document.body.classList.contains('show-page')) this.showPage(false);
  }

  /* ---- buttons ------------------------------------------------------- */

  wire() {
    const on = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn);

    on('btn-prev', 'click', () => this.step(-1));
    on('btn-next', 'click', () => this.step(1));
    on('btn-review', 'click', () => this.review());


    on('btn-close-review', 'click', () => this.closeReview());
    on('btn-pdf', 'click', () => { this.closeReview(); window.print(); });

    const zoom = document.getElementById('zoom');
    zoom.addEventListener('input', () => {
      this.zoomPct = +zoom.value;
      this.setZoom(this.zoomPct);
    });
    window.addEventListener('resize', () => {
      this.syncBands();
      if (!this.zoomPct) this.fit();
    });

    /* ---- narrow screens ---- */

    on('btn-menu', 'click', () => this.menu());
    on('scrim', 'click', () => this.menu(false));
    on('drawer-x', 'click', () => this.menu(false));
    on('tab-form', 'click', () => this.showPage(false));
    on('tab-page', 'click', () => this.showPage(true));

    /* Anything in the drawer either opens a window of its own or changes
     * something you then want to look at, so the drawer gets out of the
     * way once it has been used. */
    ['btn-review', 'btn-save', 'btn-open'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => this.menu(false));
    });

    /* Escape closes whatever is on top, nearest first. */
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (document.body.classList.contains('menu-open')) this.menu(false);
      else if (!document.getElementById('review').hidden) this.closeReview();
    });

    /* Turning a phone on its side changes both bands and the fit, and the
     * new size is not readable until the browser has settled. */
    window.addEventListener('orientationchange', () => {
      setTimeout(() => { this.syncBands(); if (!this.zoomPct) this.fit(); }, 250);
    });

    /* Only the page on screen gets its adjust() run, because that is when a
     * page can be measured. Printing puts all fifteen on paper at once, so
     * every one of them has to be adjusted first: without this, page 13
     * printed its closing line on top of the footnote. */
    const adjustAll = () => {
      this.stage.querySelectorAll('.page').forEach(p => p.classList.add('current'));
      this.manifest.forEach((m, i) => {
        const mod = V.slides[m.module];
        if (mod && mod.adjust)
          mod.adjust(this.ctx, document.getElementById('page-' + (i + 1)));
      });
      this.stage.querySelectorAll('.page').forEach((p, i) =>
        p.classList.toggle('current', i + 1 === this.page));
    };
    window.addEventListener('beforeprint', adjustAll);
    /* headless printing never fires beforeprint, so do it once on load too */
    adjustAll();

    document.addEventListener('keydown', e => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowRight') this.show(this.page - 1);   /* rtl: right is back */
      if (e.key === 'ArrowLeft') this.show(this.page + 1);
      if (e.key === 'Escape') this.closeReview();
    });

    on('btn-save', 'click', () => {
      const out = JSON.parse(JSON.stringify(this.job));
      /* costwritten and spatialneeds are worked out, so they go back as
       * "auto" rather than as a copy that can go stale */
      if (out.fields) {
        if (this.ctx.fields.costnumber && out.fields.costwritten === undefined)
          out.fields.costwritten = 'auto';
        if (out.fields.spatialneeds === undefined) out.fields.spatialneeds = 'auto';
      }
      const name = String(this.ctx.field('tfp_number') || 'VADO-TFP')
        .replace(/[^\w.-]+/g, '-');
      const blob = new Blob([JSON.stringify(out, null, 2)],
                            { type: 'application/json' });
      const a = V.el('a');
      a.href = URL.createObjectURL(blob);
      a.download = name + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    const file = document.getElementById('file-open');
    on('btn-open', 'click', () => file.click());
    file.addEventListener('change', () => {
      const f = file.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          this.ctx.job = JSON.parse(fr.result);
          this.changed();
        } catch (e) {
          alert('هذا الملف ليس ملف عرض: ' + e.message);
        }
      };
      fr.readAsText(f);
    });

    on('btn-reset', 'click', () => {
      if (!confirm('تمسح كل ما كتبته وتبدأ من جديد؟')) return;
      localStorage.removeItem(STORE);
      localStorage.removeItem(AT);
      this.ctx.job = {};
      this.page = 1;
      this.changed();
    });
  }
};

/* The name of each page, and any control that belongs to it rather than to
 * a single value. Keyed by slide module, so a reordered deck follows. */
V.PAGE_NAMES = {
  s01_cover: 'الغلاف', s02_contents: 'المحتوى', s03_intro: 'المقدمة',
  s04_project: 'عن المشروع', s05_spatial: 'المتطلبات المساحية',
  s06_scope: 'نطاق العمل', s08_services: 'الخدمات المشمولة',
  s09_phases: 'المراحل والمخرجات', s10_method: 'منهجية العمل',
  s11_timeline: 'الخط الزمني', s12_financial: 'العرض المالي',
  s13_agreement: 'الاتفاقية', s14_contact: 'معلومات التواصل',
  s15_closing: 'الختام',
};

/* Pages whose values are worth keeping and reusing. Page 4 first: the
 * Balady limits and the plot details repeat across a district. Add a module
 * here and its rail grows a template block. */
/* The marks a bar can carry, named by the chart's own legend rather than by
 * a second list here. Rename one in content.json and the picker follows. */
V.markerNames = ctx => {
  const out = {};
  ctx.c('timeline', 'gantt').legend.forEach(e => {
    if (ctx.geo('timeline', 'style', 'markers')[e.kind]) out[e.kind] = e.label;
  });
  return out;
};

V.TEMPLATE_PAGES = {
  s04_project: true,
};

/* Pages whose control belongs above the fields rather than under them. */
V.CONTROLS_FIRST = {
  s04_project: true,
};

V.PAGE_CONTROLS = {
  s04_project: 'map',
  s05_spatial: 'brief',
  s08_services: 'services',
  s11_timeline: 'durations',
  s12_financial: 'money',
};

document.addEventListener('DOMContentLoaded', () => {
  window.VADO_APP = new V.App(window.VADO);
});
