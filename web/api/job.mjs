/* One saved proposal, for the browser to open with.
 *
 * The assistant hands the employee a link like `/?job=<id>`. The deck is
 * the same 1.8 MB file everyone else opens, already cached; this returns
 * the few kilobytes of job on top of it.
 *
 * Read by pathname with the CDN cache off, never through `list`: the link
 * is clicked seconds after the proposal was saved, and `list` lags by about
 * ten. It stays behind the front-door password with the rest of the site,
 * because a job file holds the client's name, phone and fee.
 */
import { readJob } from './_mcp/store.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export default {
  async fetch(request) {
    if (request.method !== 'GET') {
      return json({ error: 'GET only' }, 405);
    }
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !/^[a-z0-9-]{1,64}$/i.test(id)) {
      return json({ error: 'need ?id=<job id>' }, 400);
    }
    try {
      const job = await readJob(id);
      if (!job) return json({ error: 'no proposal with that id' }, 404);
      return json({ id, job });
    } catch (e) {
      return json({ error: 'the proposal could not be read' }, 502);
    }
  },
};
