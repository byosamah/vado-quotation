/* The build context, ported from vado/context.py and vado/numwords.py.
 *
 * Three layers, each overriding the one above: theme (how it looks),
 * content (the words that are the same on every proposal), job (this
 * proposal). Everything the slide modules read comes through here, so the
 * HTML and the PowerPoint cannot end up describing different projects.
 */
'use strict';

/* ---- numbers in Arabic words ---------------------------------------- */

V.num = (function () {
  const WA = ' و ';
  const ONES = ['واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة'];
  const TEENS = ['عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر',
                 'ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
  const TENS = ['','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
  const HUND = ['','','ثلاث','أربع','خمس','ست','سبع','ثمان','تسع'];
  const UNITS = {
    thousand: ['ألف', 'ألفان', 'آلاف'],
    million:  ['مليون', 'مليونان', 'ملايين'],
    billion:  ['مليار', 'ملياران', 'مليارات'],
  };

  function underThousand(n) {
    const hundreds = Math.floor(n / 100), rest = n % 100;
    const tens = Math.floor(rest / 10), units = rest % 10;
    const parts = [];
    if (hundreds === 1) parts.push('مائة');
    else if (hundreds === 2) parts.push('مائتان');
    else if (hundreds >= 3) parts.push(HUND[hundreds - 1] + 'مائة');
    if (tens === 0 && units > 0) parts.push(ONES[units - 1]);
    else if (tens === 1) parts.push(TEENS[units]);
    else if (tens > 1) {
      /* Arabic says the unit before the ten: four and thirty */
      if (units > 0) parts.push(ONES[units - 1]);
      parts.push(TENS[tens - 1]);
    }
    return parts.join(WA);
  }

  function scaled(n, unit) {
    const [single, dual, plural] = UNITS[unit];
    if (n === 1) return single;
    if (n === 2) return dual;
    if (n >= 3 && n <= 10) return underThousand(n) + ' ' + plural;
    return underThousand(n) + ' ' + single;
  }

  function spell(value) {
    let n = parseInt(String(value).replace(/,/g, '').trim(), 10);
    if (!isFinite(n)) return '';
    if (n === 0) return 'صفر';
    if (n < 0) return 'سالب ' + spell(-n);
    const billions = Math.floor(n / 1e9);
    let rest = n % 1e9;
    const millions = Math.floor(rest / 1e6); rest = rest % 1e6;
    const thousands = Math.floor(rest / 1e3);
    const remainder = rest % 1e3;
    const parts = [];
    if (billions) parts.push(scaled(billions, 'billion'));
    if (millions) parts.push(scaled(millions, 'million'));
    if (thousands) parts.push(scaled(thousands, 'thousand'));
    if (remainder) parts.push(underThousand(remainder));
    let s = parts.join(WA).replace(/\s+/g, ' ').trim();
    while (s.endsWith('و')) s = s.slice(0, -1).trim();
    return s;
  }
  return { spell };
}());

/* ---- the context ---------------------------------------------------- */

const TAG = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const AUTO = ['', 'auto'];
const ARABIC_COUNTS = { 1: 'دور واحد', 2: 'دورين', 3: 'ثلاثة أدوار',
                        4: 'أربعة أدوار', 5: 'خمسة أدوار', 6: 'ستة أدوار' };
const isNum = s => s !== '' && s != null &&
                   isFinite(Number(String(s).replace(/,/g, '')));

V.Ctx = class {
  constructor(data) {
    this.theme = data.theme;
    this.content = data.content;
    this.assets = data.assets;
    this.job = data.job || {};
    this.editable = [];          /* every bound span, for live re-render */
    /* Note: the scope is deliberately NOT overridable by a job. It is the
     * studio's contract language. presend.py reads content.json to catch a
     * scope promising a service slide 8 marks N/A, so a per-proposal copy
     * would drift from the very check meant to catch it. Those words change
     * in content.json, where the change reaches every future proposal on
     * purpose. */
    this.recompute();
  }

  /* Called once at start and after every edit. Everything derived is
   * recomputed from scratch, so a value can never survive the change that
   * should have invalidated it. */
  recompute() {
    this.fields = Object.assign({}, this.content.fields || {});
    delete this.fields._doc;
    const job = this.job;
    Object.assign(this.fields, job.fields || {});
    /* Values the person marked as a stand-in rather than read off the
     * source. The job file calls them `placeholders`; the screen calls them
     * تقديري, which is what they are. */
    this.estimates = (job.placeholders || []).slice();
    this.placeholders = this.estimates;
    this.unknownTags = new Set();
    this.warnings = [];
    /* An uploaded picture travels inside the job, so it survives a reload
     * and a saved copy. `map` stays a plain file name, which is what
     * build.py wants when the same proposal is built as a PowerPoint. */
    if (job.map && job.map_data) this.assets[job.map] = job.map_data;
    this._derive();
  }

  _derive() {
    const number = String(this.fields.costnumber || '').trim();
    const written = String(this.fields.costwritten || '').trim();
    if (isNum(number) &&
        (AUTO.indexOf(written) >= 0 || written === '{{costwritten}}')) {
      this.fields.costwritten = V.num.spell(number);
    }
    const needs = String(this.fields.spatialneeds || '').trim();
    if (AUTO.indexOf(needs) >= 0) {
      const described = this._describeFloors();
      if (described) this.fields.spatialneeds = described;
      else {
        this.fields.spatialneeds = '{{spatialneeds}}';
        this.warnings.push('spatialneeds is "auto" but the brief on slide 5 ' +
          'has no floors to count. Write the one-line summary by hand.');
      }
    }
  }

  /* "فيلا سكنية دورين وملحق علوي", counted off the brief on slide 5. An
   * annexe is counted apart from the storeys, because that is how the
   * phrase is built and how a client reads it. */
  _describeFloors() {
    const blocks = [];
    (this.spatial().groups || []).forEach(g =>
      (g.blocks || []).forEach(b => blocks.push(b)));
    const storeys = blocks.filter(b =>
      ['دور', 'طابق', 'ملحق'].some(w => (b.name_ar || '').indexOf(w) >= 0));
    if (!storeys.length) return null;
    const annexes = storeys.filter(b => (b.name_ar || '').indexOf('ملحق') >= 0);
    const main = storeys.length - annexes.length;
    const parts = [String(this.fields.project_type_ar || '').trim()];
    if (ARABIC_COUNTS[main]) parts.push(ARABIC_COUNTS[main]);
    else if (main) parts.push(main + ' أدوار');
    if (annexes.length) parts.push('وملحق علوي');
    return parts.filter(p => p && p.slice(0, 2) !== '{{').join(' ');
  }

  fill(text) {
    if (typeof text !== 'string' || text.indexOf('{{') < 0) return text;
    return text.replace(TAG, (m, name) => {
      if (name in this.fields) return String(this.fields[name]);
      this.unknownTags.add(name);
      return m;
    });
  }

  field(name) {
    return name in this.fields ? this.fields[name] : '{{' + name + '}}';
  }

  isTemplate() { return !Object.keys(this.job).length; }

  /* ---- theme ---- */
  color(key) {
    if (typeof key === 'string' && key[0] === '#') return key;
    const c = this.theme.colors[key];
    if (!c) throw new Error('theme.json has no colour named ' + key);
    return c;
  }
  rgba(hex, alpha) {
    const h = hex.replace('#', '');
    const n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' +
           (n & 255) + ',' + alpha + ')';
  }
  size(name) { return this.theme.type[name]; }
  geo(...path) { return path.reduce((n, p) => n[p], this.theme); }
  /* A picture that is not there must never blank the document. It used to
   * throw, and a job naming an image that had not been re-uploaded took the
   * whole deck down at the fourth page. */
  asset(name) {
    const src = this.assets[name];
    if (src) return src;
    this.warnings.push('لم يتم العثور على الصورة: ' + name);
    return this.assets['map-placeholder.png'] || '';
  }

  /* ---- content ---- */
  c(...path) {
    return path.reduce((n, p) => {
      if (n == null) throw new Error('content.json is missing ' + path.join('.'));
      return n[p];
    }, this.content);
  }
  get sections() { return this.content.sections; }
  sectionIndex(key) {
    const i = this.sections.findIndex(s => s.key === key);
    if (i < 0) throw new Error('no section ' + key);
    return i + 1;
  }

  /* ---- per-job blocks ---- */
  spatial() {
    return Object.assign({}, this.content.spatial, this.job.spatial || {});
  }

  signatory() {
    const block = this.content.signatories;
    const sid = this.job.signatory || block.default;
    if (!block[sid] || sid === '_doc' || sid === 'default')
      throw new Error('unknown signatory ' + sid);
    return block[sid];
  }

  /* One address, composed from parts. It was two hand-written strings and
   * they disagreed about the postcode on every proposal ever sent. */
  address(fmt) {
    const co = this.content.company;
    const parts = {};
    Object.keys(co.address).forEach(k => {
      if (k[0] !== '_') parts[k] = co.address[k];
    });
    return co.address_formats[fmt].replace(/\{(\w+)\}/g, (m, k) =>
      parts[k] == null ? m : parts[k]);
  }

  /* The payment schedule with the riyal amount worked out, so a client is
   * not asked to multiply 30% by the fee to learn what a stage costs. */
  payments() {
    const fee = String(this.fields.costnumber || '').replace(/,/g, '').trim();
    const total = isNum(fee) ? parseFloat(fee) : null;
    return this.c('financial', 'payments').map((pay, i) => {
      const raw = String(this.fill(pay.pct)).trim().replace(/%$/, '');
      let share = null;
      if (isNum(raw)) { share = parseFloat(raw); share = share > 1 ? share : share * 100; }
      const amount = (total && share) ? V.comma(Math.round(total * share / 100)) : null;
      return { no: (i + 1) + '.', title_ar: pay.title_ar,
               pct: this.fill(pay.pct), amount: amount, body_ar: pay.body_ar };
    });
  }

  /* The four shares added up and printed under them. A schedule that does
   * not reach the whole fee is the kind of error that costs a signature. */
  paymentTotals() {
    const pays = this.payments();
    const pcts = [], amounts = [];
    pays.forEach(p => {
      const raw = String(p.pct).trim().replace(/%$/, '');
      if (isNum(raw)) { const v = parseFloat(raw); pcts.push(v > 1 ? v : v * 100); }
      if (p.amount) amounts.push(parseFloat(p.amount.replace(/,/g, '')));
    });
    return {
      pct: pcts.length === pays.length
        ? Math.round(pcts.reduce((a, b) => a + b, 0)) + '%' : '',
      amount: amounts.length === pays.length
        ? V.comma(Math.round(amounts.reduce((a, b) => a + b, 0))) : null,
      raw: pcts.reduce((a, b) => a + b, 0),
    };
  }

  /* The eleven services with `included` resolved for this job. */
  services() {
    const items = this.content.services.items.map(s => Object.assign({}, s));
    const sold = this.job.services;
    if (sold) {
      const known = new Set(items.map(s => s.id));
      sold.forEach(sid => {
        if (!known.has(sid)) throw new Error('unknown service id ' + sid);
      });
      items.forEach(s => { s.included = sold.indexOf(s.id) >= 0; });
    }
    return items;
  }

  /* The phases this proposal actually has. A phase whose `requires` names
   * a service that was not sold disappears with its continuation rows, and
   * the survivors renumber. The trailing ". " matters: without it the cell
   * reads "1CD". */
  phases() {
    const sold = new Set(this.services().filter(s => s.included).map(s => s.id));
    const overrides = this.job.durations || {};
    const rows = [];
    let keep = true;
    this.content.phases.rows.forEach(row => {
      if (row.no !== null && row.no !== undefined) {
        const need = row.requires;
        keep = (need == null) || sold.has(need);
      }
      if (keep) {
        const r = Object.assign({}, row);
        if (r.id && r.id in overrides) r.duration_days = overrides[r.id];
        rows.push(r);
      }
    });
    let n = 0;
    rows.forEach(r => {
      if (r.no !== null && r.no !== undefined) { n += 1; r.no = n + '. '; }
    });
    return rows;
  }

  /* Where every phase sits on the chart. The bar length IS the duration,
   * so the picture and the table cannot disagree. The grid widens to hold
   * a longer programme rather than a bar running off the page. */
  timelinePlan() {
    const rows = this.phases();
    const lanes = [], ends = {};
    let cursor = 0, current = null;
    rows.forEach(row => {
      if (row.no !== null && row.no !== undefined) {
        current = { id: row.id, code: (row.code || '').trim(),
                    name_ar: row.name_ar, days: row.duration_days || 0,
                    schedule: row.schedule || {} };
        lanes.push(current);
      } else if (current) {
        current.days += row.duration_days || 0;
      }
    });
    lanes.forEach(lane => {
      const s = lane.schedule, after = s.after;
      const base = after ? (ends[after] != null ? ends[after] : cursor) : 0;
      const start = Math.max(0, base - (s.overlap_days || 0));
      lane.start_day = start;
      lane.end_day = start + lane.days;
      lane.parallel = !!s.parallel;
      /* A job may set its own marks on a lane. Which milestones a client
       * sees is a project decision, not a house rule: a job with no
       * municipal step has no approval triangle to draw. */
      const own = (this.job.markers || {})[lane.id];
      lane.markers = own !== undefined ? own : (s.markers || []);
      ends[lane.code] = lane.end_day;
      cursor = Math.max(cursor, lane.end_day);
    });
    const weeksNeeded = cursor ? Math.max(1, Math.ceil(cursor / 7)) : 1;
    const perMonth = this.c('timeline', 'gantt').weeks_per_month;
    /* The grid is as wide as the work needs, unless a job says otherwise.
     * Some programmes want the extra column of white to the right, and
     * some want the chart tight. `timeline_weeks` is that choice. */
    const fitted = Math.max(1, Math.ceil(weeksNeeded / perMonth)) * perMonth;
    const asked = parseInt(this.job.timeline_weeks, 10);
    /* Never narrower than the work. The stepper already refuses to go
     * below it, but a job file written by hand does not go through the
     * stepper, and the bars would run off the right of the page. */
    const weeks = (asked > 0) ? Math.max(weeksNeeded, asked) : fitted;
    const months = Math.max(1, Math.ceil(weeks / perMonth));
    return { lanes, total_days: cursor, weeks, months,
             weeksNeeded, fittedWeeks: fitted };
  }

  /* Only the codes on the page. The original legend named a phase the deck
   * did not contain, which invites a question nobody wants asked. */
  phaseCodes() {
    const labels = this.content.phases.codes;
    const seen = [];
    this.phases().forEach(r => {
      const code = (r.code || '').trim();
      if (code && seen.indexOf(code) < 0) seen.push(code);
    });
    return seen.filter(c => c in labels).map(c => [c, labels[c]]);
  }

  /* Wired by the editor: makes a {{tag}} span type-in-place. */
  bindEditable(span, name) { if (this.onBind) this.onBind(span, name); }
};

V.comma = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
