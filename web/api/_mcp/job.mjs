/* A proposal, and what may be written into one.
 *
 * The job file is the deliverable. `build.py` reads it, the browser reads
 * it, `tools/presend.py` checks it. This file adds nothing to its shape: it
 * validates what an assistant tries to write, works out what follows on its
 * own, and says what is still missing and where the answer comes from.
 *
 * The rule the whole thing turns on: **a regulatory value is never
 * invented.** Building ratio, setbacks, floor count, maximum height, use
 * code. They come from بلدي and go into a document a client may take to a
 * municipality. Nothing here can tell a read value from a guessed one, so
 * it does the honest thing instead: it names every regulatory value that is
 * not marked تقريبي, in the read-back, every time.
 */
import V from './_engine.mjs';
import { theme, content, labels, groups, pageOf, countable } from './_data.mjs';

export { labels, groups, pageOf, countable };

export const FIELD_NAMES = Object.keys(content.fields).filter(k => k !== '_doc');
export const BALADY = FIELD_NAMES.filter(n => labels[n] && labels[n].balady);
/* The word in front of a payment's event. Four are named in content.json;
 * `custom` is the fifth and lives in ctx.js, because it takes whatever the
 * row writes in `when_ar` rather than a word the studio chose. */
export const TRIGGERS = [
  ...Object.keys(content.financial.triggers).filter(k => k !== '_doc'),
  'custom',
];

export const LISTS = { ksaarchzone: 'ksa_arch_zones',
                       ksaarchlevel: 'ksa_arch_levels',
                       archstyle: 'arch_styles' };

/* Answering «لاينطبق/ مستثنى» to the zone answers the level with it: a plot
 * outside the classification has no level inside it either. The panel does
 * the same thing, for the same reason. */
const ARCH_NA = 'لاينطبق/ مستثنى';

/* What a value has to look like. These are the checks tools/presend.py
 * runs, moved forward to the moment the value is written, so the assistant
 * is told at once rather than at the end. */
const FORMATS = {
  date: [/^\d{1,2} [A-Z]{3} \d{4}$/, 'a date like "23 AUG 2026", month in capitals'],
  tfp_dur: [/^\d+$/, 'a plain number of days, like "14"'],
  email: [/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'an email address'],
  phone: [/^\+?[\d\s]{9,}$/, 'a Saudi phone number like "055 123 4567"'],
  lotarea: [/^[\d,.]+$/, 'square metres as a number, like "386.15"'],
  costnumber: [/^[\d,]+(\.\d+)?$/, 'the fee as a number, like "45,000"'],
};

export function ctxFor(job) {
  return new V.Ctx({ theme, content, assets: {}, job: clone(job) });
}

const clone = v => JSON.parse(JSON.stringify(v));

export function blank() {
  return { fields: {}, services: [], placeholders: [] };
}

/* Today, written the way every proposal already on file writes it. */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
                'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export function today(now = new Date()) {
  return String(now.getDate()).padStart(2, '0') + ' ' +
         MONTHS[now.getMonth()] + ' ' + now.getFullYear();
}

/* ---- writing ---------------------------------------------------------- */

/* Values nobody is asked for, because the deck already knows them. Setting
 * one by hand is how a fact gets a second copy that can disagree with the
 * first; `costwritten` and `spatialneeds` are computed on every render. */
export function autofill(job) {
  const f = job.fields || (job.fields = {});
  if (!f.date) f.date = today();
  if (!f.tfp_dur) f.tfp_dur = '14';
  if (!f.areasource) f.areasource = 'الصك';
  f.costwritten = 'auto';
  if (!f.spatialneeds || hasStoreys(job)) f.spatialneeds = 'auto';
  return job;
}

/* `spatialneeds` counts itself off the brief's storeys. A project with no
 * storeys — a fuel station, a warehouse yard — has no sentence of that
 * shape, so the field stays writable there and the build says so. */
function hasStoreys(job) {
  const groupsIn = ((job.spatial || {}).groups) || [];
  return groupsIn.some(g => (g.blocks || []).some(
    b => /دور|طابق|ملحق|قبو/.test(b.name_ar || '')));
}

export function setFields(job, fields) {
  const applied = {}, rejected = [];
  const f = job.fields || (job.fields = {});
  for (const [name, raw] of Object.entries(fields || {})) {
    const value = raw == null ? '' : String(raw).trim();
    if (!FIELD_NAMES.includes(name)) {
      rejected.push({ field: name, value,
        why: 'not a field on this document. Read the `vado://fields` '
             + 'resource for the list.' });
      continue;
    }
    if (name === 'costwritten' && value !== 'auto') {
      rejected.push({ field: name, value,
        why: 'the build spells the fee in Arabic itself. Set costnumber, and '
             + 'leave this at "auto".' });
      continue;
    }
    /* The one-line brief on page 4 counts itself off the storeys on page 5,
     * so it is not typed when there are storeys to count. A project with
     * none — a fuel station, a warehouse yard — has no sentence of that
     * shape, and there it must be written by hand. */
    if (name === 'spatialneeds' && value !== 'auto' && hasStoreys(job)) {
      rejected.push({ field: name, value,
        why: 'built from the storeys in the brief on page 5. Change the brief, '
             + 'or leave this at "auto".' });
      continue;
    }
    const list = LISTS[name];
    if (list && value && !content.lists[list].includes(value)) {
      rejected.push({ field: name, value,
        why: 'not on the closed list. Allowed: '
             + content.lists[list].join(' · ') });
      continue;
    }
    const format = FORMATS[name];
    if (format && value && !format[0].test(value)) {
      rejected.push({ field: name, value, why: 'expected ' + format[1] });
      continue;
    }
    if (value === '') delete f[name];
    else f[name] = value;
    applied[name] = value;
    if (name === 'ksaarchzone' && value === ARCH_NA) {
      f.ksaarchlevel = ARCH_NA;
      applied.ksaarchlevel = ARCH_NA;
    }
  }
  return { applied, rejected };
}

/* تقريبي: the value reads correctly and may still be wrong.
 *
 * A stand-in that looks right is indistinguishable from a fact three days
 * later, so it is marked here, printed with «تقريبًا» beside it on the
 * page, and named in every read-back until somebody clears it. */
export function markEstimates(job, estimated, confirmed) {
  const list = job.placeholders || (job.placeholders = []);
  for (const name of estimated || []) {
    if (!list.includes(name)) list.push(name);
  }
  for (const name of confirmed || []) {
    const at = list.indexOf(name);
    if (at >= 0) list.splice(at, 1);
  }
  return list;
}

export function setServices(job, ids) {
  const known = content.services.items.map(s => s.id);
  const rejected = (ids || []).filter(id => !known.includes(id));
  if (rejected.length) {
    return { rejected: rejected.map(id => ({ field: 'services', value: id,
      why: 'not a service. The eleven are: ' + known.join(' · ') })) };
  }
  job.services = [...new Set(ids)];
  return { rejected: [] };
}

export function setDurations(job, days) {
  const known = content.phases.rows.map(r => r.id);
  const rejected = [], applied = {};
  const out = job.durations || (job.durations = {});
  for (const [id, value] of Object.entries(days || {})) {
    if (!known.includes(id)) {
      rejected.push({ field: 'durations.' + id, value: String(value),
        why: 'not a phase. The phases are: ' + known.join(' · ') });
      continue;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      rejected.push({ field: 'durations.' + id, value: String(value),
        why: 'expected a number of days above zero' });
      continue;
    }
    out[id] = n;
    applied[id] = n;
  }
  return { applied, rejected };
}

/* A payment is three parts and nothing else: the word in front of the
 * event, the event, and the share of the fee. The heading the client reads
 * and the sentence under it are both built from those three, so a payment
 * cannot say one thing above and another below. */
export function setPayments(job, rows) {
  const triggers = TRIGGERS;
  const rejected = [], out = [];
  (rows || []).forEach((row, i) => {
    const when = String(row.when || '').trim();
    if (!triggers.includes(when)) {
      rejected.push({ field: `payments[${i}].when`, value: when,
        why: 'expected one of: ' + triggers.join(' · ') });
      return;
    }
    const pct = String(row.pct == null ? '' : row.pct).replace(/[%٪\s]/g, '');
    const n = Number(pct);
    if (!Number.isFinite(n) || n <= 0) {
      rejected.push({ field: `payments[${i}].pct`, value: String(row.pct),
        why: 'expected the share as a bare number, like 30. The % is printed, '
             + 'never typed.' });
      return;
    }
    const built = { id: row.id || ('pay' + (i + 1)), when,
                    event_ar: String(row.event_ar || '').trim(),
                    pct: String(n) };
    if (when === 'custom') built.when_ar = String(row.when_ar || '').trim();
    out.push(built);
  });
  if (rejected.length) return { rejected };

  job.payments = out;
  /* The first four shares are written back to p1..p4, because the office
   * tracker and tools/presend.py have always found them there. A fifth
   * payment reaches neither, and the read-back prints the schedule rather
   * than those four fields so nothing goes unread. */
  const f = job.fields || (job.fields = {});
  ['p1', 'p2', 'p3', 'p4'].forEach((key, i) => {
    if (out[i]) f[key] = out[i].pct + '%';
    else delete f[key];
  });
  return { rejected: [], payments: out };
}

/* The room schedule on page 5. It has no fixed shape: a villa has outdoor
 * spaces and floors, a fuel station has a forecourt and buildings. Groups
 * hold a flat list of `items`, or `blocks` that each name a part and say
 * what is inside it, or both. */
export function setSpatial(job, spatial) {
  const rejected = [];
  const groupsIn = (spatial && spatial.groups) || [];
  if (!Array.isArray(groupsIn) || !groupsIn.length) {
    return { rejected: [{ field: 'spatial', value: '',
      why: 'expected { groups: [{ title_ar, items?, blocks? }] }. See the '
           + '`vado://fields` resource, section 10.' }] };
  }
  const out = [];
  groupsIn.forEach((g, i) => {
    const title = String((g && g.title_ar) || '').trim();
    if (!title) {
      rejected.push({ field: `spatial.groups[${i}].title_ar`, value: '',
        why: 'every group needs an Arabic heading' });
      return;
    }
    const built = { title_ar: title };
    const items = (g.items || []).map(s => String(s).trim()).filter(Boolean);
    const blocks = (g.blocks || [])
      .map(b => ({ name_ar: String((b && b.name_ar) || '').trim(),
                   contents_ar: String((b && b.contents_ar) || '').trim() }))
      .filter(b => b.name_ar);
    if (items.length) built.items = items;
    if (blocks.length) built.blocks = blocks;
    if (!items.length && !blocks.length) {
      rejected.push({ field: `spatial.groups[${i}]`, value: title,
        why: 'a group holds items, blocks, or both. This one holds neither.' });
      return;
    }
    out.push(built);
  });
  if (rejected.length) return { rejected };
  job.spatial = { groups: out };
  return { rejected: [] };
}

/* ---- reading ---------------------------------------------------------- */

export function label(name) {
  return labels[name] || { ar: name, source: '', example: '' };
}

/* What is filled, what is not, and which one source answers the most.
 *
 * Grouped by where the value comes from, never field by field. Somebody
 * looking at one بلدي page can answer fifteen questions at once; being
 * asked them one at a time is punishing.
 */
export function progress(job) {
  const ctx = ctxFor(job);
  const open = groups.map(g => ({ ...g, missing: [], filled: 0 }));
  for (const name of countable) {
    const meta = label(name);
    const at = open[meta.group] || open[open.length - 1];
    if (String(ctx.field(name)).indexOf('{{') === 0) {
      at.missing.push({ field: name, ar: meta.ar, example: meta.example,
                        page: pageOf[name] });
    } else {
      at.filled += 1;
    }
  }
  const missing = open.reduce((n, g) => n + g.missing.length, 0);
  return {
    filled: countable.length - missing,
    total: countable.length,
    groups: open.filter(g => g.missing.length),
    services: (job.services || []).length,
    has_brief: Boolean(job.spatial && (job.spatial.groups || []).length),
    has_durations: Object.keys(job.durations || {}).length > 0,
    estimated: (job.placeholders || []).slice(),
    balady_unmarked: BALADY.filter(n =>
      String(ctx.field(n)).indexOf('{{') !== 0 &&
      !(job.placeholders || []).includes(n)),
  };
}

/* The one thing to go and find next.
 *
 * Ordered the way the work really goes: the deal before the programme,
 * because what is sold decides which phases exist at all; the brief before
 * page 4's one-line summary, because that summary counts itself off the
 * brief.
 */
export function agenda(job) {
  const p = progress(job);
  const out = [];
  for (const g of p.groups) {
    out.push({ ask: g.ar, en: g.en, from: g.source,
               fields: g.missing.map(m => m.field), count: g.missing.length });
  }
  if (!p.services) {
    out.unshift({ ask: 'الخدمات المشمولة', en: 'Services',
                  from: 'قرار تجاري',
                  fields: ['services'], count: 1 });
  }
  if (!p.has_brief) {
    out.push({ ask: 'المتطلبات المساحية', en: 'The brief on page 5',
               from: 'اجتماع البداية', fields: ['spatial'], count: 1 });
  }
  if (!p.has_durations) {
    out.push({ ask: 'مدة كل مرحلة بالأيام', en: 'Phase durations',
               from: 'من يبرمج المشروع', fields: ['durations'], count: 1 });
  }
  return out;
}
