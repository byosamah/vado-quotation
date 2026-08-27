/* The office password, asked for on a page.
 *
 * GET draws the box. POST checks the answer, sets the cookie and sends the
 * browser on to whatever it was trying to open.
 *
 * It exists because the link an assistant hands an employee is most often
 * clicked inside that same assistant, and the browser panel there does not
 * draw the dialog `WWW-Authenticate: Basic` asks for. See the note at the
 * top of `_mcp/session.mjs`.
 */
import { mint, setCookie, safeNext } from './_mcp/session.mjs';

const NOT_SET =
  'This proposal tool has no password set yet, so it is not being served.\n' +
  'Set TFP_PASSWORD and TFP_MCP_SECRET in the project settings and redeploy.\n';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/* Compared without leaking how much of it was right, the same way
 * `middleware.js` and `_mcp/auth.mjs` compare it. */
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function page(next, error) {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VADO — العرض الفني والمالي</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #1c1c1a; color: #f2f1ee;
         font: 16px/1.6 -apple-system, "Segoe UI", system-ui, sans-serif; }
  form { width: min(24rem, 88vw); }
  h1 { font-size: 1.15rem; font-weight: 600; margin: 0 0 .25rem; }
  p { margin: 0 0 1.5rem; color: #a8a49c; font-size: .9rem; }
  label { display: block; font-size: .85rem; margin-bottom: .4rem; }
  input[type=password] { width: 100%; box-sizing: border-box; padding: .7rem .8rem;
    border: 1px solid #46443f; border-radius: 8px; background: #26251f;
    color: inherit; font-size: 1rem; }
  button { width: 100%; margin-top: 1rem; padding: .75rem; border: 0;
    border-radius: 8px; background: #7A1F2B; color: #fff;
    font-size: 1rem; font-weight: 600; cursor: pointer; }
  .bad { color: #e5877d; font-size: .85rem; margin: .6rem 0 0; }
</style>
</head>
<body>
  <form method="post" action="/login">
    <h1>العرض الفني والمالي</h1>
    <p>أدخل كلمة مرور المكتب لفتح العرض.</p>
    <label for="pw">كلمة المرور</label>
    <input id="pw" name="password" type="password" autocomplete="current-password"
           autofocus required>
    ${error ? `<p class="bad">${esc(error)}</p>` : ''}
    <button type="submit">افتح</button>
    <input type="hidden" name="next" value="${esc(next)}">
  </form>
</body>
</html>`;
}

/* Never framed, and nothing on the page may load from anywhere else. A
 * framed password box is one somebody can put an invisible layer over. */
const html = (body, status = 200, extra = {}) => new Response(body, {
  status,
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex, nofollow',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy':
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; " +
      "frame-ancestors 'none'; base-uri 'none'",
    ...extra,
  },
});

export default {
  async fetch(request) {
    const expected = process.env.TFP_PASSWORD;
    if (!expected || !process.env.TFP_MCP_SECRET) {
      return new Response(NOT_SET, { status: 503,
        headers: { 'cache-control': 'no-store' } });
    }

    const url = new URL(request.url);

    if (request.method === 'GET' || request.method === 'HEAD') {
      const res = html(page(safeNext(url.searchParams.get('next'))));
      return request.method === 'HEAD'
        ? new Response(null, { status: res.status, headers: res.headers })
        : res;
    }
    if (request.method !== 'POST') {
      return new Response('GET or POST\n', { status: 405,
        headers: { allow: 'GET, HEAD, POST' } });
    }

    let form;
    try { form = await request.formData(); }
    catch (e) { return html(page('/', 'تعذّرت قراءة الطلب.'), 400); }

    const next = safeNext(form.get('next'));
    if (!same(String(form.get('password') || ''), expected)) {
      /* A speed bump, not a lockout. There is nowhere to count attempts. */
      await new Promise(r => setTimeout(r, 1000));
      return html(page(next, 'كلمة المرور غير صحيحة.'), 401);
    }

    const session = await mint();
    if (!session) {
      return new Response(NOT_SET, { status: 503,
        headers: { 'cache-control': 'no-store' } });
    }
    return new Response(null, {
      status: 303,
      headers: { location: next,
                 'set-cookie': setCookie(session),
                 'cache-control': 'no-store' },
    });
  },
};
