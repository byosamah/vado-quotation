/* What قبل الإرسال finds, worked out once for two callers.
 *
 * The browser draws it in the review sheet. The MCP server returns it to
 * whichever assistant is filling the proposal. Before this file the rules
 * lived inside `editor.js:review()`, which meant the only way to ask "is
 * this proposal ready" was to have a browser open with the page rendered.
 *
 * The two callers differ in exactly two ways, so both arrive as arguments
 * rather than as a second copy of the rules:
 *
 *   `fields`  which values count as missing. The browser reads that off
 *             the rendered spans, which is what stops the list going
 *             stale; the server reads a map built at deck-build time.
 *   `spill`   pages whose content runs off the paper. Only a browser that
 *             has laid the deck out can know, so the server passes none.
 *
 * `tools/presend.py` is the third caller and is not this file: it reads a
 * built .pptx and can see things no JavaScript can, such as a {{tag}} the
 * PowerPoint really did print. `tools/check_parity.py` runs the two over
 * every job file and fails when they disagree about what stops a send.
 */
'use strict';

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/* Western digits are what the deck prints; the screen around it counts in
 * Arabic-Indic, because it is read by somebody working in Arabic. */
V.ar = n => String(n).replace(/[0-9]/g, d => AR_DIGITS[+d]);

/* Arabic counts a thing four different ways: one, two, three to ten, and
 * eleven up. «٣ قيمة» is wrong in the same way «3 value» is. The caller
 * gives the whole phrase for one and for two, because the words after the
 * noun have to agree with it as well. */
V.arCount = (n, one, two, few, many) =>
  n === 1 ? one :
  n === 2 ? two :
  n <= 10 ? V.ar(n) + ' ' + few : V.ar(n) + ' ' + many;

/* Every check, in five buckets.
 *
 *   missing    a value the document prints and nobody has given
 *   problems   the file itself disagrees with itself
 *   estimates  a value marked تقريبي, so it reads right and may be wrong
 *   notes      the same kind of thing to look at, but not about a value
 *   ok         the read-back: what is about to go to the client
 *
 * Nothing here refuses to build the file. A proposal goes out while a بلدي
 * number is still being chased, and a tool that refuses to print is worked
 * around by somebody rebuilding the deck by hand, which is how a proposal
 * leaves with no check at all. The caller asks once, naming what is
 * missing, and prints.
 */
V.checks = function (ctx, opts) {
  const o = opts || {};
  const fields = o.fields || [];
  const pageOf = o.pageOf || {};
  const label = o.label || (n => ({ ar: n }));
  const spill = o.spill || [];
  const missing = [], estimates = [], problems = [], notes = [], ok = [];

  fields.forEach(name => {
    if (String(ctx.field(name)).indexOf('{{') !== 0) return;
    missing.push({ name: name, what: label(name).ar, where: pageOf[name] });
  });

  ctx.estimates.forEach(name => {
    if (name === 'map') {
      estimates.push({ name: 'map', what: 'صورة الموقع',
                       where: pageOf.coordinates,
                       detail: 'الصفحة تعرض صورة مؤقتة' });
      return;
    }
    const v = String(ctx.field(name));
    estimates.push({ name: name, what: label(name).ar, where: pageOf[name],
                     detail: v.indexOf('{{') === 0 ? '' : v });
  });

  /* Read off the schedule itself, not off p1 to p4. Those are the first
   * four shares and nothing more, so a job carrying five payments would
   * have had its fifth checked by nobody. */
  const pays = ctx.payments();
  const totals = ctx.paymentTotals();
  const noShare = pays.filter(p => p.share == null);
  const noEvent = pays.filter(p => !p.event_ar && !p.when);
  if (noShare.length)
    problems.push({ what: 'دفعات بلا نسبة: ' +
                      noShare.map(p => V.ar(parseInt(p.no, 10))).join('، '),
                    detail: 'تظهر في الجدول بلا مبلغ' });
  if (noEvent.length)
    problems.push({ what: 'دفعات بلا حدث: ' +
                      noEvent.map(p => V.ar(parseInt(p.no, 10))).join('، '),
                    detail: 'الصف يُطبع بلا عنوان' });
  if (!noShare.length && Math.abs(totals.raw - 100) > 0.01)
    problems.push({ what: 'مجموع الدفعات ' +
                      V.ar(Math.round(totals.raw * 10) / 10) + '٪',
                    detail: 'يجب أن يكون ١٠٠٪' });

  const fee = String(ctx.fields.costnumber || '');
  if (fee && fee.indexOf('{{') < 0) {
    const spelled = V.num.spell(fee);
    const shown = String(ctx.fields.costwritten || '');
    if (shown && shown.indexOf('{{') < 0 && shown.trim() !== spelled)
      problems.push({ what: 'المبلغ بالحروف لا يطابق الرقم',
                      detail: 'الرقم يقول: ' + spelled });
  }

  /* Nothing may run off the paper. Every page stretches to hold what a job
   * puts on it and page 9 shrinks its table to fit, but there is a floor
   * below which type stops being readable. Past that the page really is
   * too full, and the answer is a phase fewer or a shorter paragraph, not
   * smaller type. */
  if (spill.length)
    problems.push({ what: 'المحتوى يتجاوز حدود ' + V.arCount(spill.length,
                      'صفحة واحدة', 'صفحتين', 'صفحات', 'صفحة'),
                    detail: 'صفحة ' + spill.map(V.ar).join('، ') +
                      ' · اختصر النص أو أنقص مرحلة' });

  /* A warning, not a blocker, because presend.py treats it as one. The two
   * paths must not disagree about what stops a proposal: a job the
   * PowerPoint would let out cannot be one this refuses to print. */
  const noDuration = ctx.phases()
    .filter(r => r.no != null && !r.duration_days).map(r => (r.code || '').trim());
  if (noDuration.length)
    notes.push({ what: 'مراحل بلا مدة: ' + noDuration.join('، '),
                 detail: 'العميل يقرأها كعمل بلا تاريخ انتهاء' });

  /* A scope still promising something slide 8 marks N/A is a contract that
   * says two different things, and it gets read the other way. */
  const sold = new Set(ctx.services().filter(s => s.included).map(s => s.id));
  const scopeText = ctx.c('scope').lines.map(l => l.t).join(' ');
  ctx.services().forEach(s => {
    if (!sold.has(s.id) && s.ar && scopeText.indexOf(s.ar) >= 0)
      problems.push({ what: 'نطاق العمل ما زال يعد بـ «' + s.ar + '»',
                      detail: 'وصفحة ٨ تضعها غير مشمولة' });
  });

  if (fee && fee.indexOf('{{') < 0)
    ok.push({ what: 'الأتعاب  ' + fee + ' ريال',
              detail: ctx.fields.costwritten || '' });
  /* Every payment read back, because a schedule the client signs is not
   * something a total alone can vouch for. */
  pays.forEach(p => ok.push({
    what: 'دفعة ' + V.ar(parseInt(p.no, 10)) + '  ' + (p.title_ar || '—'),
    detail: [p.pct, p.amount].filter(Boolean).join('  ·  ') }));
  ok.push({ what: 'الخدمات  ' + V.ar(sold.size) + ' من ' +
                  V.ar(ctx.services().length) });
  ok.push({ what: 'المدة  ' + V.arCount(
    Math.round(ctx.timelinePlan().total_days),
    'يوم واحد', 'يومان', 'أيام', 'يوماً') });
  const client = [ctx.field('name_title_ar'), ctx.field('firstname_ar'),
                  ctx.field('lastname_ar')].join(' ');
  if (client.indexOf('{{') < 0) ok.push({ what: 'العميل  ' + client });
  const proj = String(ctx.field('project_type_ar'));
  if (proj.indexOf('{{') < 0)
    ok.push({ what: 'المشروع  ' + proj + ' · ' + ctx.field('city_ar') });

  return { missing: missing, problems: problems, estimates: estimates,
           notes: notes, ok: ok };
};

/* The one line said before the file is made: what is missing prints as
 * empty space, and an estimate that reads correctly is indistinguishable
 * from a real value three days later. Both are decisions, so they are put
 * in the same breath rather than in a checkbox of their own. */
V.checkWarnings = function (found) {
  const out = [];
  if (found.missing.length)
    out.push('ناقص ' + V.arCount(found.missing.length,
      'قيمة واحدة', 'قيمتان', 'قيم', 'قيمة') + '. تظهر فارغة في الملف.');
  found.problems.forEach(p => {
    const line = p.what + (p.detail ? '. ' + p.detail : '');
    out.push(/[.؟]$/.test(line) ? line : line + '.');
  });
  found.notes.forEach(n => out.push(n.what + '.'));
  if (found.estimates.length)
    out.push(V.arCount(found.estimates.length,
      'قيمة تقريبية واحدة غير مؤكدة',
      'قيمتان تقريبيتان غير مؤكدتين',
      'قيم تقريبية غير مؤكدة',
      'قيمة تقريبية غير مؤكدة') + '.');
  return out;
};
