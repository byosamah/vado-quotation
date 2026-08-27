/* What `html/src/checks.js` says about a job file, as JSON.
 *
 *     node tools/checks_report.mjs jobs/x.json
 *
 * Only used by `tools/check_parity.py`, which runs the same job through
 * `tools/presend.py` and fails when the two disagree about what stops a
 * proposal. The browser and the MCP server share this file; the PowerPoint
 * checker does not, and cannot, because it reads a built .pptx. So they are
 * refereed instead of merged.
 */
import { readFileSync } from 'node:fs';

const V = (await import(new URL('../web/api/_mcp/_engine.mjs', import.meta.url))).default;
const data = await import(new URL('../web/api/_mcp/_data.mjs', import.meta.url));

const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
delete job._doc;

const ctx = new V.Ctx({ theme: data.theme, content: data.content,
                        assets: {}, job });
const found = V.checks(ctx, {
  fields: data.countable,
  pageOf: data.pageOf,
  label: n => data.labels[n] || { ar: n },
  spill: [],
});

console.log(JSON.stringify({
  missing: found.missing.map(m => m.name).sort(),
  estimated: found.estimates.map(e => e.name).filter(Boolean).sort(),
  payments_total: ctx.paymentTotals().raw,
  payment_count: ctx.payments().length,
  price_words_disagree: found.problems.some(p =>
    p.what.includes('المبلغ بالحروف')),
  no_duration: ctx.phases()
    .filter(r => r.no != null && !r.duration_days)
    .map(r => (r.code || '').trim()).sort(),
  scope_promises_unsold: found.problems
    .filter(p => p.what.includes('نطاق العمل'))
    .map(p => p.what).sort(),
  total_days: Math.round(ctx.timelinePlan().total_days),
  fee_in_words: String(ctx.field('costwritten')),
}, null, 2));
