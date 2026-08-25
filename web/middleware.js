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

export default function middleware(request) {
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
