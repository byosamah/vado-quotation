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

/* The paths the MCP connector uses, which cannot carry this password.
 *
 * No MCP client offers a Basic Auth box, so these four families are let
 * past the front door and prove themselves their own way: the OAuth
 * endpoints ask for the same office password on a page of their own, and
 * `/mcp` refuses anything without a token it issued. Both fail closed with
 * no TFP_MCP_SECRET set, so letting them past cannot publish anything.
 *
 * Matched here rather than in `config.matcher`, because a negative
 * lookahead in a matcher is easy to get subtly wrong and the cost of
 * getting it wrong is the office IBAN with no password on it.
 */
const CONNECTOR_PATHS = new Set([
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

export default function middleware(request) {
  if (forConnector(new URL(request.url).pathname)) return;

  const expected = process.env.TFP_PASSWORD;

  if (!expected) {
    return new Response(
      'This proposal tool has no password set yet, so it is not being served.\n' +
      'Set TFP_PASSWORD in the project settings and redeploy.\n',
      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  const header = request.headers.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return ask();

  let decoded;
  try { decoded = atob(encoded); } catch (e) { return ask(); }
  const given = decoded.slice(decoded.indexOf(':') + 1);

  if (!same(given, expected)) return ask();
  /* nothing returned: the request carries on to the file */
}
