/* Where a proposal lives between one message and the next.
 *
 * MCP has no session any more: the 2026-07-28 revision took connection
 * state out of the protocol and says that a server needing state hands the
 * client a handle and takes it back as an ordinary argument. `job_id` is
 * that handle, and this file is what it points at.
 *
 * One blob per proposal, the same shape `api/templates.js` settled on, and
 * for the same reason: a write here can never touch anyone else's work.
 *
 * Reads go through `get(pathname)` with the CDN cache off, which asks the
 * origin and answers with what was last written. `list` is the one call
 * that lags, by about ten seconds, so it is used only for browsing the
 * office's proposals, where a missing newest row costs nothing. Never read
 * a single job through `list`: an assistant hands over a link seconds after
 * saving, and the person clicking it would meet a 404.
 */
import { put, del, list, get } from '@vercel/blob';

const ROOT = 'jobs/';
const path = id => ROOT + encodeURIComponent(id) + '.json';

/* A folder instead of the blob store, for `tools/mcp_selftest.mjs`.
 *
 * Opt-in through an environment variable that production never sets, and
 * never a fallback: a store that quietly appears when the token is missing
 * would serve a whole afternoon's proposals out of a serverless function's
 * scratch disk and lose them at the next cold start. `api/mcp.mjs` refuses
 * every request when no blob token is configured, so this cannot be reached
 * by accident.
 */
const LOCAL = process.env.VADO_JOB_DIR || '';
async function fs_() { return import('node:fs/promises'); }
const localPath = id => LOCAL + '/' + encodeURIComponent(id) + '.json';

/* A handle the assistant can read back to a human without transcribing a
 * mistake: no vowels, so nothing spells a word, and no 0/O or 1/l. */
const ALPHABET = '23456789bcdfghjkmnpqrstvwxz';

export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function configured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function saveJob(id, job) {
  if (LOCAL) {
    const fs = await fs_();
    await fs.mkdir(LOCAL, { recursive: true });
    await fs.writeFile(localPath(id), JSON.stringify(job, null, 2));
    return id;
  }
  await put(path(id), JSON.stringify(job, null, 2), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
  return id;
}

export async function readJob(id) {
  if (LOCAL) {
    const fs = await fs_();
    try { return JSON.parse(await fs.readFile(localPath(id), 'utf8')); }
    catch (e) { return null; }
  }
  const got = await get(path(id), { access: 'private', useCache: false });
  if (!got || got.statusCode !== 200) return null;
  return JSON.parse(await new Response(got.stream).text());
}

export async function deleteJob(id) {
  if (LOCAL) {
    const fs = await fs_();
    try { await fs.unlink(localPath(id)); } catch (e) { /* already gone */ }
    return;
  }
  try { await del(path(id)); } catch (e) { /* already gone */ }
}

/* The office's proposals, newest first. Every row costs a fetch, so this
 * takes the newest `limit` and stops; nobody browses past twenty-five. */
export async function listJobs(limit = 25) {
  const rows = [];
  if (LOCAL) {
    const fs = await fs_();
    let names = [];
    try { names = await fs.readdir(LOCAL); } catch (e) { return []; }
    for (const name of names.filter(n => n.endsWith('.json'))) {
      const stat = await fs.stat(LOCAL + '/' + name);
      rows.push({ id: decodeURIComponent(name.replace(/\.json$/, '')),
                  at: stat.mtime });
    }
    rows.sort((a, b) => new Date(b.at) - new Date(a.at));
    return Promise.all(rows.slice(0, limit).map(async r =>
      ({ ...r, job: await readJob(r.id) })));
  }
  let cursor;
  do {
    const page = await list({ prefix: ROOT, cursor, limit: 1000 });
    for (const b of page.blobs) {
      const id = decodeURIComponent(b.pathname.slice(ROOT.length)
                                     .replace(/\.json$/, ''));
      rows.push({ id, at: b.uploadedAt });
    }
    cursor = page.cursor;
  } while (cursor);

  rows.sort((a, b) => new Date(b.at) - new Date(a.at));
  const wanted = rows.slice(0, limit);
  const jobs = await Promise.all(wanted.map(async r => {
    try { return { ...r, job: await readJob(r.id) }; }
    catch (e) { return { ...r, job: null }; }   /* one bad row hides no other */
  }));
  return jobs.filter(r => r.job);
}
