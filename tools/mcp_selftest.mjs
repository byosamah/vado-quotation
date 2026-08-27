/* Drive the MCP server the way a connector does, with no server running.
 *
 *     node tools/mcp_selftest.mjs
 *
 * `createMcpHandler` answers a web-standard Request, so the whole endpoint
 * can be exercised in process: real JSON-RPC bodies, real schema
 * validation, real tool handlers. What it does not exercise is Vercel's
 * routing and the OAuth flow; `tools/mcp_live.sh` does those against a
 * deployment.
 *
 * It runs one proposal end to end, the way an employee's assistant would,
 * and then asks the questions that matter: did a value that fails a check
 * get refused, did the fee reach the payment rows as riyals, does the
 * review name a بلدي value nobody marked, and is the link the shape the
 * browser can open.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'vado-mcp-selftest-'));
process.env.VADO_JOB_DIR = dir;

/* The SDK is a dependency of `web/`, which is the whole deployment, and
 * this file is not in it. Node resolves a bare import from the importing
 * file's own folder, so the path is spelled out rather than left to a
 * node_modules at the repository root that nothing else would want. */
const SDK = new URL(
  '../web/node_modules/@modelcontextprotocol/server/dist/index.mjs',
  import.meta.url).href;
const { createMcpHandler } = await import(SDK);
const { buildServer } = await import('../web/api/_mcp/server.mjs');
const ORIGIN = 'https://vado-tfp.example';
const handler = createMcpHandler(() => buildServer({ origin: ORIGIN }),
                                 { legacy: 'stateless' });

const PROTOCOL = '2026-07-28';
let seq = 0;
let failures = 0;

async function rpc(method, params = {}) {
  const body = {
    jsonrpc: '2.0', id: ++seq, method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': PROTOCOL,
        'io.modelcontextprotocol/clientCapabilities': {},
        'io.modelcontextprotocol/clientInfo': { name: 'selftest', version: '1' },
      },
    },
  };
  /* SEP-2243: a Streamable HTTP POST mirrors the method, and the name of
   * whatever it addresses, into headers so an intermediary can route
   * without parsing the body. The endpoint rejects a request whose headers
   * and body disagree, which is what this is copying. */
  const headers = { 'content-type': 'application/json',
                    accept: 'application/json, text/event-stream',
                    'mcp-method': method };
  const named = params.name || params.uri;
  if (named) headers['mcp-name'] = named;
  const res = await handler.fetch(new Request(`${ORIGIN}/mcp`, {
    method: 'POST', headers, body: JSON.stringify(body),
  }));
  const raw = await res.text();
  const line = raw.startsWith('event:') || raw.startsWith('data:')
    ? raw.split('\n').filter(l => l.startsWith('data:')).pop().slice(5).trim()
    : raw;
  let parsed;
  try { parsed = JSON.parse(line); }
  catch (e) { throw new Error(`${method}: ${res.status} ${raw.slice(0, 400)}`); }
  if (parsed.error) throw new Error(`${method}: ${JSON.stringify(parsed.error)}`);
  return parsed.result;
}

async function call(name, args) {
  const out = await rpc('tools/call', { name, arguments: args });
  if (out.isError) {
    const said = (out.content || []).map(c => c.text).join(' ');
    throw new Error(`${name} refused the call: ${said}`);
  }
  return out.structuredContent ?? JSON.parse(out.content[0].text);
}

function ok(what, cond, detail) {
  if (cond) { console.log('  ok    ' + what); return; }
  failures += 1;
  console.log('  FAIL  ' + what + (detail ? '\n        ' + detail : ''));
}

/* A real بلدي panel, in the two shapes one arrives in: value on the same
 * line after a colon, and value on the line below the label. */
const BALADY_PASTE = `
رمز الاستخدام : س-1-ب سكني
نوع التقسيم : لايوجد
وصف التقسيم : لايوجد
الاستخدام لقطعة الأرض
سكني
وصف اشتراط البناء
سكني بنسبة 60% من مساحة الارض بارتفاع عدد 2 طابق بحد اقصى 10 متر
عدد الوحدات : وحدة واحدة بالقطعة
نسبة البناء : 60%
الحد الأدنى للواجهة : 20
ارتداد الواجهة : 1/5 عرض الشارع
ارتداد الجوانب : 2
ارتداد خلفي : 2
عدد الأدوار : 2
ارتفاع المبنى : 10 م
`.trim();

console.log('MCP self-test\n');

/* ---- what the connector sees first ------------------------------------ */

const discover = await rpc('server/discover');
/* The server names itself in the result's `_meta`, not in the body: every
 * 2026-07-28 result carries io.modelcontextprotocol/serverInfo. */
const who = (discover._meta || {})['io.modelcontextprotocol/serverInfo'] || {};
ok('server/discover names the server', who.name === 'vado-tfp',
   JSON.stringify(discover._meta));
ok('server/discover offers the 2026-07-28 revision',
   (discover.supportedVersions || []).includes('2026-07-28'),
   JSON.stringify(discover.supportedVersions));
ok('the instructions carry the rule about regulatory values',
   String(discover.instructions || '').includes('NEVER invent a regulatory value'));

const tools = await rpc('tools/list');
const names = tools.tools.map(t => t.name).sort();
ok('eight tools are offered', names.length === 8, names.join(', '));
ok('every tool has a description',
   tools.tools.every(t => t.description && t.description.length > 40));

const resources = await rpc('resources/list');
const uris = resources.resources.map(r => r.uri);
ok('the guide is a resource', uris.includes('vado://guide'), uris.join(', '));
ok('the field table is a resource', uris.includes('vado://fields'));

const guide = await rpc('resources/read', { uri: 'vado://guide' });
ok('the guide states the rule about regulatory values',
   guide.contents[0].text.includes('Never invent a regulatory value'));

const prompts = await rpc('prompts/list');
ok('three ways in are offered', prompts.prompts.length === 3,
   prompts.prompts.map(p => p.name).join(', '));

/* ---- one proposal, end to end ----------------------------------------- */

const started = await call('proposal_start', {
  fields: {
    tfp_number: '260827MKM-RES-VILLA',
    name_title_ar: 'الأستاذ', firstname_ar: 'سعود', lastname_ar: 'الدوسري',
    phone: '050 333 4455', email: 'saud.d@gmail.com',
    project_type_ar: 'فيلا سكنية', city_ar: 'الخبر', district_ar: 'الراكة',
    lotarea: '512', lotnumber: '27', districtnumber: '18',
  },
  note: 'MCP self-test. Not a real client.',
});
const id = started.job_id;
ok('a job_id comes back', typeof id === 'string' && id.length >= 8, id);
ok('the date is filled without being asked', /^\d\d [A-Z]{3} \d{4}$/.test(started.derived.date),
   started.derived.date);
ok('the validity defaults to fourteen days', started.derived.tfp_dur === '14');
ok('the English twins follow from the Arabic',
   started.written.city === 'Khobar' && started.written.district === 'Ar Rakah'
   && started.written.name_title === 'Mr.',
   JSON.stringify(started.written));
ok('what to ask next is grouped by source',
   started.ask_next.length > 0 && started.ask_next.every(a => a.from),
   JSON.stringify(started.ask_next.map(a => a.en)));
ok('services are asked for first',
   started.ask_next[0].fields[0] === 'services',
   started.ask_next[0].en);

/* ---- the بلدي paste ---------------------------------------------------- */

const read = await call('balady_read', { text: BALADY_PASTE });
/* The paste above genuinely carries thirteen of the fifteen: بلدي often
 * omits معامل كتلة البناء and يمكن اضافة دور, which is the case this has to
 * handle without inventing either. */
ok('thirteen of fifteen بلدي values are read from one paste',
   read.read === 13, `read ${read.read} of ${read.of}: missing ` +
   read.not_found.join(', '));
ok('a value is taken verbatim, not tidied',
   read.fields.buildingratio === '60%', read.fields.buildingratio);
ok('a rule survives as a rule',
   read.fields.frontsetback === '1/5 عرض الشارع', read.fields.frontsetback);
ok('the whole use code is kept',
   read.fields.usecode === 'س-1-ب سكني', read.fields.usecode);
ok('a sentence is kept whole',
   read.fields.usedesc.startsWith('سكني بنسبة 60%'), read.fields.usedesc);
ok('what it could not find is named, both of them',
   read.not_found.length === 2 && read.not_found.includes('farratio') &&
   read.not_found.includes('canaddfloor'), read.not_found.join(', '));

await call('proposal_set', { job_id: id, fields: read.fields });

/* ---- a value that must be refused ------------------------------------- */

const bad = await call('proposal_set', {
  job_id: id,
  fields: { ksaarchzone: 'عمارة الخبر', date: '2026-08-27', costwritten: 'خمسة' },
});
const refusedFields = bad.refused.map(r => r.field).sort();
ok('a zone that is not on the closed list is refused',
   refusedFields.includes('ksaarchzone'), JSON.stringify(bad.refused));
ok('a date in the wrong shape is refused', refusedFields.includes('date'));
ok('the price in words cannot be typed', refusedFields.includes('costwritten'));
ok('a refusal says what is allowed',
   bad.refused.every(r => r.why && r.why.length > 20));

/* ---- the rest of the answers ------------------------------------------ */

await call('proposal_set', {
  job_id: id,
  fields: {
    ksaarchzone: 'عمارة الساحل الشرقي',
    ksaarchlevel: 'مستوى 3 (معاصر, انتقالي, تقليدي)',
    archstyle: 'معاصر',
    coordinates: '26.3010, 50.2083',
    nat_address: 'RAKA2345, 7639 - 34413',
    googlelink: 'https://maps.app.goo.gl/xxxxxxxxxxxx',
    farratio: 'غير محدد', canaddfloor: 'لا',
    costnumber: '45,000',
  },
  estimated: ['farratio', 'canaddfloor', 'coordinates', 'nat_address',
              'googlelink', 'map'],
  services: ['concept', 'engineering', 'permit'],
  spatial: { groups: [
    { title_ar: 'المساحات الخارجية', items: ['موقف 3 سيارات', 'حديقة'] },
    { title_ar: 'المساحات الداخلية', blocks: [
      { name_ar: 'الدور الأرضي', contents_ar: 'مجلس , صالة معيشة , مطبخ , دورتا مياه' },
      { name_ar: 'الدور الأول', contents_ar: 'غرفة نوم رئيسية (ماستر) , ثلاث غرف نوم' },
      { name_ar: 'الملحق العلوي', contents_ar: 'غرفة غسيل , مستودع' },
    ] },
  ] },
  durations: { concept: 7, concept_drawings: 21, develop: 7, technical: 45,
               permit: 7, boq: 14 },
  payments: [
    { when: 'adv', event_ar: 'عند قبول هذا العرض وتوقيع العقد', pct: 30 },
    { when: 'after', event_ar: 'موافقة المالك على التصميم المبدئي', pct: 30 },
    { when: 'after', event_ar: 'اكتمال الرسوم التنفيذية', pct: 30 },
    { when: 'before', event_ar: 'جدول الكميات والمواصفات', pct: 10 },
  ],
});

const filled = await call('proposal_get', { job_id: id });
ok('the fee is spelled in Arabic without being asked',
   filled.job_file.fields.costwritten === 'auto');
ok('the one-line brief follows the storeys',
   filled.job_file.fields.spatialneeds === 'auto');
ok('the first four shares are written back to p1..p4',
   filled.job_file.fields.p1 === '30%' && filled.job_file.fields.p4 === '10%',
   JSON.stringify(filled.job_file.fields.p1));

/* ---- the shapes a model actually sends --------------------------------- */

/* A model sending 512 rather than "512" is being reasonable. Refusing the
 * whole call over it would lose the values sent alongside. */
const loose = await call('proposal_set', {
  job_id: id,
  fields: { minimumelev: 20 },
  durations: { develop: '7' },
  payments: [
    { when: 'adv', event_ar: 'عند قبول هذا العرض وتوقيع العقد', pct: '30' },
    { when: 'after', event_ar: 'موافقة المالك على التصميم المبدئي', pct: 30 },
    { when: 'after', event_ar: 'اكتمال الرسوم التنفيذية', pct: 30 },
    { when: 'before', event_ar: 'جدول الكميات والمواصفات', pct: 10 },
  ],
});
ok('a number where a string was expected is taken, not refused',
   loose.refused.length === 0 && loose.written.minimumelev === '20',
   JSON.stringify(loose.refused));
ok('a share written as text still reaches the riyal column',
   loose.money.payments[0].includes('13,500.00'),
   JSON.stringify(loose.money.payments[0]));

/* ---- the check --------------------------------------------------------- */

const found = await call('proposal_review', { job_id: id });
ok('nothing disagrees with itself', found.blocking.length === 0,
   JSON.stringify(found.blocking));
ok('the read-back carries every payment as riyals',
   found.read_back.payments.length === 4 &&
   found.read_back.payments[0].amount === '13,500.00',
   JSON.stringify(found.read_back.payments.map(p => p.amount)));
ok('the payments total the whole fee',
   found.read_back.payments_total.share === '100%' &&
   found.read_back.payments_total.amount === '45,000.00',
   JSON.stringify(found.read_back.payments_total));
ok('the price in words is on the read-back',
   found.read_back.values.some(g => g.values.some(
     v => v.field === 'costwritten' && /أربعون ألف/.test(v.value || ''))));
ok('the brief is read back room by room',
   found.read_back.brief.length === 2 &&
   found.read_back.brief[1].blocks.length === 3);
/* Eighty-three, not ninety: the licence phase starts eighteen days before
 * the technical drawings finish, because it is submitted off drawings in
 * progress. That overlap is a studio rule in content.json, not a duration
 * anybody types. */
ok('the programme adds up, overlap included',
   found.read_back.total_days === 83, String(found.read_back.total_days));
ok('the eleven services are read back with three sold',
   found.read_back.services.length === 11 &&
   found.read_back.services.filter(s => s.included).length === 3);
ok('what was marked as a stand-in is named',
   found.estimated.length === 6, JSON.stringify(found.estimated.map(e => e.field)));
ok('بلدي values nobody marked are named every time',
   found.regulatory_stated_as_read.length > 0,
   String(found.regulatory_stated_as_read.length));
ok('the deck says the same thing before it prints',
   found.before_pdf.some(line => line.includes('تقريبية')),
   JSON.stringify(found.before_pdf));

/* ---- a split that does not reach 100 ----------------------------------- */

await call('proposal_set', {
  job_id: id,
  payments: [
    { when: 'adv', event_ar: 'عند التوقيع', pct: 30 },
    { when: 'after', event_ar: 'اكتمال الرسوم التنفيذية', pct: 30 },
  ],
});
const short = await call('proposal_review', { job_id: id });
ok('a split that misses 100 is caught',
   short.blocking.some(b => b.what.includes('مجموع الدفعات')),
   JSON.stringify(short.blocking));
ok('a fifth field is not invented for a shorter schedule',
   short.read_back.payments.length === 2);

/* ---- handing it over ---------------------------------------------------- */

const done = await call('proposal_finish', { job_id: id });
ok('the link opens the deck with this job',
   done.open_in_browser === `${ORIGIN}/?job=${id}`, done.open_in_browser);
ok('the PDF is named the way the browser names it',
   done.pdf_will_be_named === '260827MKM-RES-VILLA, TFP R00',
   done.pdf_will_be_named);
ok('the job file comes back whole',
   done.job_file && done.job_file.fields && done.job_file.spatial,
   Object.keys(done.job_file || {}).join(', '));
ok('what is still open is stated', done.still_open.estimated === 6,
   JSON.stringify(done.still_open));

const listed = await call('proposal_list', {});
ok('the proposal can be found again',
   listed.proposals.some(p => p.job_id === id &&
                              p.client === 'الأستاذ سعود الدوسري'),
   JSON.stringify(listed.proposals[0]));

/* ---- a proposal that does not exist ------------------------------------ */

const missing = await rpc('tools/call',
  { name: 'proposal_get', arguments: { job_id: 'nosuchjob' } });
ok('an unknown job_id is refused, not invented',
   missing.isError === true && missing.content[0].text.includes('proposal_list'));

/* ---- the lookups -------------------------------------------------------- */

const spelled = await call('reference_lookup',
  { kind: 'district', arabic: 'الثقبة' });
ok('the house spelling comes back', spelled.english === 'Al Thuqbah',
   String(spelled.english));
const unknown = await call('reference_lookup',
  { kind: 'district', arabic: 'حي لا وجود له' });
ok('a name not on the list says so rather than guessing',
   unknown.english === null && unknown.note.includes('guessing'));

rmSync(dir, { recursive: true, force: true });
console.log(failures ? `\n${failures} failure(s).` : '\nall good');
process.exit(failures ? 1 : 0);
