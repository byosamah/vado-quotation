/* قبل الإرسال, for an assistant instead of a browser.
 *
 * The rules are `html/src/checks.js`, the same file the review sheet in the
 * browser draws from, so the two cannot disagree about what stops a
 * proposal. What is added here is the read-back: every value that is about
 * to reach a client, printed so a human can find the neighbour's plot
 * number in it.
 *
 * That read-back is the point. A machine can tell you a field is empty.
 * Only the person who knows the project can tell you the plot number is
 * wrong, and they can only do that if they are shown it.
 */
import V from './_engine.mjs';
import { ctxFor, countable, pageOf, label, labels, groups, progress }
  from './job.mjs';
import { byControl, unprinted } from './_data.mjs';

/* What the read-back prints, which is not the same list as what counts as
 * missing. The fee in Arabic words and the one-line brief on page 4 are
 * worked out rather than typed, so they can never be missing — and they are
 * exactly the two a human has to read, because they are the two nobody
 * checked while typing. The four shares are left out and the payment
 * schedule is printed instead: p1..p4 are the first four rows and nothing
 * more, so a job carrying five payments would have had its fifth read back
 * by nobody. */
const READ_BACK = Object.keys(labels)
  .filter(n => pageOf[n] && !byControl.includes(n) && !unprinted.includes(n))
  .sort((a, b) => (labels[a].order ?? 999) - (labels[b].order ?? 999));

export function review(job) {
  const ctx = ctxFor(job);
  const found = V.checks(ctx, {
    fields: countable,
    pageOf,
    label,
    spill: [],      /* only a browser that laid the deck out can know */
  });
  const p = progress(job);

  const values = groups.map((g, gi) => ({
    group: g.en,
    ar: g.ar,
    from: g.source,
    values: READ_BACK
      .filter(n => label(n).group === gi)
      .map(n => {
        const v = String(ctx.field(n));
        return {
          field: n,
          ar: label(n).ar,
          value: v.indexOf('{{') === 0 ? null : v,
          estimated: (job.placeholders || []).includes(n) || undefined,
        };
      }),
  })).filter(g => g.values.length);

  const totals = ctx.paymentTotals();
  const who = ctx.signatory();

  return {
    ready: found.missing.length === 0 && found.problems.length === 0,
    blocking: found.problems.map(row => ({ what: row.what, detail: row.detail })),
    missing: found.missing.map(row => ({ field: row.name, ar: row.what,
                                         page: row.where })),
    estimated: found.estimates.map(row => ({ field: row.name, ar: row.what,
                                             value: row.detail || null,
                                             page: row.where })),
    notes: found.notes.map(row => ({ what: row.what, detail: row.detail })),

    /* Named every time, because nothing in this server can tell a value
     * read off بلدي from one somebody made up to see the page. */
    regulatory_stated_as_read: p.balady_unmarked.map(n => ({
      field: n, ar: label(n).ar, value: String(ctx.field(n)) })),

    read_back: {
      values,
      payments: ctx.payments().map(row => ({
        no: row.no, share: row.pct, amount: row.amount,
        heading_ar: row.title_ar })),
      payments_total: { share: totals.pct, amount: totals.amount },
      services: ctx.services().map(s => ({ id: s.id, ar: s.ar.trim(),
                                           en: s.en.trim(),
                                           included: s.included })),
      brief: ctx.spatial().groups.map(g => ({
        title_ar: g.title_ar,
        items: g.items || [],
        blocks: (g.blocks || []).map(b => ({ name_ar: b.name_ar,
          contents_ar: (b.contents_ar || '').trim() })) })),
      programme: ctx.phases().filter(r => r.no != null).map(r => ({
        no: r.no, code: (r.code || '').trim(), name_ar: r.name_ar,
        days: r.duration_days || null })),
      total_days: Math.round(ctx.timelinePlan().total_days),
      site_map: job.map || 'map-placeholder.png',
      signed_by: who.name_ar,
    },

    /* The single line the browser says before it prints, word for word, so
     * an assistant can say the same thing. */
    before_pdf: V.checkWarnings(found),
  };
}
