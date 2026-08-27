/* The login page, and the authorization code it hands back.
 *
 * GET draws a password box in Arabic. POST checks the password and sends
 * the browser back to the connector with a code.
 *
 * The order of the checks matters. A redirect URI is only used after it has
 * been proved to belong to the client that named it, so a bad `client_id`
 * or a redirect the client never registered is answered on this page, never
 * by redirecting somewhere. Redirecting an error to an unproven URI is how
 * an open redirect gets built.
 */
import {
  originOf, ready, clientRedirects, mintCode, samePassword, oauthError,
  resourceFor, AuthNotConfigured,
} from '../_mcp/auth.mjs';

const NOT_SET =
  'This connector has no password set yet, so it is not being served.\n' +
  'Set TFP_PASSWORD and TFP_MCP_SECRET in the Vercel project settings and ' +
  'redeploy.\n';

/* The parameters that must survive the password page and reach the code. */
const CARRY = ['client_id', 'redirect_uri', 'state', 'scope', 'resource',
               'code_challenge', 'code_challenge_method', 'response_type'];

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/* Only the request is carried forward, never the whole parsed body.
 *
 * It used to build the hidden fields from every key it had, and a POST body
 * holds the password. So a wrong password was written back into the page as
 * `<input type="hidden" name="password" value="…">`: on screen, in the view
 * source, and in any proxy log between here and the browser. */
function page(params, { name, error }) {
  const hidden = CARRY
    .filter(k => params[k] != null)
    .map(k => `<input type="hidden" name="${esc(k)}" value="${esc(params[k])}">`)
    .join('\n      ');
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VADO — الدخول</title>
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
    border-radius: 8px; background: #c8a45c; color: #1c1c1a;
    font-size: 1rem; font-weight: 600; cursor: pointer; }
  .bad { color: #e5877d; font-size: .85rem; margin: .6rem 0 0; }
  .who { color: #c8a45c; }
</style>
</head>
<body>
  <form method="post">
    <h1>العرض الفني والمالي</h1>
    <p>يطلب <span class="who">${esc(name)}</span> الاتصال بأداة العروض.
       أدخل كلمة مرور المكتب مرة واحدة.</p>
    <label for="pw">كلمة المرور</label>
    <input id="pw" name="password" type="password" autocomplete="current-password"
           autofocus required>
    ${error ? `<p class="bad">${esc(error)}</p>` : ''}
    <button type="submit">اسمح بالاتصال</button>
    ${hidden}
  </form>
</body>
</html>`;
}

/* A login page that can be framed is a login page somebody can put an
 * invisible layer over. The office password would be typed into a box the
 * person cannot see the edges of, on a page they think is something else.
 *
 * The policy is as small as the page: it has no scripts, no images and no
 * fonts, so everything is denied except the one inline stylesheet, and the
 * form may only post back here. */
/* `form-action` needs one more source than you would think, and it is the
 * whole reason this endpoint exists. A browser enforces the directive across
 * the redirect a submission causes, not only the address the form posts to,
 * and a correct password here is answered with a redirect to the connector's
 * callback on another origin. With `'self'` alone Chrome refused to send the
 * form at all, naming this page's own URL, and signing in to Claude failed
 * with nothing on screen to explain it. `/login` carries the same policy and
 * never showed it, because its redirect comes back to this site.
 *
 * So the callback's origin is named, and only after it has been proved to
 * belong to the client that asked for it. An injected form still cannot post
 * anywhere but here and there. */
const html = (body, status = 200, callback = null) => new Response(body, {
  status,
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex, nofollow',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy':
      "default-src 'none'; style-src 'unsafe-inline'; " +
      "form-action 'self'" + (callback ? ' ' + callback : '') + '; ' +
      "frame-ancestors 'none'; base-uri 'none'",
  },
});

/* The origin the code will be handed back to, for the policy above. Only
 * ever called with a redirect_uri the client has already proved is theirs. */
function callbackOrigin(redirectUri) {
  try {
    const { origin } = new URL(redirectUri);
    /* An installed application registers a private scheme, and `new URL`
     * gives those an opaque origin. There is no host to name in a policy,
     * and no browser form submission to protect either. */
    return origin && origin !== 'null' ? origin : null;
  } catch (e) { return null; }
}

async function params(request) {
  const url = new URL(request.url);
  const out = {};
  for (const key of CARRY) {
    const v = url.searchParams.get(key);
    if (v != null) out[key] = v;
  }
  if (request.method === 'POST') {
    const form = await request.formData();
    for (const key of CARRY) {
      const v = form.get(key);
      if (v != null) out[key] = String(v);
    }
    out.password = String(form.get('password') || '');
  }
  return out;
}

export default {
  async fetch(request) {
    if (!ready()) return new Response(NOT_SET, { status: 503,
      headers: { 'cache-control': 'no-store' } });

    const origin = originOf(request);
    let p;
    try { p = await params(request); }
    catch (e) { return oauthError('invalid_request', 'unreadable request'); }

    if (p.response_type && p.response_type !== 'code') {
      return oauthError('unsupported_response_type', 'only code is supported');
    }
    /* PKCE is not optional here. A public client with no proof key is a
     * client whose authorization code is worth stealing. */
    if (!p.code_challenge || p.code_challenge_method !== 'S256') {
      return oauthError('invalid_request',
        'code_challenge with code_challenge_method=S256 is required');
    }

    let client;
    try { client = await clientRedirects(origin, p.client_id); }
    catch (e) {
      if (e instanceof AuthNotConfigured) {
        return new Response(NOT_SET, { status: 503 });
      }
      /* One sentence out, the detail to the log. `client_id` may be a URL
       * this server just fetched, and handing its error text back would let
       * whoever chose that URL read what happened on this side of it. */
      console.error('[oauth] client_id rejected:', e && e.message);
      return oauthError('invalid_client',
        'this client_id could not be resolved to a registered client');
    }
    if (!p.redirect_uri || !client.redirects.includes(p.redirect_uri)) {
      return oauthError('invalid_request',
        'redirect_uri is not one this client registered');
    }

    /* The audience the token will carry. A client that names no resource
     * gets one for this server, and a client that names somewhere else is
     * refused rather than quietly given a token for here.
     *
     * Checked before the page is drawn, not after the password is typed.
     * Asking somebody for the office password and then refusing the request
     * anyway is the wrong order to find out in. */
    const resource = resourceFor(origin, p.resource);
    if (!resource) {
      return oauthError('invalid_target',
        'this authorization server only issues tokens for ' + origin + '/mcp');
    }

    const callback = callbackOrigin(p.redirect_uri);

    if (request.method === 'GET' || request.method === 'HEAD') {
      const res = html(page(p, { name: client.name }), 200, callback);
      /* A HEAD is a GET that stops at the headers. Answering 405 to one
       * meant every header on this page, the framing rules included, was
       * unreadable by anything that asks politely first. */
      return request.method === 'HEAD'
        ? new Response(null, { status: res.status, headers: res.headers })
        : res;
    }
    if (request.method !== 'POST') {
      return oauthError('invalid_request', 'GET or POST', 405);
    }

    if (!samePassword(p.password)) {
      /* A speed bump, not a lockout. There is nowhere to remember attempts
       * (see the note in `_mcp/auth.mjs`), so the honest thing is to make
       * each guess cost a second rather than to pretend to count them. */
      await new Promise(r => setTimeout(r, 1000));
      return html(page(p, { name: client.name,
                            error: 'كلمة المرور غير صحيحة.' }), 401, callback);
    }

    const code = await mintCode(origin, {
      client_id: p.client_id,
      redirect_uri: p.redirect_uri,
      code_challenge: p.code_challenge,
      resource,
    });

    const back = new URL(p.redirect_uri);
    back.searchParams.set('code', code);
    /* RFC 9207: the client compares this against the issuer it recorded
     * before it opened the browser, which is what stops a mix-up attack
     * from feeding it a code minted somewhere else. */
    back.searchParams.set('iss', origin);
    if (p.state != null) back.searchParams.set('state', p.state);
    return new Response(null, { status: 303,
      headers: { location: back.toString(), 'cache-control': 'no-store' } });
  },
};
