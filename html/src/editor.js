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

/* Fields with a short list of ready answers and a way out to typing your
 * own. A closed list above refuses anything not on it; an open list only
 * saves the typing on the answer that comes up nine times in ten. */
const OPEN_LIST = {
  name_title_ar: ['الأستاذ', 'الأستاذة', 'الأمير', 'الأميرة',
                  'الدكتور', 'الدكتورة', 'المهندس', 'المهندسة'],
};
/* The sentinel value for «أخرى» on an open list. Two underscores each
 * side so it can never be mistaken for an answer somebody typed. */
const OTHER = '__other__';

/* Values the document prints only when they are given. A private client has
 * no company, so an empty box here is an answer rather than a gap: it is
 * offered, it is never counted as missing, and the page draws nothing where
 * it would have gone. */
const OPTIONAL = new Set(['client_company_ar']);

/* Values a page's own control owns, so the panel draws no box of its own
 * for them. The four shares are typed as percentages on the payment rows
 * on page 12 now, and a second set of boxes saying the same thing is a
 * second place to change them and a second place for them to disagree.
 * They are still named in V.PAGE_FIELDS, because a value nobody can reach
 * is the thing the self-check exists to catch, and قبل الإرسال reads every
 * payment back with its share and its amount. */
const BY_CONTROL = new Set(['p1', 'p2', 'p3', 'p4']);

/* The one option on the architecture zone list that says the classification
 * does not apply. Choosing it answers the level as well, because a plot
 * outside the classification has no level inside it either. */
const ARCH_NA = 'لاينطبق/ مستثنى';

/* The date, written the way every proposal already on file writes it. */
const MONTHS_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
                   'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const fmtDate = d => String(d.getDate()).padStart(2, '0') + ' ' +
                     MONTHS_EN[d.getMonth()] + ' ' + d.getFullYear();
const isoOf = d => d.getFullYear() + '-' +
                   String(d.getMonth() + 1).padStart(2, '0') + '-' +
                   String(d.getDate()).padStart(2, '0');
const dayFrom = n => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);      /* midday, so a timezone shift cannot move the day */
  d.setDate(d.getDate() + n);
  return d;
};

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
 * offers the تقريبي mark. It was on the fifteen Balady fields alone, which
 * left the coordinates, the national address, the map link and both
 * architecture lists with no way to be marked or unmarked by hand, even
 * though jobs arrive with exactly those flagged. */
const ESTIMATABLE = new Set([3, 4, 5, 6]);

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const ar = n => String(n).replace(/[0-9]/g, d => AR_DIGITS[+d]);

/* Arabic counts a thing four different ways: one, two, three to ten, and
 * eleven up. «٣ قيمة» is wrong in the same way «3 value» is, and this
 * screen says these numbers to somebody who reads Arabic. The caller gives
 * the whole phrase for one and for two, because the words after the noun
 * have to agree with it as well. */
const arCount = (n, one, two, few, many) =>
  n === 1 ? one :
  n === 2 ? two :
  n <= 10 ? ar(n) + ' ' + few : ar(n) + ' ' + many;

V.App = class {
  constructor(data) {
    this.ctx = new V.Ctx(data);
    this.ctx.onBind = (span, name) => this.bind(span, name);
    /* A page that can only tell how many pages it needs once it has been
     * measured asks for the deck to be drawn again. Page 9 is the case:
     * its rows are declared at the heights the PowerPoint's fonts give
     * them, and Cairo is wider. Deferred, because the ask arrives from
     * inside a render, and guarded, so two pages asking at once cost one
     * redraw rather than two. */
    this.ctx.relayout = () => {
      if (this._relayout) return;
      this._relayout = true;
      setTimeout(() => {
        this._relayout = false;
        this.render();
        this.show(this.page);
      }, 0);
    };
    this.stage = document.getElementById('stage');
    this.restore();
    this.render();
    this.page = this.rememberedPage();
    this.wire();
    this.show(this.page);
    this.loadTemplates();          /* the office's list, fetched in the background */

    /* Everything a page works out for itself is worked out from a
     * measurement, and the first measurement is taken while the web fonts
     * are still arriving. A fallback face is narrower than Cairo, so page 9
     * measured a table twenty points shorter than the one it would draw and
     * left its legend sitting on the last two rows. Measure again once the
     * real faces are in. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => this.show(this.page));
    }
  }

  get job() { return this.ctx.job; }

  /* ---- the model --------------------------------------------------- */

  set(name, value) {
    this.draft = null;
    const f = this.job.fields || (this.job.fields = {});
    if (value === '' || value == null) delete f[name];
    else f[name] = value;
    /* A plot outside the Saudi architecture classification has no level
     * inside it either, so the one answer that says «does not apply»
     * answers both boxes. Every other zone leaves the level alone: which
     * of the three levels a job is built to is a design decision, and
     * guessing it would be the tool deciding it. */
    if (name === 'ksaarchzone' && value === ARCH_NA) f.ksaarchlevel = ARCH_NA;
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
      (V.PAGE_FIELDS[m.module] || []).forEach(name => {
        if (seen.indexOf(name) < 0) seen.push(name);
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
    /* The rail counts this value the moment it is typed, not when the box
     * is left. A page that reads ناقص beside a value already on screen is
     * a tool arguing with itself. */
    span.addEventListener('input', () => {
      this.draft = { name: name, value: span.textContent.replace(/[‎‏]/g, '') };
      this.buildRail();
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
    this.draft = null;
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
    this.buildRail();
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
      !DERIVED[f] && !OPTIONAL.has(f) && !BY_CONTROL.has(f) &&
      String(this.ctx.field(f)).indexOf('{{') === 0);
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

    const names = this.onPage[this.page - 1].filter(f => !BY_CONTROL.has(f));
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
              note.textContent = 'علّم أي قيمة لم تأتِ من المصدر بعلامة تقريبي.';
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

  /* Every field that reaches a page, worked out from the pages themselves.
   *
   * It used to be every field content.json declares, which counted six the
   * document no longer prints: the Latin name, city, district and project
   * type belonged to the English block on the cover, and that block is
   * gone until the deck gains a real English edition. Counting them asked
   * for values that land nowhere and left the meter short of full on a
   * proposal that was finished. */
  onAPage() {
    return Object.keys(this.pageOf).filter(k =>
      k !== '_doc' && !DERIVED[k] && !OPTIONAL.has(k) && !BY_CONTROL.has(k));
  }

  total() { return this.onAPage().length; }

  countFilled() {
    return this.onAPage().filter(k =>
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
    /* One value can land on more than one page: the plot number is printed
     * on page 4 and again in the heading of page 5's brief. It is one box,
     * so page 5 opens already carrying what page 4 was told, and typing it
     * here changes both. Saying so out loud is the whole point: a box that
     * silently edits another page is the kind of surprise that gets a
     * proposal sent with two different plot numbers on it. */
    if (OPTIONAL.has(name)) {
      const opt = V.el('span', 'src');
      opt.textContent = 'اختياري';
      lab.appendChild(opt);
    }
    const from = this.pageOf[name];
    if (from && from !== this.page) {
      const echo = V.el('span', 'src');
      echo.textContent = 'نفس قيمة صفحة ' + ar(from);
      lab.appendChild(echo);
    }
    wrap.appendChild(lab);

    if (DERIVED[name]) {
      const p = V.el('p', 'note');
      const v = String(this.ctx.field(name));
      p.textContent = (v.indexOf('{{') === 0 ? '—' : v) + ' · ' + DERIVED[name];
      wrap.appendChild(p);
      return wrap;
    }

    const cur = String(this.ctx.field(name));
    const value = cur.indexOf('{{') === 0 ? '' : cur;

    /* Four kinds of answer. The first three save typing on the values that
     * repeat; the fourth is a plain box. Each returns the control to put in
     * the row and the element the rail should put the cursor in. */
    let input, control;
    if (name === 'date') {
      [control, input] = this.dateControl(name, value);
    } else if (OPEN_LIST[name]) {
      [control, input] = this.openListControl(name, value, meta);
    } else if (LIST_FOR[name]) {
      control = input = this.closedListControl(name, value);
    } else {
      control = input = this.textControl(name, value, meta);
    }
    input.dataset.field = name;

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
    wrap.appendChild(control);

    /* A value typed to make the page reviewable has to be marked as one.
     * The sentence explaining it is said once in the group heading; here it
     * is a single word. */
    if (ESTIMATABLE.has(meta.group)) {
      const est = V.el('label', 'est');
      const cb = V.el('input'); cb.type = 'checkbox';
      cb.checked = this.ctx.estimates.indexOf(name) >= 0;
      cb.addEventListener('change', () => this.markEstimate(name, cb.checked));
      const t = V.el('span'); t.textContent = 'تقريبي';
      est.appendChild(cb); est.appendChild(t);
      wrap.appendChild(est);
    }
    return wrap;
  }

  /* ---- the four kinds of answer box --------------------------------- */

  /* A plain box. Every value that is not on a list ends up here. */
  textControl(name, value, meta) {
    const input = V.el('input');
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
    input.value = value;
    input.addEventListener('change', () => this.set(name, input.value.trim()));
    input.addEventListener('input', () => {
      this.draft = { name: name, value: input.value };
      this.buildRail();
    });
    return input;
  }

  /* A list nothing may leave: tools/presend.py rejects a value that is not
   * on it, so a value the check would reject cannot be typed here. */
  closedListControl(name, value) {
    const sel = V.el('select');
    const blank = V.el('option'); blank.value = ''; blank.textContent = '— اختر —';
    sel.appendChild(blank);
    (this.ctx.content.lists[LIST_FOR[name]] || []).forEach(v => {
      const o = V.el('option'); o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
    sel.value = value;
    sel.addEventListener('change', () => this.set(name, sel.value.trim()));
    return sel;
  }

  /* A list of ready answers with a way out. The box only appears once
   * «أخرى» is chosen, or when the value already stored is not on the list,
   * so the common case is one press and the rare one still works. */
  openListControl(name, value, meta) {
    const options = OPEN_LIST[name];
    const custom = !!value && options.indexOf(value) < 0;

    const box = V.el('div', 'pick');
    const sel = V.el('select');
    const blank = V.el('option'); blank.value = ''; blank.textContent = '— اختر —';
    sel.appendChild(blank);
    options.forEach(v => {
      const o = V.el('option'); o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
    const other = V.el('option');
    other.value = OTHER; other.textContent = 'أخرى، أكتبها بنفسي';
    sel.appendChild(other);
    sel.value = custom ? OTHER : value;

    const input = this.textControl(name, custom ? value : '', meta);
    input.hidden = !custom;

    sel.addEventListener('change', () => {
      if (sel.value === OTHER) {
        /* Nothing is written yet: «أخرى» is a question, not an answer.
         * Committing here would redraw the panel and take this box away
         * before anyone could type in it. */
        input.hidden = false;
        input.focus();
        return;
      }
      this.set(name, sel.value.trim());
    });

    box.appendChild(sel);
    box.appendChild(input);
    return [box, input];
  }

  /* The date. اليوم and غداً are the two answers a proposal actually
   * carries; anything else opens a calendar. What is stored is the written
   * form every proposal already on file uses, so nothing downstream has to
   * learn a second one. */
  dateControl(name, value) {
    const today = fmtDate(dayFrom(0)), tomorrow = fmtDate(dayFrom(1));
    const READY = [['', '— اختر —'], [today, 'اليوم  ·  ' + today],
                   [tomorrow, 'غداً  ·  ' + tomorrow], [OTHER, 'تاريخ آخر']];
    const custom = !!value && value !== today && value !== tomorrow;

    const box = V.el('div', 'pick');
    const sel = V.el('select');
    READY.forEach(([v, label]) => {
      const o = V.el('option'); o.value = v; o.textContent = label;
      sel.appendChild(o);
    });
    sel.value = custom ? OTHER : value;

    const day = V.el('input');
    day.type = 'date';
    day.classList.add('ltr');
    day.hidden = !custom;
    /* The stored form is written for a reader, so it has to be read back
     * into the calendar's own. Date.parse understands "23 AUG 2026". */
    if (custom) {
      const d = new Date(value);
      if (!isNaN(d)) day.value = isoOf(d);
    }

    sel.addEventListener('change', () => {
      if (sel.value === OTHER) {
        day.hidden = false;
        /* showPicker is not everywhere, and a browser without it still
         * gets a focused box the person can type into. */
        try { day.showPicker(); } catch (e) { day.focus(); }
        return;
      }
      this.set(name, sel.value);
    });
    day.addEventListener('change', () => {
      if (!day.value) { this.set(name, ''); return; }
      /* An ISO date read without a time is UTC midnight, which is the day
       * before in every timezone west of Greenwich. Split it instead. */
      const [y, m, dd] = day.value.split('-').map(Number);
      this.set(name, fmtDate(new Date(y, m - 1, dd)));
    });

    box.appendChild(sel);
    box.appendChild(day);
    return [box, day];
  }

  highlight(name, on) {
    const pg = document.getElementById('page-' + this.page);
    if (!pg) return;
    pg.querySelectorAll('[data-field="' + name + '"]').forEach(el =>
      el.classList.toggle('field-lit', on));
  }

  /* ---- the rail: what this page holds and what it still wants -------- */

  /* The panel is where a value is typed. This is where it is ticked off,
   * and it carries the value itself, because «المساحة ✓» and
   * «المساحة ٥١٢ م²» are not the same reassurance. It redraws on
   * every keystroke, so ناقص never argues with what is already on screen.
   */
  buildRail() {
    const host = document.getElementById('rail-status');
    if (!host) return;
    host.textContent = '';

    const m = this.manifest[this.page - 1];
    const head = V.el('div', 'rail-where');
    const nm = V.el('b');
    nm.textContent = V.PAGE_NAMES[m.module] || '';
    const wh = V.el('span');
    wh.textContent = 'صفحة ' + ar(this.page);
    head.appendChild(nm); head.appendChild(wh);
    host.appendChild(head);

    /* A worked-out value is nobody's job to fill, so it is neither
     * complete nor missing. The panel already explains it. */
    const names = this.onPage[this.page - 1]
      .filter(f => !DERIVED[f] && !BY_CONTROL.has(f));
    const done = [], left = [];
    names.forEach(name => {
      const v = this.value(name);
      /* An optional value left empty belongs in neither list. It is not
       * complete, because nothing was said; it is not missing, because
       * nothing has to be. */
      if (v === '' && OPTIONAL.has(name)) return;
      (v === '' ? left : done).push({ name: name, v: v });
    });

    const control = V.CONTROL_NAMES[V.PAGE_CONTROLS[m.module]];

    if (!names.length && !control) {
      const rest = V.el('p', 'rail-rest');
      rest.textContent = 'هذه الصفحة ثابتة. لا تحتاج منك شيئاً.';
      host.appendChild(rest);
      return;
    }

    const section = (title, rows, cls) => {
      if (!rows.length) return;
      const h = V.el('div', 'rail-sec');
      const t = V.el('span'); t.textContent = title;
      const c = V.el('span', 'rail-n'); c.textContent = ar(rows.length);
      h.appendChild(t); h.appendChild(c);
      host.appendChild(h);
      rows.forEach(r => host.appendChild(this.railRow(r, cls)));
    };
    section('مكتمل', done, 'ok');
    section('ناقص', left, 'miss');

    /* Five pages carry something that is not a text box. Calling those
     * «ثابتة» because they hold no field would be a lie: page 8 sells
     * the services and page 12 splits the fee. */
    if (control) {
      const also = V.el('p', 'rail-also');
      also.textContent = names.length
        ? 'وفيها أيضاً ' + control + '، تُضبط من اللوحة.'
        : 'لا قيم تُكتب هنا. اضبط ' + control + ' من اللوحة.';
      host.appendChild(also);
    }
  }

  /* What the box holds right now: the draft while it is being typed, the
   * stored value once it is committed, '' when it is neither. */
  value(name) {
    if (this.draft && this.draft.name === name) return this.draft.value.trim();
    const v = String(this.ctx.field(name));
    return v.indexOf('{{') === 0 ? '' : v;
  }

  railRow(r, cls) {
    const est = this.ctx.estimates.indexOf(r.name) >= 0;
    const row = V.el('button', 'rl ' + (cls === 'ok' && est ? 'est' : cls));
    row.type = 'button';

    const mark = V.el('span', 'rl-mark');
    mark.textContent = cls === 'miss' ? '✕' : (est ? '⚠' : '✓');
    const name = V.el('span', 'rl-name');
    name.textContent = V.label(r.name).ar;
    row.appendChild(mark); row.appendChild(name);

    if (r.v) {
      const val = V.el('span', 'rl-val');
      /* An estimate says so in the space the value would take. The value
       * is on the page beside it and in the box that holds it, so the
       * warning is the thing worth the width. */
      val.textContent = est ? 'تقريبي' : r.v;
      if (!est && LTR.has(r.name)) val.classList.add('ltr');
      row.title = V.label(r.name).ar + '  ·  ' + r.v;
      row.appendChild(val);
    }

    /* On mousedown, not on click. Leaving a box with a changed value
     * commits it, and a commit redraws this list, so the row the press
     * started on is gone before the mouse comes back up and the click
     * never happens. The press is the part that survives.
     *
     * `detail` is 0 only for a click the keyboard raised, which has no
     * mousedown of its own to catch. */
    row.addEventListener('mousedown', () => this.reveal(r.name));
    row.addEventListener('click', e => { if (!e.detail) this.reveal(r.name); });
    row.addEventListener('mouseenter', () => {
      this.railLit = r.name;
      this.highlight(r.name, true);
    });
    row.addEventListener('mouseleave', () => this.highlight(r.name, false));
    return row;
  }

  /* A row is the way back to the box that fills it. On a narrow screen the
   * rail is a drawer over the panel, so it closes first or it would hide
   * the box it just put the cursor in. */
  reveal(name) {
    this.menu(false);
    /* Wait for the press to finish what it started. Leaving the box being
     * typed in commits it, and that rebuilds the whole panel, so the box
     * to put the cursor in is not the one on screen now. */
    setTimeout(() => {
      const box = document.querySelector('#page-form [data-field="' + name + '"]');
      if (!box) return;
      box.scrollIntoView({ block: 'center', behavior: 'smooth' });
      box.focus();
    }, 0);
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
    /* Every press here acts on the brief as it stands at that instant, not
     * on the copy this panel was drawn from.
     *
     * A commit redraws all fifteen pages and rebuilds the panel, so a
     * button pressed while a box still has focus is racing its own blur:
     * the blur commits the typing, the panel is rebuilt, and the node the
     * press started on is gone before the mouse comes back up. So a press
     * acts on mousedown, lets go of whatever had focus first so the typing
     * is not lost, and then reads the brief back fresh. Without that
     * re-read, moving a floor would write back the copy taken before the
     * blur and quietly undo the words just typed into it.
     */
    const edit = fn => {
      const live = document.activeElement;
      if (live && live.blur) live.blur();
      setTimeout(() => {
        const groups = JSON.parse(JSON.stringify(this.ctx.spatial().groups || []));
        if (fn(groups) === false) return;
        this.job.spatial = Object.assign({}, this.job.spatial, { groups });
        this.changed();
      }, 0);
    };

    /* A press, not a click: see edit() above. `detail` is 0 only for the
     * click a keyboard raises, which has no mousedown of its own to catch. */
    const press = (btn, fn) => {
      btn.addEventListener('mousedown', e => { e.preventDefault(); fn(); });
      btn.addEventListener('click', e => { if (!e.detail) fn(); });
      return btn;
    };

    /* Deleting a floor takes its rooms with it, so it asks first. */
    const deleter = (title, fn) => {
      const b = V.el('button', 'mini danger');
      b.textContent = '×';
      b.title = title;
      b.type = 'button';
      let armed = false;
      press(b, () => {
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

    /* Up and down, one step at a time. Two arrows beat dragging here: the
     * panel is a narrow column that scrolls, and a drag that has to cross
     * its own scroll is the one gesture a mouse cannot do smoothly. An
     * arrow at the end of its list is dead rather than hidden, so a row
     * never changes shape as it moves. */
    const mover = (what, at, len, apply) => {
      const box = V.el('span', 'mv');
      [['▲', -1, 'ارفع ' + what], ['▼', 1, 'أنزل ' + what]].forEach(([g, step, title]) => {
        const b = V.el('button', 'mini mv-b');
        b.type = 'button';
        b.textContent = g;
        b.title = title;
        const to = at + step;
        if (to < 0 || to >= len) b.disabled = true;
        else press(b, () => apply(to));
        box.appendChild(b);
      });
      return box;
    };

    /* Move one entry of a list to another place in it. */
    const shift = (list, from, to) => { list.splice(to, 0, list.splice(from, 1)[0]); };

    const labelled = (text, control, extra) => {
      const wrap = V.el('label', 'sub-f');
      const cap = V.el('span'); cap.textContent = text;
      if (extra) cap.appendChild(extra);
      wrap.appendChild(cap); wrap.appendChild(control);
      return wrap;
    };

    const h = V.el('h3'); h.textContent = 'الأدوار والمساحات';
    host.appendChild(h);
    const sub = V.el('p', 'group-note');
    sub.textContent = 'ملخص صفحة ٤ يُبنى من هذه الأدوار، فأي دور تضيفه يظهر هناك. ' +
      'الأسهم ترتب ما تراه على الصفحة، من أعلى إلى أسفل.';
    host.appendChild(sub);

    const groups = this.ctx.spatial().groups || [];

    groups.forEach((g, gi) => {
      const card = V.el('div', 'grp');

      const head = V.el('div', 'grp-head');
      const ti = V.el('input');
      ti.type = 'text'; ti.value = g.title_ar || '';
      ti.placeholder = 'اسم المجموعة';
      ti.addEventListener('change',
        () => edit(gs => { gs[gi].title_ar = ti.value; }));
      head.appendChild(ti);
      head.appendChild(mover('المجموعة', gi, groups.length,
        to => edit(gs => shift(gs, gi, to))));
      head.appendChild(deleter('احذف المجموعة وكل ما فيها',
        () => edit(gs => { gs.splice(gi, 1); })));
      card.appendChild(head);

      const body = V.el('div', 'grp-body');
      const blocks = g.blocks || [], items = g.items || [];

      blocks.forEach((b, bi) => {
        const blk = V.el('div', 'blk');
        const nameRow = V.el('div', 'row');
        const nm = V.el('input');
        nm.type = 'text'; nm.value = b.name_ar || '';
        nm.placeholder = 'مثال: الدور الأرضي';
        nm.addEventListener('change',
          () => edit(gs => { gs[gi].blocks[bi].name_ar = nm.value; }));
        nameRow.appendChild(nm);
        nameRow.appendChild(mover('الدور', bi, blocks.length,
          to => edit(gs => shift(gs[gi].blocks, bi, to))));
        nameRow.appendChild(deleter('احذف الدور وما فيه',
          () => edit(gs => { gs[gi].blocks.splice(bi, 1); })));
        blk.appendChild(labelled('الدور', nameRow));

        /* a box you can read: it wraps and grows instead of scrolling
         * sideways past the edge of the panel */
        const ct = V.el('textarea');
        ct.rows = 2;
        ct.value = b.contents_ar || '';
        ct.placeholder = 'مجلس , صالة معيشة , مطبخ';
        ct.addEventListener('change',
          () => edit(gs => { gs[gi].blocks[bi].contents_ar = ct.value; }));
        blk.appendChild(labelled('ما فيه', ct));

        body.appendChild(blk);
      });

      items.forEach((item, ii) => {
        const row = V.el('div', 'row');
        const inp = V.el('input');
        inp.type = 'text'; inp.value = item;
        inp.placeholder = 'مثال: موقف 3 سيارات';
        inp.addEventListener('change',
          () => edit(gs => { gs[gi].items[ii] = inp.value; }));
        row.appendChild(inp);
        row.appendChild(mover('العنصر', ii, items.length,
          to => edit(gs => shift(gs[gi].items, ii, to))));
        row.appendChild(deleter('احذف العنصر',
          () => edit(gs => { gs[gi].items.splice(ii, 1); })));
        body.appendChild(labelled('عنصر', row));
      });

      const add = V.el('div', 'row add');
      [['+ دور', gs => (gs[gi].blocks || (gs[gi].blocks = []))
          .push({ name_ar: '', contents_ar: '' })],
       ['+ عنصر', gs => (gs[gi].items || (gs[gi].items = [])).push('')]]
        .forEach(([txt, fn]) => {
          const b = V.el('button', 'mini');
          b.type = 'button';
          b.textContent = txt;
          press(b, () => edit(fn));
          add.appendChild(b);
        });
      body.appendChild(add);

      card.appendChild(body);
      host.appendChild(card);
    });

    const addGroup = V.el('button', 'mini wide');
    addGroup.type = 'button';
    addGroup.textContent = '+ مجموعة جديدة';
    press(addGroup, () => edit(gs => { gs.push({ title_ar: '', blocks: [] }); }));
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

      /* Where this phase lands, as two more boxes rather than as a
       * sentence to read and not be able to argue with.
       *
       * The three numbers describe one bar, so any one of them fixes the
       * other two. Type a duration and the end moves. Type a start and the
       * whole bar moves there and stays, whatever the after/overlap rules
       * would have said, and every phase that follows this one follows it
       * to its new end. Type an end and the duration stretches to reach it.
       *
       * A phase with continuation rows lasts longer than its own row says,
       * so the end box works against the WHOLE phase and gives its own row
       * whatever is left after the continuations are counted. */
      if (isPhase && parent) {
        /* `parent` is the one variable walked down the whole list, so a
         * handler that read it later would read whichever phase the walk
         * finished on. Hold this phase in a name of its own: without it
         * every end box on the page edited the last phase in the deck. */
        const lane = parent;
        const span = V.el('div', 'span-row');
        const cont = lane.days - (row.duration_days || 0);

        const dayBox = (cap, value, onSet) => {
          const lab = V.el('label', 'sub-f day');
          const c = V.el('span'); c.textContent = cap;
          const inp = V.el('input');
          inp.type = 'number'; inp.min = '0'; inp.classList.add('ltr');
          inp.value = value;
          inp.addEventListener('change', () => onSet(inp.value));
          lab.appendChild(c); lab.appendChild(inp);
          span.appendChild(lab);
        };

        dayBox('من اليوم', Math.round(lane.start_day), v => {
          const st = this.job.starts || (this.job.starts = {});
          if (v === '') delete st[row.id];
          else st[row.id] = Math.max(0, parseInt(v, 10) || 0);
          this.changed();
        });
        dayBox('إلى اليوم', Math.round(lane.end_day), v => {
          const end = Math.max(lane.start_day, parseInt(v, 10) || 0);
          const d = this.job.durations || (this.job.durations = {});
          d[row.id] = Math.max(0, Math.round(end - lane.start_day - cont));
          this.changed();
        });
        wrap.appendChild(span);

        if (cont) {
          const whole = V.el('p', 'lane-note');
          whole.textContent = ar(lane.days) + ' يوماً بالكامل، منها ' +
            ar(cont) + ' في الصفوف تحتها.';
          wrap.appendChild(whole);
        }

        if (lane.pinned) {
          const back = V.el('button', 'mini');
          back.type = 'button';
          back.textContent = 'أعِد هذه المرحلة إلى ترتيبها التلقائي';
          back.addEventListener('click', () => {
            const st = this.job.starts || {};
            delete st[row.id];
            this.changed();
          });
          wrap.appendChild(back);
        } else {
          const ov = (row.schedule || {}).overlap_days;
          if (ov) {
            const note = V.el('p', 'lane-note');
            note.textContent = 'تبدأ قبل انتهاء ' + (row.schedule.after || '') +
              ' بـ ' + ar(ov) + ' يوماً، لأنها تُقدَّم على رسومات جارية.';
            wrap.appendChild(note);
          }
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

  /* The payment schedule, built one row at a time.
   *
   * A payment is three parts and nothing else: a word saying when it falls
   * due, the event it names, and the share of the fee. The heading the
   * client reads is the first two joined, and the sentence under it is the
   * same two with the riyal amount worked out. Nothing on the page is typed
   * twice, so a payment cannot say one thing in its heading and another
   * underneath, which is how the old wording drifted: row three read
   * «اكتمال الرسوم التنفيذية» above and «اكتمال الرسومات التنفيذية» below.
   *
   * The four shares still reach p1 to p4, so the office tracker and
   * tools/presend.py find them where they always were.
   */
  money(host) {
    /* The same race the brief has: a press fires before the box's own
     * blur, so it has to let go of what has focus and then read the rows
     * back fresh, or a reorder writes back the copy taken before the
     * typing was committed. */
    const rowsNow = () => JSON.parse(JSON.stringify(this.ctx.paymentRows()))
      .map(r => {
        /* The studio's four carry «{{p1}}» as their share. Copying that
         * into the job would freeze a tag where a number belongs, so it is
         * resolved on the way in. */
        const share = this.ctx._percent(this.ctx.fill(r.pct));
        return { id: r.id, when: r.when || 'none', when_ar: r.when_ar || '',
                 event_ar: r.event_ar || '',
                 pct: share == null ? '' : String(share) };
      });

    const edit = fn => {
      const live = document.activeElement;
      if (live && live.blur) live.blur();
      setTimeout(() => {
        const rows = rowsNow();
        if (fn(rows) === false) return;
        this.job.payments = rows;
        this.changed();
      }, 0);
    };
    const press = (btn, fn) => {
      btn.addEventListener('mousedown', e => { e.preventDefault(); fn(); });
      btn.addEventListener('click', e => { if (!e.detail) fn(); });
      return btn;
    };
    const shift = (list, from, to) => { list.splice(to, 0, list.splice(from, 1)[0]); };

    const labelled = (text, control) => {
      const wrap = V.el('label', 'sub-f');
      const cap = V.el('span'); cap.textContent = text;
      wrap.appendChild(cap); wrap.appendChild(control);
      return wrap;
    };

    const mover = (at, len, apply) => {
      const box = V.el('span', 'mv');
      [['▲', -1, 'ارفع الدفعة'], ['▼', 1, 'أنزل الدفعة']].forEach(([g, step, title]) => {
        const b = V.el('button', 'mini mv-b');
        b.type = 'button'; b.textContent = g; b.title = title;
        const to = at + step;
        if (to < 0 || to >= len) b.disabled = true;
        else press(b, () => apply(to));
        box.appendChild(b);
      });
      return box;
    };

    const deleter = (at, len) => {
      const b = V.el('button', 'mini danger');
      b.type = 'button'; b.textContent = '×'; b.title = 'احذف الدفعة';
      if (len <= 1) { b.disabled = true; b.title = 'لا بد من دفعة واحدة على الأقل'; }
      else {
        let armed = false;
        press(b, () => {
          if (!armed) {
            armed = true; b.textContent = 'احذف؟'; b.classList.add('armed');
            setTimeout(() => {
              armed = false; b.textContent = '×'; b.classList.remove('armed');
            }, 4000);
            return;
          }
          edit(rows => { rows.splice(at, 1); });
        });
      }
      return b;
    };

    const h = V.el('h3'); h.textContent = 'الدفعات';
    host.appendChild(h);
    const sub = V.el('p', 'group-note');
    sub.textContent = 'كل دفعة ثلاثة أجزاء: متى تُستحق، وعلى أي حدث، وكم نسبتها. ' +
      'العنوان والجملة تحته يُبنيان منها، والمبلغ يُحسب من الأتعاب.';
    host.appendChild(sub);

    const words = this.ctx.c('financial', 'triggers');
    const CHOICES = [['adv', words.adv.ar], ['before', words.before.ar],
                     ['after', words.after.ar], ['custom', 'مخصص'],
                     ['none', 'بلا']];

    const rows = this.ctx.paymentRows();
    const shown = this.ctx.payments();
    const unit = this.ctx.c('financial', 'amount_unit_ar');

    rows.forEach((row, i) => {
      const card = V.el('div', 'grp');
      const pay = shown[i] || {};

      const head = V.el('div', 'grp-head');
      const no = V.el('span', 'pay-no');
      no.textContent = ar(i + 1);
      head.appendChild(no);

      const when = V.el('select');
      CHOICES.forEach(([v, label]) => {
        const o = V.el('option'); o.value = v; o.textContent = label;
        if (v === (row.when || 'none')) o.selected = true;
        when.appendChild(o);
      });
      when.addEventListener('change',
        () => edit(rs => { rs[i].when = when.value; }));
      head.appendChild(when);
      head.appendChild(mover(i, rows.length, to => edit(rs => shift(rs, i, to))));
      head.appendChild(deleter(i, rows.length));
      card.appendChild(head);

      const body = V.el('div', 'grp-body');

      if ((row.when || 'none') === 'custom') {
        const own = V.el('input');
        own.type = 'text'; own.value = row.when_ar || '';
        own.placeholder = 'مثال: عند';
        own.addEventListener('change',
          () => edit(rs => { rs[i].when_ar = own.value.trim(); }));
        body.appendChild(labelled('الكلمة قبل الحدث', own));
      }

      const ev = V.el('input');
      ev.type = 'text'; ev.value = row.event_ar || '';
      ev.placeholder = 'مثال: اكتمال الرسوم التنفيذية';
      ev.addEventListener('change',
        () => edit(rs => { rs[i].event_ar = ev.value.trim(); }));
      body.appendChild(labelled('الحدث', ev));

      /* The share is typed as a bare number. The sign belongs to what is
       * printed, not to what is typed: «30%» in the box invites «30%%». */
      const share = V.el('input');
      share.type = 'number'; share.min = '0'; share.max = '100'; share.step = '0.1';
      share.classList.add('ltr');
      share.value = this.ctx._percent(this.ctx.fill(row.pct)) || '';
      share.placeholder = '30';
      share.addEventListener('change',
        () => edit(rs => { rs[i].pct = share.value.trim(); }));
      body.appendChild(labelled('النسبة ٪', share));

      /* What this row costs the client, so a share changed here is not a
       * number nobody checked. */
      const money = V.el('p', 'lane-span');
      money.textContent = pay.amount
        ? pay.amount + ' ' + unit
        : 'المبلغ يظهر عند إدخال الأتعاب.';
      body.appendChild(money);

      card.appendChild(body);
      host.appendChild(card);
    });

    const add = V.el('button', 'mini wide');
    add.type = 'button';
    add.textContent = '+ دفعة';
    press(add, () => edit(rs => {
      rs.push({ id: 'pay' + (rs.length + 1), when: 'after',
                when_ar: '', event_ar: '', pct: '' });
    }));
    host.appendChild(add);

    /* The four shares are printed added up in front of the client, so they
     * have to reach the whole fee. */
    const totals = this.ctx.paymentTotals();
    const unset = shown.some(p => p.share == null);
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

    if (rows.length > 4) {
      const note = V.el('p', 'note warn-soft');
      note.textContent = 'الدفعات بعد الرابعة لا تصل إلى جدول المتابعة: ' +
        'حقوله أربعة فقط، من p1 إلى p4.';
      host.appendChild(note);
    }

    const back = V.el('button', 'mini wide');
    back.type = 'button';
    back.textContent = 'ارجع إلى دفعات المكتب الأربع';
    back.disabled = !this.job.payments;
    press(back, () => {
      if (!this.job.payments) return;
      delete this.job.payments;
      this.changed();
    });
    host.appendChild(back);
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

    /* How solid the picture is drawn. The theme fades it so the numbers
     * over it still lead, but how far is a judgement about one photograph:
     * a pale satellite view disappears at the theme's fade and a dark
     * street map still shouts through it. Live while dragging, written to
     * the job when let go, so a drag does not rebuild the deck per pixel. */
    const fade = V.el('label', 'crop');
    const fcap = V.el('span');
    const pctOf = v => ar(Math.round(v * 100)) + '٪';
    fcap.textContent = 'وضوح الصورة  ' + pctOf(this.ctx.mapOpacity());
    const frange = V.el('input');
    frange.type = 'range'; frange.min = '10'; frange.max = '100'; frange.step = '5';
    frange.value = String(Math.round(this.ctx.mapOpacity() * 100));
    const paint = () => {
      const v = +frange.value / 100;
      fcap.textContent = 'وضوح الصورة  ' + pctOf(v);
      const img = document.querySelector(
        '#page-' + this.page + ' img[style*="object-fit"]');
      if (img) img.style.opacity = v;
    };
    frange.addEventListener('input', paint);
    frange.addEventListener('change', () => {
      this.job.map_opacity = +frange.value / 100;
      paint();
      this.persist();
    });
    fade.appendChild(fcap); fade.appendChild(frange);
    host.appendChild(fade);

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
      delete this.job.map_opacity;
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

    const fields = this.onPage[this.page - 1]
      .filter(f => !DERIVED[f] && !BY_CONTROL.has(f));
    const extra = V.TEMPLATE_EXTRA[key];
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
        .some(k => (this.job.fields || {})[k] !== undefined) ||
        !!(extra && extra.busy(this));
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
      if (extra) extra.apply(this, tpl);
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
        await this.pushTemplate('put', key, name, Object.assign({
          fields: values,
          placeholders: this.ctx.estimates.filter(n => n in values),
        }, extra ? extra.grab(this) : null));
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
    warn.textContent = extra ? extra.holds(this)
      : 'يحفظ ' + ar(fields.length) +
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

  /* Only the page on screen gets its adjust() run, because that is when a
   * page can be measured. Printing puts all fifteen on paper at once, so
   * every one of them has to be adjusted first: without this, page 13
   * printed its closing line on top of the footnote.
   *
   * It answers with the pages whose content still runs off the paper after
   * every page has done what it can. Page 9 shrinks its table to fit and
   * page 13 drops its signatures to clear the contract text, but both have
   * a floor: below it the type stops being readable, and the honest answer
   * is that the page is carrying more than one sheet holds. That has to be
   * said out loud rather than discovered in the PDF.
   */
  adjustAll() {
    const pages = [...this.stage.querySelectorAll('.page')];
    pages.forEach(p => p.classList.add('current'));
    const spill = [];
    this.manifest.forEach((m, i) => {
      const page = document.getElementById('page-' + (i + 1));
      const mod = V.slides[m.module];
      if (mod && mod.adjust) mod.adjust(this.ctx, page);
      const pr = page.getBoundingClientRect();
      if (!pr.height) return;
      const perPt = pr.height / 1008;
      const past = [...page.children].some(e =>
        (e.getBoundingClientRect().bottom - pr.top) / perPt > 1009);
      if (past) spill.push(i + 1);
    });
    pages.forEach((p, i) => p.classList.toggle('current', i + 1 === this.page));
    return spill;
  }

  /* ---- before you send ---------------------------------------------- */

  /* The last place a wrong number gets caught, and the only place the PDF
   * button lives. The read-back is deliberate: only a person who knows the
   * project can catch a wrong plot number. */
  review() {
    const host = document.getElementById('review-body');
    host.textContent = '';
    /* `notes` sit beside the estimates under the same ⚠, because they are
     * the same kind of thing to look at. They are counted apart because
     * they are not values: «مراحل بلا مدة» is one row about the whole
     * programme, and counting it as «قيمة تقريبية واحدة» said something
     * that is not true. */
    const missing = [], estimates = [], problems = [], notes = [], ok = [];

    this.onAPage().forEach(name => {
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

    /* Read off the schedule itself, not off p1 to p4. Those are the first
     * four shares and nothing more, so a job carrying five payments would
     * have had its fifth checked by nobody. */
    const pays = this.ctx.payments();
    const totals = this.ctx.paymentTotals();
    const noShare = pays.filter(p => p.share == null);
    const noEvent = pays.filter(p => !p.event_ar && !p.when);
    if (noShare.length)
      problems.push({ what: 'دفعات بلا نسبة: ' +
                        noShare.map(p => ar(parseInt(p.no, 10))).join('، '),
                      detail: 'تظهر في الجدول بلا مبلغ' });
    if (noEvent.length)
      problems.push({ what: 'دفعات بلا حدث: ' +
                        noEvent.map(p => ar(parseInt(p.no, 10))).join('، '),
                      detail: 'الصف يُطبع بلا عنوان' });
    if (!noShare.length && Math.abs(totals.raw - 100) > 0.01)
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

    /* Nothing may run off the paper. Every page stretches to hold what a
     * job puts on it and page 9 shrinks its table to fit, but there is a
     * floor below which type stops being readable. Past that the page
     * really is too full, and the answer is a phase fewer or a shorter
     * paragraph, not smaller type. */
    const spill = this.adjustAll();
    if (spill.length)
      problems.push({ what: 'المحتوى يتجاوز حدود ' + arCount(spill.length,
                        'صفحة واحدة', 'صفحتين', 'صفحات', 'صفحة'),
                      detail: 'صفحة ' + spill.map(ar).join('، ') +
                        ' · اختصر النص أو أنقص مرحلة' });

    /* A warning, not a blocker, because presend.py treats it as one. The
     * two paths must not disagree about what stops a proposal: a job the
     * PowerPoint would let out cannot be one this refuses to print. */
    const noDuration = this.ctx.phases()
      .filter(r => r.no != null && !r.duration_days).map(r => (r.code || '').trim());
    if (noDuration.length)
      notes.push({ what: 'مراحل بلا مدة: ' + noDuration.join('، '),
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
    /* Every payment read back, because a schedule the client signs is not
     * something a total alone can vouch for. */
    pays.forEach(p => ok.push({
      what: 'دفعة ' + ar(parseInt(p.no, 10)) + '  ' + (p.title_ar || '—'),
      detail: [p.pct, p.amount].filter(Boolean).join('  ·  ') }));
    ok.push({ what: 'الخدمات  ' + ar(sold.size) + ' من ' +
                    ar(this.ctx.services().length) });
    ok.push({ what: 'المدة  ' + arCount(
      Math.round(this.ctx.timelinePlan().total_days),
      'يوم واحد', 'يومان', 'أيام', 'يوماً') });
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
    section('قيم تقريبية', estimates.concat(notes), 'est', '⚠');
    section('تم', ok, 'ok', '✓');

    if (!missing.length && !problems.length && !estimates.length && !notes.length) {
      const p = V.el('p', 'note');
      p.style.color = '#93d39b';
      p.textContent = 'لا يوجد ما يمنع الإرسال. اقرأ الصفحات مرة أخيرة قبل أن ترسل.';
      host.appendChild(p);
    }

    /* Nothing here stops the file being made. A proposal goes out while a
     * بلدي value is still being chased, and a tool that refuses to print
     * is worked around by somebody rebuilding the deck by hand, which is
     * how a proposal leaves with no check at all. What is missing prints
     * as empty space, and the press asks before it prints.
     *
     * An estimate that reads correctly is indistinguishable from a real
     * value three days later, so it is still a decision. It is taken in
     * the same breath as the rest instead of in a checkbox of its own. */
    this.pdfWarnings = [];
    if (missing.length)
      this.pdfWarnings.push('ناقص ' +
        arCount(missing.length, 'قيمة واحدة', 'قيمتان', 'قيم', 'قيمة') +
        '. تظهر فارغة في الملف.');
    problems.forEach(p => {
      const line = p.what + (p.detail ? '. ' + p.detail : '');
      this.pdfWarnings.push(/[.؟]$/.test(line) ? line : line + '.');
    });
    notes.forEach(n => this.pdfWarnings.push(n.what + '.'));
    if (estimates.length)
      this.pdfWarnings.push(arCount(estimates.length,
        'قيمة تقريبية واحدة غير مؤكدة',
        'قيمتان تقريبيتان غير مؤكدتين',
        'قيم تقريبية غير مؤكدة',
        'قيمة تقريبية غير مؤكدة') + '.');

    const note = document.getElementById('pdf-note');
    note.style.color = '';
    note.textContent = (this.pdfWarnings.length
      ? 'ما نقص يظهر فارغاً في الملف. '
      : 'يفتح نافذة الطباعة. اختر «حفظ كـ PDF». ') +
      'ويُحفظ معه ملف العرض باسم «' + this.fileBase() + '».';
    this.askPdf(false);

    document.getElementById('review').hidden = false;
  }

  /* The press asks in the same words the list above uses, so the answer is
   * given against the same facts. */
  askPdf(on) {
    const box = document.getElementById('pdf-confirm');
    if (!box) return;
    box.hidden = !on;
    document.getElementById('btn-pdf').hidden = !!on;
    document.getElementById('pdf-note').hidden = !!on;
    if (!on) return;
    const list = document.getElementById('pdf-ask');
    list.textContent = '';
    (this.pdfWarnings || []).forEach(w => {
      const li = V.el('li');
      li.textContent = w;
      list.appendChild(li);
    });
    /* The question is taller than the button it replaces, so on a long
     * list the answer would open below the bottom of the sheet. */
    box.scrollIntoView({ block: 'nearest' });
  }

  /* What the office files this proposal under: the reference number from
   * page 1, then the document and its revision. Both downloads carry it,
   * so the PDF a client is sent and the file it can be re-opened from sit
   * beside each other in the same folder under the same name.
   *
   * Only the characters a file system refuses are taken out. The comma and
   * the spaces are the format, not decoration. */
  fileBase() {
    const ref = String(this.ctx.field('tfp_number') || '').trim();
    const num = (!ref || ref.indexOf('{{') === 0) ? 'VADO-TFP' : ref;
    return (num + ', TFP R00').replace(/[\\/:*?"<>|]+/g, '-').trim();
  }

  /* The proposal as a file that can be opened again. costwritten and
   * spatialneeds are worked out, so they go back as "auto" rather than as
   * a copy that can go stale. */
  saveJob(name) {
    const out = JSON.parse(JSON.stringify(this.job));
    if (out.fields) {
      if (this.ctx.fields.costnumber && out.fields.costwritten === undefined)
        out.fields.costwritten = 'auto';
      if (out.fields.spatialneeds === undefined) out.fields.spatialneeds = 'auto';
    }
    const blob = new Blob([JSON.stringify(out, null, 2)],
                          { type: 'application/json' });
    const a = V.el('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* The browser names the PDF after the document's title, so the title is
   * what has to change. It goes back afterwards, because the tab is read
   * by the person filling the form in, not by the client.
   *
   * The saved copy goes first. A print dialog is modal, and a download
   * started behind it does not always survive. */
  printNow() {
    this.closeReview();
    const name = this.fileBase();
    this.saveJob(name);
    const was = document.title;
    document.title = name;
    const back = () => {
      document.title = was;
      window.removeEventListener('afterprint', back);
    };
    window.addEventListener('afterprint', back);
    window.print();
    /* Headless printing never raises afterprint, so the title would stay
     * changed for the rest of the session. */
    setTimeout(back, 2000);
  }

  closeReview() {
    this.askPdf(false);
    document.getElementById('review').hidden = true;
  }

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

    /* A row taken away under the pointer never sends mouseleave, so the
     * value it lit on the page would stay lit. The list around the rows is
     * never taken away, so its own mouseleave is the one to trust. */
    on('rail-status', 'mouseleave', () => {
      if (!this.railLit) return;
      this.highlight(this.railLit, false);
      this.railLit = null;
    });

    on('btn-prev', 'click', () => this.step(-1));
    on('btn-next', 'click', () => this.step(1));
    on('btn-review', 'click', () => this.review());


    on('btn-close-review', 'click', () => this.closeReview());

    /* Pressing the dark outside closes the sheet, the way every other
     * overlay on the machine does.
     *
     * A press that starts on the sheet and ends outside it is a selection
     * dragged past the edge, and the browser reports that click on the
     * backdrop as well. Reading a number back is exactly when somebody
     * drags across it, so where the press began has to be remembered or
     * the sheet shuts while it is being read. */
    const rev = document.getElementById('review');
    let fromSheet = false;
    rev.addEventListener('mousedown', e => {
      fromSheet = !!(e.target.closest && e.target.closest('.sheet'));
    });
    rev.addEventListener('click', e => {
      if (e.target === rev && !fromSheet) this.closeReview();
      fromSheet = false;
    });
    on('btn-pdf', 'click', () => {
      if ((this.pdfWarnings || []).length) this.askPdf(true);
      else this.printNow();
    });
    on('btn-pdf-yes', 'click', () => this.printNow());
    on('btn-pdf-no', 'click', () => this.askPdf(false));

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

    window.addEventListener('beforeprint', () => this.adjustAll());
    /* headless printing never fires beforeprint, so do it once on load too */
    this.adjustAll();

    document.addEventListener('keydown', e => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowRight') this.show(this.page - 1);   /* rtl: right is back */
      if (e.key === 'ArrowLeft') this.show(this.page + 1);
      if (e.key === 'Escape') this.closeReview();
    });

    on('btn-save', 'click', () => this.saveJob(this.fileBase()));

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
  s05_spatial: true,
};

/* Pages whose control belongs above the fields rather than under them. */
V.CONTROLS_FIRST = {
  s04_project: true,
};

/* A page whose template carries more than its text boxes says so here.
 * Page 5 is the case: its one box is the plot number, and everything that
 * makes the page — the groups, the floors and the rooms inside them —
 * lives in the job's own `spatial` block instead. A template that saved
 * only the boxes would save the plot number of a villa and none of it.
 *
 * `grab` reads what to store, `apply` puts it back, `holds` is the one
 * sentence the panel says about what the template carries, and `busy` is
 * true when applying one would overwrite work already done. */
V.TEMPLATE_EXTRA = {
  s05_spatial: {
    grab: app => ({ groups: JSON.parse(JSON.stringify(app.ctx.spatial().groups || [])) }),
    apply: (app, tpl) => {
      if (!tpl.groups) return;
      app.job.spatial = Object.assign({}, app.job.spatial,
        { groups: JSON.parse(JSON.stringify(tpl.groups)) });
    },
    holds: app => {
      const gs = app.ctx.spatial().groups || [];
      let floors = 0, items = 0;
      gs.forEach(g => { floors += (g.blocks || []).length; items += (g.items || []).length; });
      return 'يحفظ ' + arCount(gs.length, 'مجموعة واحدة', 'مجموعتين', 'مجموعات', 'مجموعة') +
        ' و' + arCount(floors, 'دوراً واحداً', 'دورين', 'أدوار', 'دوراً') +
        ' و' + arCount(items, 'عنصراً واحداً', 'عنصرين', 'عناصر', 'عنصراً') +
        '، ورقم القطعة. لا يحفظ اسم العميل ولا الأتعاب.';
    },
    busy: app => (app.job.spatial && (app.job.spatial.groups || []).length > 0),
  },
};

/* What each of those controls is called, for the rail to name. */
V.CONTROL_NAMES = {
  map: 'صورة الموقع', brief: 'الأدوار والمساحات',
  services: 'الخدمات المشمولة', durations: 'مدد المراحل',
  money: 'الأتعاب والدفعات',
};

/* Fields a page owns but does not always draw. The panel builds its boxes
 * from the spans the pages render, which is what keeps it honest, but a
 * value printed only when it is given has no span while it is empty: the
 * one place it can be typed is the one place it does not appear. Named here
 * so the box exists before the value does. */
V.PAGE_FIELDS = {
  s12_financial: ['p1', 'p2', 'p3', 'p4'],
  s13_agreement: ['client_company_ar'],
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
