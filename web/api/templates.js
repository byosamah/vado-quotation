/* The office's shared templates.
 *
 * One blob per template, not one file holding all of them. The whole-file
 * version lost data: Vercel Blob is eventually consistent, so two people
 * saving within about ten seconds each read the same stale copy, applied
 * their own change to it, and wrote it back. The second write silently
 * erased the first. Deleting three templates in a row resurrected two of
 * them.
 *
 * With a blob per template a write only ever touches its own file, so
 * nothing anyone else did can be undone by it. The list can lag a few
 * seconds behind, which for templates is nothing; losing one is not.
 *
 * Behind the same password as the rest: middleware.js matches every path.
 */
import { put, del, list } from '@vercel/blob';

const ROOT = 'templates/';
const key = (page, name) => ROOT + encodeURIComponent(page) + '/' +
                            encodeURIComponent(name) + '.json';

async function readAll() {
  const out = {};
  let cursor;
  do {
    const page = await list({ prefix: ROOT, cursor, limit: 1000 });
    for (const b of page.blobs) {
      const rest = b.pathname.slice(ROOT.length);
      const slash = rest.indexOf('/');
      if (slash < 0) continue;
      const pageId = decodeURIComponent(rest.slice(0, slash));
      const name = decodeURIComponent(rest.slice(slash + 1).replace(/\.json$/, ''));
      try {
        const res = await fetch(b.downloadUrl + '?t=' + Date.now(), {
          cache: 'no-store',
          headers: { Authorization: 'Bearer ' + process.env.BLOB_READ_WRITE_TOKEN },
        });
        if (!res.ok) continue;
        (out[pageId] || (out[pageId] = {}))[name] = await res.json();
      } catch (e) { /* one unreadable template must not hide the rest */ }
    }
    cursor = page.cursor;
  } while (cursor);
  return out;
}

/* The password is ambient authority. Once a browser has been given it for
 * this origin it attaches it to anything that reaches the origin, including
 * a form posted from a page somebody else wrote. Without a check below, an
 * employee with the tool open in one tab could visit any other site and
 * have the office's templates overwritten or deleted from under them, with
 * nothing recording who did it.
 *
 * A cross-origin HTML form can only send urlencoded, multipart or plain
 * text. It cannot send application/json. So insisting on JSON is the whole
 * defence, and the editor already sends exactly that. The origin check is
 * the belt to those braces, and costs one header read.
 *
 * Reads are left alone: GET changes nothing, and the reply is unreadable
 * across origins anyway. */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;          /* curl, and same-origin form-less posts */
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try { return new URL(origin).host === host; } catch (e) { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') return res.status(200).json(await readAll());

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const ct = String(req.headers['content-type'] || '').split(';')[0].trim();
  if (ct !== 'application/json')
    return res.status(415).json({ error: 'content-type must be application/json' });

  if (!sameOrigin(req))
    return res.status(403).json({ error: 'cross-origin write refused' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  const { op, page, name, template } = body || {};
  if (!page || !name || (op !== 'put' && op !== 'del')) {
    return res.status(400).json({ error: 'need op (put|del), page and name' });
  }

  if (op === 'put') {
    if (!template || typeof template !== 'object')
      return res.status(400).json({ error: 'put needs a template' });
    await put(key(page, name), JSON.stringify(template), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
  } else {
    try { await del(key(page, name)); } catch (e) { /* already gone */ }
  }

  /* Answer with the caller's own change applied, so the person who saved
   * sees it at once even while the list is still catching up elsewhere. */
  const all = await readAll();
  if (op === 'put') (all[page] || (all[page] = {}))[name] = template;
  else if (all[page]) delete all[page][name];
  return res.status(200).json(all);
}
