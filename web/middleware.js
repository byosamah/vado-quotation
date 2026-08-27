/* A password on the URL, without paying for one.
 *
 * Vercel's own Password Protection is a Pro feature. This does the same job
 * on the free plan: Edge Middleware runs on Vercel's side, before a single
 * byte of the proposal is sent, and asks the browser for a password. A
 * password box built into the HTML would be theatre, because the file, the
 * IBAN and the signature would already be on the visitor's machine before
 * the box appeared.
 *
 * It fails closed. With no password configured it serves nothing at all,
 * so forgetting to set the environment variable cannot quietly publish the
 * office's bank details.
 *
 * Set the password once:
 *   Vercel → project vado-tfp → Settings → Environment Variables
 *   Name: TFP_PASSWORD    Value: <whatever you choose>    All environments
 * Then redeploy. Changing it later needs a redeploy too.
 */
import { read, valid, safeNext } from './api/_mcp/session.mjs';

export const config = { matcher: '/(.*)' };

/* Compare without leaking how much of the password was right. */
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Built fresh each time: a Response body can only be read once, so a shared
 * instance cannot be returned twice.
 *
 * The realm is ASCII only. It said VADO — العرض الفني والمالي, and an HTTP
 * header value cannot hold non-ASCII bytes, so the whole WWW-Authenticate
 * line was dropped on the way out. The browser then had a 401 with nothing
 * telling it to ask for anything, and showed a bare "HTTP ERROR 401"
 * instead of a password box. */
const ask = () => new Response('Password required. Ask the office.\n', {
  status: 401,
  headers: {
    'WWW-Authenticate': 'Basic realm="VADO proposal", charset="UTF-8"',
    'Cache-Control': 'no-store',
  },
});

/* The paths that are outside this password, and prove themselves elsewhere.
 *
 * No MCP client offers a Basic Auth box, so the connector paths are let
 * past the front door and prove themselves their own way: the OAuth
 * endpoints ask for the same office password on a page of their own, and
 * `/mcp` refuses anything without a token it issued. `/login` is the same
 * password on a page, for the browsers that will not draw the dialog. All
 * of them fail closed with no TFP_MCP_SECRET set, so letting them past
 * cannot publish anything.
 *
 * Matched here rather than in `config.matcher`, because a negative
 * lookahead in a matcher is easy to get subtly wrong and the cost of
 * getting it wrong is the office IBAN with no password on it.
 */
const CONNECTOR_PATHS = new Set([
  '/login',
  '/api/login',
  '/mcp',
  '/api/mcp',
  '/oauth/authorize',
  '/oauth/token',
  '/oauth/register',
  '/api/oauth/authorize',
  '/api/oauth/token',
  '/api/oauth/register',
  '/api/oauth/protected-resource',
  '/api/oauth/authorization-server',
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-authorization-server/mcp',
]);

/* Named in full, never by prefix.
 *
 * It used to say `pathname.startsWith('/oauth/')`, and a prefix is a hole
 * the moment somebody hangs something else off it. `/oauth/%2e%2e/index.html`
 * carries a `..` the URL parser does not collapse, because it is still
 * percent-encoded, so it passed the prefix and went on to whatever the
 * router made of it afterwards. There are fourteen connector paths and they
 * are all known, so they are all written down.
 *
 * Matched raw. Decoding first could only ever widen this: `/%6dcp` decodes
 * to `/mcp`, and a path that has to be decoded before it looks like a
 * connector path is not one. Anything with a `%` in it wants the password.
 */
function forConnector(pathname) {
  if (pathname.indexOf('%') >= 0) return false;
  return CONNECTOR_PATHS.has(pathname);
}

/* A browser that is opening a page is sent to one it can use. Anything else
 * gets the header it asked for.
 *
 * The test is what the request says it wants back. A navigation asks for
 * `text/html`; curl, the deck's own fetch of `/api/job` and every script
 * ever written do not. So a person meets a password box and a program meets
 * a 401, which is what each of them can do something with. */
const wantsPage = request =>
  request.method === 'GET' &&
  (request.headers.get('accept') || '').includes('text/html');

const toLogin = (request, url) => Response.redirect(
  new URL('/login?next=' + encodeURIComponent(safeNext(url.pathname + url.search)),
          url.origin), 303);

export default async function middleware(request) {
  const url = new URL(request.url);
  if (forConnector(url.pathname)) return;

  const expected = process.env.TFP_PASSWORD;

  if (!expected) {
    return new Response(
      'This proposal tool has no password set yet, so it is not being served.\n' +
      'Set TFP_PASSWORD in the project settings and redeploy.\n',
      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  /* Somebody who typed the password on `/login` already. */
  if (await valid(read(request.headers.get('cookie')))) return;

  /* And beside it, the way it has always worked: curl, saved credentials,
   * `tools/mcp_live.sh`, and any browser that does draw the dialog. */
  const header = request.headers.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    let decoded = '';
    try { decoded = atob(encoded); } catch (e) { decoded = ''; }
    if (same(decoded.slice(decoded.indexOf(':') + 1), expected)) return;
  }

  return wantsPage(request) ? toLogin(request, url) : ask();
}
