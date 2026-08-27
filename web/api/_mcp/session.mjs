/* A signed cookie, so the deck can be opened by clicking a link.
 *
 * The front door asked for the password with `WWW-Authenticate: Basic`, and
 * a browser answers that with its own dialog. Most do. The one an assistant
 * hands the link to often does not: the panel inside Claude showed the bare
 * words «Password required. Ask the office.» and offered nowhere to type
 * one. A link nobody can open is not a link.
 *
 * So the password is asked for on a page instead, and the answer is
 * remembered in a cookie. Basic Auth still works beside it, because curl,
 * `tools/mcp_live.sh` and everybody's saved credentials use it.
 *
 * This is not the thing DEPLOY.md warns about. That warning is against a
 * password box built into the proposal file, which would have shipped the
 * IBAN and the signature to the visitor before the box appeared. This box
 * is at the edge: nothing is served until the cookie checks out.
 *
 * The cookie carries no identity, because there is none here. It says only
 * that somebody knew the office password, and when that stops being true.
 */
const NAME = 'vado_session';
const TTL = 30 * 24 * 60 * 60;            /* thirty days, like the token */

const enc = new TextEncoder();

const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function unb64u(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(text.length + (4 - text.length % 4) % 4, '=');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function key() {
  const raw = process.env.TFP_MCP_SECRET;
  if (!raw || raw.length < 24) return null;
  return crypto.subtle.importKey('raw', enc.encode(raw),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

const body = exp => enc.encode('vado-session|' + exp);

export async function mint() {
  const k = await key();
  if (!k) return null;
  const exp = Math.floor(Date.now() / 1000) + TTL;
  return exp + '.' + b64u(await crypto.subtle.sign('HMAC', k, body(exp)));
}

export async function valid(value) {
  if (!value) return false;
  const at = String(value).indexOf('.');
  if (at < 1) return false;
  const exp = Number(value.slice(0, at));
  if (!Number.isFinite(exp) || exp <= Date.now() / 1000) return false;
  const k = await key();
  if (!k) return false;
  let sig;
  try { sig = unb64u(value.slice(at + 1)); } catch (e) { return false; }
  /* `crypto.subtle.verify` rather than comparing two strings: a character
   * by character compare answers a wrong signature faster the earlier it is
   * wrong, and that difference is measurable. */
  return crypto.subtle.verify('HMAC', k, sig, body(exp));
}

export function read(cookieHeader) {
  for (const part of String(cookieHeader || '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    if (part.slice(0, at).trim() === NAME) return part.slice(at + 1).trim();
  }
  return null;
}

export function setCookie(value) {
  return `${NAME}=${value}; Path=/; Max-Age=${TTL}; HttpOnly; Secure; SameSite=Lax`;
}

/* Where to go after signing in.
 *
 * Only ever a path on this site. `//evil.example` and `/\evil.example` are
 * both read as another origin by a browser, so both are refused, and so is
 * anything that is not plainly a path. */
export function safeNext(next) {
  const want = String(next || '/');
  if (!want.startsWith('/')) return '/';
  if (want.startsWith('//') || want.startsWith('/\\')) return '/';
  if (want.includes('\\')) return '/';
  return want;
}
