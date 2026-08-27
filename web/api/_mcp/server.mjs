/* The VADO proposal server: what an assistant can do, and what it is told.
 *
 * A fresh instance is built for every HTTP request. The 2026-07-28 protocol
 * revision has no session and no `initialize` handshake, so there is nothing
 * to keep between calls: the proposal itself lives in the blob store and
 * travels as `job_id`, an ordinary tool argument, which is exactly what the
 * revision says to do with server state.
 *
 * Everything the tools know comes from files that already own the fact. The
 * field labels are the skill's `fields.md`. The closed lists, the eleven
 * services and the phase list are `content.json`. The fee in Arabic words,
 * the payment amounts and the programme are `html/src/ctx.js`, the same
 * engine the browser runs. Nothing is restated here.
 */
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { content } from './_data.mjs';
import { knowledge } from './_knowledge.mjs';
import * as job from './job.mjs';
import { review } from './review.mjs';
import { readBalady } from './balady.mjs';
import * as translit from './translit.mjs';
import { newId, saveJob, readJob, listJobs } from './store.mjs';

const SERVICE_IDS = content.services.items.map(s => s.id);
const PHASE_IDS = content.phases.rows.map(r => r.id);
const TRIGGERS = job.TRIGGERS;

/* What the assistant is told before it is asked anything.
 *
 * Short on purpose: this is carried in the model's context on every turn,
 * and the long version is `vado://guide`, which it can read once. What is
 * here is only what must never be got wrong. */
const INSTRUCTIONS = `
You are filling a VADO technical and financial proposal (العرض الفني والمالي,
a TFP): a fifteen-page Arabic A3 deck for an architecture commission in Saudi
Arabia. The person you are talking to works at VADO. The document goes to
their client and may be signed.

Read the resource vado://guide before your first proposal. It is short.

Four rules that cost money when broken:

1. NEVER invent a regulatory value. Building ratio, setbacks, floor count,
   maximum height, use code, plot area: these come from بلدي or the deed and
   go into a document a client may take to a municipality. If you do not have
   one, leave it out. A visible gap beats a plausible wrong number. If the
   user asks for a stand-in so the page can be reviewed, put it in and name
   it in "estimated" in the same call, never in a later one.

2. ALWAYS ask which services are sold. Every proposal, no default, no guess
   from the project type. It decides what the fee buys, what page 9 promises
   and what page 11 schedules.

3. Ask by source, not field by field. Someone holding one بلدي page can
   answer fifteen questions at once. proposal_set returns what to ask next,
   grouped that way. Follow it.

4. Show the read-back. proposal_review returns every value about to reach a
   client. Print it for the user; do not summarise it away. It is the last
   place a wrong plot number is caught, and only a human can catch it.

Open with "send me whatever you have" rather than a questionnaire. People
arrive with a WhatsApp thread, a photo of a deed, a بلدي screenshot. Read it,
write what you can, then report what you got and what is still missing.

Write in Arabic to the user. The tools speak English; the document is Arabic.
`.trim();

const jobId = z.string().describe(
  'The handle returned by proposal_start or proposal_list.');

/* A value the document prints. Everything reaching the page is text in the
 * end, and a model sending 512 rather than "512" for a plot area is being
 * reasonable, not wrong. Refusing the whole call over it would lose the
 * fourteen values sent alongside it. */
const scalar = z.union([z.string(), z.number()]);

function text(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
           structuredContent: value };
}

function notFound(id) {
  return { isError: true, content: [{ type: 'text', text:
    `No proposal with job_id "${id}". Call proposal_list to see what exists, ` +
    `or proposal_start to begin a new one.` }] };
}

/* Everything a caller needs to decide what to say next, in one shape, so
 * every tool that changes the proposal answers the same way. */
function state(id, data, extra = {}) {
  const p = job.progress(data);
  return {
    job_id: id,
    tfp_number: (data.fields || {}).tfp_number || null,
    progress: `${p.filled} of ${p.total} values`,
    ...extra,
    ask_next: job.agenda(data),
    estimated: p.estimated,
  };
}

export function buildServer({ origin }) {
  const server = new McpServer(
    { name: 'vado-tfp', version: '1.0.0', title: 'VADO — العرض الفني والمالي' },
    { instructions: INSTRUCTIONS });

  /* ---- reference the assistant reads ---------------------------------- */

  for (const doc of knowledge) {
    server.registerResource(doc.id, 'vado://' + doc.id,
      { title: doc.title, description: doc.why, mimeType: 'text/markdown' },
      async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown',
                                   text: doc.text }] }));
  }

  server.registerResource('services', 'vado://services',
    { title: 'الخدمات الإحدى عشرة',
      description: 'The eleven services, with the id to pass to proposal_set. '
        + 'Anything not named is printed N/A on page 8.',
      mimeType: 'application/json' },
    async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json',
      text: JSON.stringify(content.services.items.map(s => ({
        id: s.id, ar: s.ar.trim(), en: s.en.trim() })), null, 2) }] }));

  server.registerResource('lists', 'vado://lists',
    { title: 'القوائم المغلقة',
      description: 'The closed lists: the twenty Saudi architecture zones, the '
        + 'four levels, the five styles. A value not on a list is refused.',
      mimeType: 'application/json' },
    async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json',
      text: JSON.stringify(content.lists, null, 2) }] }));

  server.registerResource('phases', 'vado://phases',
    { title: 'المراحل',
      description: 'The phases pages 9 and 11 share, with the id to pass as a '
        + 'duration and the service each one needs before it appears.',
      mimeType: 'application/json' },
    async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json',
      text: JSON.stringify(content.phases.rows
        .filter(r => r.no != null)
        .map(r => ({ id: r.id, code: (r.code || '').trim(),
                     name_ar: r.name_ar, requires: r.requires || null })),
        null, 2) }] }));

  /* ---- the proposal ---------------------------------------------------- */

  server.registerTool('proposal_start', {
    title: 'Start a proposal',
    description:
      'Begin a new VADO proposal and get back a job_id to use in every later '
      + 'call. Pass anything the user has already given you: it is written '
      + 'straight in and reported back. Values that follow on their own are '
      + 'filled here and must never be asked for: today\'s date, the fourteen '
      + 'day validity, الصك as the area source, the fee in Arabic words, and '
      + 'the one-line brief on page 4. Returns what is still missing, grouped '
      + 'by the one place each group is answered from.',
    inputSchema: z.object({
      fields: z.record(z.string(), scalar).optional().describe(
        'Any of the document\'s values, keyed by field name. See vado://fields.'),
      estimated: z.array(z.string()).optional().describe(
        'Field names whose value is a stand-in rather than something read off '
        + 'the source. They print with «تقريبًا» beside them and are named in '
        + 'every read-back until cleared.'),
      services: z.array(z.enum(SERVICE_IDS)).optional(),
      note: z.string().optional().describe(
        'A line for whoever opens this job file later. Not printed.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false,
                   idempotentHint: false, openWorldHint: false },
  }, async ({ fields, estimated, services, note }) => {
    const id = newId();
    const data = job.blank();
    if (note) data._doc = note;
    const wrote = job.setFields(data, fields || {});
    if (services) job.setServices(data, services);
    job.markEstimates(data, estimated, []);
    Object.assign(wrote.applied, job.setFields(data, translit.twins(data.fields)).applied);
    job.autofill(data);
    await saveJob(id, data);
    return text(state(id, data, {
      written: wrote.applied,
      refused: wrote.rejected,
      derived: { date: data.fields.date, tfp_dur: data.fields.tfp_dur,
                 areasource: data.fields.areasource,
                 costwritten: 'auto', spatialneeds: data.fields.spatialneeds },
      say_to_user:
        'Ask for whatever they already have, in whatever shape it is in, '
        + 'rather than running a questionnaire.',
    }));
  });

  server.registerTool('proposal_set', {
    title: 'Write into a proposal',
    description:
      'Write values, services, the room brief, phase durations or the payment '
      + 'schedule into a proposal. Everything is optional; send whatever the '
      + 'user just answered, in one call. A value that fails a check is '
      + 'refused with the reason and nothing else in the call is lost. '
      + 'Returns what to ask for next.',
    inputSchema: z.object({
      job_id: jobId,
      fields: z.record(z.string(), scalar).optional().describe(
        'Values by field name. An empty string clears one. Closed lists, the '
        + 'date format and the fee format are checked here, not at the end.'),
      estimated: z.array(z.string()).optional().describe(
        'Mark these as stand-ins. Send them in the SAME call that writes the '
        + 'value, never later.'),
      confirmed: z.array(z.string()).optional().describe(
        'Clear the stand-in mark: the real value has now arrived.'),
      services: z.array(z.enum(SERVICE_IDS)).optional().describe(
        'Replaces the whole list. Everything not named prints N/A on page 8.'),
      spatial: z.object({
        groups: z.array(z.object({
          title_ar: z.string().describe('The group heading, in Arabic.'),
          items: z.array(z.string()).optional().describe(
            'A flat list, for a group with no parts: مواقف, حديقة.'),
          blocks: z.array(z.object({
            name_ar: z.string().describe('The part: الدور الأرضي, مبنى الخدمات.'),
            contents_ar: z.string().describe(
              'What is inside it, one comma-separated Arabic sentence.'),
          })).optional(),
        })),
      }).optional().describe(
        'The room schedule on page 5. It has NO fixed shape: a villa has '
        + 'outdoor spaces and floors, a fuel station has a forecourt and '
        + 'buildings. Ask what the project actually has. This is the page '
        + 'most likely to carry the last client\'s villa into this one.'),
      /* partialRecord, not record: a record keyed by an enum makes EVERY
       * phase required, so a caller setting one duration was told the
       * other eight were missing. */
      durations: z.partialRecord(z.enum(PHASE_IDS), scalar)
        .optional().describe(
          'Days per phase. The bar lengths, the grid width and every later '
          + 'phase follow from these. See vado://phases.'),
      payments: z.array(z.object({
        when: z.enum(TRIGGERS).describe(
          'adv = دفعة مقدمة · before = قبل · after = بعد · none = no word at '
          + 'all, for an event that carries its own preposition · custom = '
          + 'your own word in when_ar.'),
        when_ar: z.string().optional().describe('Only with when="custom".'),
        event_ar: z.string().describe('The event itself, in Arabic.'),
        pct: scalar.describe(
          'The share of the fee as a bare number. The % is printed, never typed.'),
      })).optional().describe(
        'Replaces the whole schedule; any number of rows. The heading the '
        + 'client reads and the sentence under it are both built from these '
        + 'three parts, so a payment cannot say one thing above and another '
        + 'below. The house default is 30/30/30/10.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false,
                   idempotentHint: true, openWorldHint: false },
  }, async ({ job_id, fields, estimated, confirmed, services, spatial,
              durations, payments }) => {
    const data = await readJob(job_id);
    if (!data) return notFound(job_id);

    const refused = [], written = {};
    if (fields) {
      const r = job.setFields(data, fields);
      Object.assign(written, r.applied);
      refused.push(...r.rejected);
      Object.assign(written, job.setFields(data, translit.twins(data.fields)).applied);
    }
    if (estimated || confirmed) job.markEstimates(data, estimated, confirmed);
    if (services) refused.push(...(job.setServices(data, services).rejected || []));
    if (spatial) refused.push(...(job.setSpatial(data, spatial).rejected || []));
    if (durations) {
      const r = job.setDurations(data, durations);
      written.durations = r.applied;
      refused.push(...r.rejected);
    }
    if (payments) {
      const r = job.setPayments(data, payments);
      refused.push(...(r.rejected || []));
      if (r.payments) written.payments = r.payments.length + ' rows';
    }
    job.autofill(data);
    await saveJob(job_id, data);

    const ctx = job.ctxFor(data);
    return text(state(job_id, data, {
      written,
      refused,
      /* Read back the arithmetic, so a wrong share is seen as a wrong riyal
       * figure rather than as a percentage nobody multiplied. */
      money: data.fields.costnumber ? {
        fee: ctx.field('costnumber'),
        in_words: ctx.field('costwritten'),
        payments: ctx.payments().map(r => `${r.no} ${r.pct} ${r.amount} — ${r.title_ar}`),
        total: ctx.paymentTotals().pct,
      } : undefined,
      programme: Object.keys(data.durations || {}).length
        ? { total_days: Math.round(ctx.timelinePlan().total_days) } : undefined,
    }));
  });

  server.registerTool('proposal_review', {
    title: 'Check a proposal before it is sent',
    description:
      'The pre-send check. Returns what is missing, what disagrees with '
      + 'itself, which values are stand-ins, and a full read-back of every '
      + 'value about to reach the client. Run it before proposal_finish, and '
      + 'PRINT THE READ-BACK for the user rather than summarising it: it is '
      + 'the last place a wrong plot number is caught, and only somebody who '
      + 'knows the project can catch it. It runs the same rules the browser '
      + 'runs, so the two can never disagree about what stops a proposal.',
    inputSchema: z.object({ job_id: jobId }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ job_id }) => {
    const data = await readJob(job_id);
    if (!data) return notFound(job_id);
    return text({ job_id, ...review(data) });
  });

  server.registerTool('proposal_finish', {
    title: 'Hand over the finished proposal',
    description:
      'Save the proposal and return the private link that opens it, already '
      + 'filled, in VADO\'s deck tool. The employee reads pages 5 and 12, then '
      + 'presses حمّل الـ PDF. The link asks for the office password once. '
      + 'Also returns the job file itself, which build.py accepts unchanged. '
      + 'Call proposal_review first: this does not refuse to hand over an '
      + 'unfinished proposal, because one goes out while a بلدي value is '
      + 'still being chased, but it names what is still open.',
    inputSchema: z.object({ job_id: jobId }),
    annotations: { readOnlyHint: false, destructiveHint: false,
                   idempotentHint: true, openWorldHint: false },
  }, async ({ job_id }) => {
    const data = await readJob(job_id);
    if (!data) return notFound(job_id);
    const found = review(data);
    const ref = String((data.fields || {}).tfp_number || '').trim();
    const base = ((ref && ref.indexOf('{{') !== 0) ? ref : 'VADO-TFP')
      + ', TFP R00';
    return text({
      job_id,
      open_in_browser: `${origin}/?job=${encodeURIComponent(job_id)}`,
      pdf_will_be_named: base.replace(/[\\/:*?"<>|]+/g, '-').trim(),
      still_open: {
        missing: found.missing.length,
        problems: found.blocking.length,
        estimated: found.estimated.length,
      },
      say_before_pdf: found.before_pdf,
      job_file: data,
      say_to_user:
        'Give them the link and say what is still open. The last step is '
        + 'theirs: open it, read pages 5 and 12, then حمّل الـ PDF.',
    });
  });

  server.registerTool('proposal_get', {
    title: 'Read a proposal back',
    description:
      'The whole job file plus what is still missing. Use it to pick up a '
      + 'proposal from an earlier conversation, or before amending one.',
    inputSchema: z.object({ job_id: jobId }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ job_id }) => {
    const data = await readJob(job_id);
    if (!data) return notFound(job_id);
    return text(state(job_id, data, { job_file: data }));
  });

  server.registerTool('proposal_list', {
    title: 'List the office\'s proposals',
    description:
      'Recent proposals, newest first, with the client and the fee, so an '
      + 'amendment can find the right one. "Put the price up on Fahad\'s" '
      + 'starts here.',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(50).optional(),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ limit }) => {
    const rows = await listJobs(limit || 25);
    return text({
      proposals: rows.map(r => {
        const f = r.job.fields || {};
        const p = job.progress(r.job);
        return {
          job_id: r.id,
          tfp_number: f.tfp_number || null,
          client: [f.name_title_ar, f.firstname_ar, f.lastname_ar]
            .filter(Boolean).join(' ') || null,
          project: [f.project_type_ar, f.city_ar].filter(Boolean).join(' · ') || null,
          fee: f.costnumber || null,
          saved: r.at,
          progress: `${p.filled} of ${p.total} values`,
        };
      }),
    });
  });

  /* ---- the two lookups that save a round trip -------------------------- */

  server.registerTool('balady_read', {
    title: 'Read pasted بلدي plot data',
    description:
      'Match the fifteen regulatory values in a block of text copied from بلدي '
      + 'or المستكشف الجغرافي. Returns what it found and what it did not, so '
      + 'you ask two questions rather than fifteen. It matches on the Arabic '
      + 'label and takes the value verbatim: 60% is not turned into 0.6 and '
      + '«1/5 عرض الشارع» is not turned into a number, because the client may '
      + 'hold the page next to the بلدي screen. If the user sent a SCREENSHOT '
      + 'instead, read it yourself, then show every value back as a table and '
      + 'ask them to confirm before writing: a misread digit in a setback '
      + 'reaches the client as a professional statement.',
    inputSchema: z.object({
      text: z.string().describe('The pasted plot panel, as it came.'),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ text: pasted }) => text(readBalady(pasted)));

  server.registerTool('reference_lookup', {
    title: 'Look up the English twin of an Arabic name',
    description:
      'The house spelling for a title, city, district or project type. Al '
      + 'takes a space: "Al Mulla", never "AlMulla". A name not on the list '
      + 'returns nothing, which means propose a transliteration and say out '
      + 'loud that you are proposing it. Omit `arabic` to get the whole table.',
    inputSchema: z.object({
      kind: z.enum(['title', 'city', 'district', 'project_type']),
      arabic: z.string().optional(),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ kind, arabic }) => {
    if (!arabic) return text({ kind, table: translit.all(kind) });
    const found = translit.english(kind, arabic);
    return text({ kind, arabic, english: found,
      note: found ? null
        : 'Not on the list, which is normal. Propose a transliteration in the '
          + 'same habit (Al with a space) and tell the user you are guessing.' });
  });

  /* ---- the ways in ------------------------------------------------------ */

  server.registerPrompt('new_proposal', {
    title: 'عرض جديد — start a proposal',
    description: 'Begin a VADO proposal from whatever the user is holding.',
    argsSchema: z.object({
      have: z.string().optional().describe(
        'Anything they already have: a WhatsApp thread, deed details, a بلدي '
        + 'paste. Leave empty to be asked for it.'),
    }),
  }, ({ have }) => ({
    messages: [{ role: 'user', content: { type: 'text', text:
      'ابدأ عرضاً فنياً ومالياً جديداً لـ VADO.\n\n' +
      (have ? 'هذا ما لدي:\n\n' + have
            : 'اسألني عما لدي أولاً، ثم اقرأه واذكر ما نقص.') +
      '\n\nاقرأ vado://guide أولاً، ثم ابدأ بـ proposal_start.' } }],
  }));

  server.registerPrompt('amend_proposal', {
    title: 'تعديل عرض — change a proposal already made',
    description: 'Find an existing proposal and change something in it.',
    argsSchema: z.object({
      which: z.string().optional().describe(
        'The client, the TFP number, or the job_id.'),
      change: z.string().optional().describe('What to change.'),
    }),
  }, ({ which, change }) => ({
    messages: [{ role: 'user', content: { type: 'text', text:
      'عدّل عرضاً موجوداً.\n\n' +
      (which ? 'العرض: ' + which + '\n' : '') +
      (change ? 'التعديل: ' + change + '\n' : '') +
      '\nابدأ بـ proposal_list لإيجاده، ثم proposal_get، ثم proposal_set. ' +
      'أبقِ رقم العرض كما هو ما لم يُطلب إصدار جديد، ثم proposal_review ' +
      'وقل ما الذي تغيّر.' } }],
  }));

  server.registerPrompt('read_balady', {
    title: 'قراءة بيانات بلدي',
    description: 'Turn a pasted بلدي plot panel into the fifteen values.',
    argsSchema: z.object({
      paste: z.string().describe('The plot panel, copied from بلدي.'),
      job_id: z.string().optional(),
    }),
  }, ({ paste, job_id }) => ({
    messages: [{ role: 'user', content: { type: 'text', text:
      'اقرأ بيانات القطعة التالية من بلدي:\n\n' + paste +
      (job_id ? '\n\nواكتبها في العرض ' + job_id : '') +
      '\n\nاستخدم balady_read، ثم اعرض ما قرأته وما لم تجده قبل الكتابة.' } }],
  }));

  return server;
}
