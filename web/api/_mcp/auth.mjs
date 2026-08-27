/* The OAuth 2.1 authorization server the MCP endpoint sits behind.
 *
 * An MCP client cannot be handed a password. Claude and ChatGPT both expect
 * to open a browser, have somebody prove who they are, and come back with a
 * token. So the office password becomes a login page, once per device, and
 * the connector holds a token afterwards.
 *
 * Everything is stateless, on purpose. Vercel Blob is eventually
 * consistent by about ten seconds, and an authorization code is redeemed
 * inside two: storing codes there would fail for real users and pass every
 * test. So the code IS a signed token that carries its own PKCE challenge,
 * its client and its redirect, and the access token is a signed token that
 * carries its own audience and expiry. Nothing is written down, so nothing
 * can be read stale.
 *
 * What that costs, stated plainly:
 *
 *   * A code cannot be marked used, so within its sixty seconds it could in
 *     principle be replayed. PKCE means a replay also needs the verifier
 *     the client generated and never sent anywhere, and the code is bound
 *     to one redirect URI and one audience.
 *   * There are no refresh tokens. OAuth 2.1 wants a public client's
 *     refresh token rotated, and rotation needs somewhere to remember the
 *     last one. Access tokens last thirty days instead, and the connector
 *     asks for the password again after that.
 *   * Revocation is by changing TFP_MCP_SECRET, which invalidates every
 *     token at once. That is the whole of it: there is no identity here,
 *     the same as the rest of this deployment.
 *
 * It fails closed. With no TFP_MCP_SECRET set, nothing is signed and
 * nothing is verified, so the MCP endpoint serves 503 rather than serving
 * the office's bank details to anyone who finds the URL.
 */
import { SignJWT, jwtVerify } from 'jose';

export const SCOPE = 'tfp';
const CODE_TTL = 60;                        /* seconds */
const TOKEN_TTL = 30 * 24 * 60 * 60;        /* thirty days */

export class AuthNotConfigured extends Error {}

function secret() {
  const raw = process.env.TFP_MCP_SECRET;
  if (!raw || raw.length < 24) throw new AuthNotConfigured();
  return new TextEncoder().encode(raw);
}

export function ready() {
  return Boolean(process.env.TFP_MCP_SECRET &&
                 process.env.TFP_MCP_SECRET.length >= 24 &&
                 process.env.TFP_PASSWORD);
}

/* The public origin, taken from the proxy headers Vercel sets rather than
 * from an environment variable, so a preview deployment issues tokens for
 * itself and not for production. */
export function originOf(request) {
  /* In production the answer is a fact about the project, not a claim in a
   * header. Every token audience, the issuer, and the link `proposal_finish`
   * hands an employee are built from this: read it off a request and a
   * spoofed `x-forwarded-host` would send somebody to a page of somebody
   * else's choosing wearing this server's name. */
  if (process.env.VERCEL_ENV === 'production' &&
      process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL;
  }
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') || url.host;
  const proto = request.headers.get('x-forwarded-proto') ||
                (host.startsWith('localhost') || host.startsWith('127.') ?
                 'http' : 'https');
  return `${proto}://${host}`;
}

/* The one resource this server will mint a token for.
 *
 * A client names the audience it wants in `resource`, and RFC 8707 says to
 * honour it. Honouring one that is not this server would mean signing a
 * token for somebody else's audience, which is a favour no authorization
 * server should do: our own verifier would refuse it, and any other server
 * that trusted this issuer would not. */
export function resourceFor(origin, asked) {
  if (!asked) return mcpUrl(origin);
  const clean = String(asked).replace(/\/+$/, '');
  if (clean === mcpUrl(origin) || clean === origin) return mcpUrl(origin);
  return null;
}

export const mcpUrl = origin => `${origin}/mcp`;
export const metadataUrl = origin =>
  `${origin}/.well-known/oauth-protected-resource/mcp`;

/* ---- tokens ----------------------------------------------------------- */

async function sign(payload, audience, seconds, issuer) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(Math.floor(Date.now() / 1000) + seconds)
    .setJti(crypto.randomUUID())
    .sign(secret());
}

export async function mintCode(origin, claims) {
  return sign({ ...claims, use: 'code' }, origin + '#code', CODE_TTL, origin);
}

export async function readCode(origin, token) {
  const { payload } = await jwtVerify(token, secret(),
    { issuer: origin, audience: origin + '#code' });
  if (payload.use !== 'code') throw new Error('not an authorization code');
  return payload;
}

export async function mintAccessToken(origin, { clientId, resource }) {
  return sign({ scope: SCOPE, client_id: clientId, use: 'access' },
              resource, TOKEN_TTL, origin);
}

/* The verifier the MCP endpoint hands to `requireBearerAuth`.
 *
 * The audience check is the important line. A token must have been issued
 * for THIS server: accepting one minted for somewhere else is how a
 * confused deputy is built. */
export function verifier(origin) {
  return {
    async verifyAccessToken(token) {
      const { payload } = await jwtVerify(token, secret(), {
        issuer: origin,
        audience: [mcpUrl(origin), origin],
      });
      if (payload.use !== 'access') throw new Error('not an access token');
      return {
        token,
        clientId: String(payload.client_id || 'unknown'),
        scopes: String(payload.scope || '').split(' ').filter(Boolean),
        expiresAt: payload.exp,
      };
    },
  };
}

/* ---- who is asking ---------------------------------------------------- */

/* A client identifies itself in one of two ways.
 *
 * Client ID Metadata Documents, which the 2026-07-28 revision prefers: the
 * client_id is an HTTPS URL, and fetching it returns the client's own
 * metadata, including the redirect URIs it is allowed to use. Nothing is
 * registered and nothing is stored.
 *
 * Dynamic Client Registration, deprecated but still what several clients
 * do: they POST their metadata and expect a client_id back. Here the
 * client_id they get IS their metadata, signed, so registration writes
 * nothing down either.
 */
export async function registerClient(origin, metadata) {
  const uris = (metadata && metadata.redirect_uris) || [];
  if (!Array.isArray(uris) || !uris.length) {
    throw new Error('redirect_uris is required');
  }
  /* The client_id handed back is these URIs, signed. Unbounded in means
   * unbounded out, and a client_id nothing can carry. */
  if (uris.length > 10) throw new Error('too many redirect_uris');
  for (const uri of uris) {
    if (typeof uri !== 'string' || uri.length > 512) {
      throw new Error('a redirect_uri is not a short string');
    }
  }
  for (const uri of uris) assertRedirect(uri);
  const client_id = await sign(
    { use: 'client', redirect_uris: uris,
      client_name: String(metadata.client_name || '').slice(0, 120) },
    origin + '#client', 10 * 365 * 24 * 60 * 60, origin);
  return {
    client_id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: uris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    response_types: ['code'],
    application_type: metadata.application_type || 'native',
    client_name: metadata.client_name,
  };
}

/* A redirect URI must be somewhere a browser can only reach with the user's
 * consent: HTTPS, or a loopback address, or a private scheme an installed
 * application registered. Anything else is an open redirect waiting to
 * happen. */
function assertRedirect(uri) {
  let url;
  try { url = new URL(uri); } catch (e) { throw new Error('bad redirect_uri'); }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
                   || url.hostname === '[::1]' || url.hostname === '::1';
  if (url.protocol === 'https:') return;
  if (url.protocol === 'http:' && loopback) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:' &&
      url.protocol.length > 2) return;                 /* a private scheme */
  throw new Error('redirect_uri must be https, loopback, or a private scheme');
}

/* A client_id is a URL this server is about to fetch, chosen by whoever is
 * asking. That is a request forgery unless it is fenced.
 *
 * The fence is deliberately crude, because the only thing a real Client ID
 * Metadata Document ever is, is a public HTTPS page on a named host: no IP
 * literals, no private or loopback address, no `.local`, no port other than
 * the default, no credentials in the URL, and no redirect followed (that is
 * `redirect: 'error'` at the call). Everything a scan would want is on the
 * other side of one of those.
 */
const PRIVATE_HOST = /^(localhost$|.*\.local$|.*\.internal$|.*\.localhost$)/i;
const IP_LITERAL = /^\[|^\d{1,3}(\.\d{1,3}){3}$/;

/* Every address a request must never be sent to.
 *
 * Refusing IP literals in the URL is not enough on its own: nothing stops
 * somebody registering a perfectly ordinary name that resolves to 127.0.0.1
 * or to a cloud metadata address. So the name is resolved first and every
 * address it answers with is checked.
 *
 * This narrows the window rather than closing it: the name could resolve
 * again, differently, between this check and the fetch. Doing better needs
 * a fetch that can be pinned to an address, which the platform does not
 * offer. What is left is a race an attacker has to win, against a fence
 * they have to get past first.
 */
function isPrivateAddress(address, family) {
  if (family === 6) {
    const v6 = address.toLowerCase();
    if (v6 === '::' || v6 === '::1') return true;
    if (/^(fc|fd)/.test(v6)) return true;              /* unique local */
    if (/^fe[89ab]/.test(v6)) return true;             /* link local */
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1], 4);
    return false;
  }
  const p = address.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;                                       /* unparsable is private */
  }
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 ||
         (a === 169 && b === 254) ||                    /* link local, metadata */
         (a === 172 && b >= 16 && b <= 31) ||
         (a === 192 && b === 168) ||
         (a === 100 && b >= 64 && b <= 127) ||          /* carrier grade NAT */
         (a === 192 && b === 0) ||
         a >= 224;                                      /* multicast, reserved */
}

async function assertPublicHost(hostname) {
  const { lookup } = await import('node:dns/promises');
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch (e) {
    throw new Error('client_id host does not resolve');
  }
  if (!addresses.length) throw new Error('client_id host does not resolve');
  for (const { address, family } of addresses) {
    if (isPrivateAddress(address, family)) {
      throw new Error('client_id host resolves to a private address');
    }
  }
}

function assertFetchable(clientId) {
  let url;
  try { url = new URL(clientId); } catch (e) { throw new Error('bad client_id'); }
  if (url.protocol !== 'https:') throw new Error('client_id must be https');
  if (url.username || url.password) {
    throw new Error('client_id must carry no credentials');
  }
  if (url.port && url.port !== '443') {
    throw new Error('client_id must be on the default port');
  }
  if (IP_LITERAL.test(url.hostname) || PRIVATE_HOST.test(url.hostname) ||
      url.hostname.indexOf('.') < 0) {
    throw new Error('client_id must be a public host name');
  }
}

/* Resolve whatever arrived in `client_id` to the redirect URIs it may use. */
export async function clientRedirects(origin, clientId) {
  if (!clientId) throw new Error('client_id is required');

  if (/^https:\/\//i.test(clientId)) {
    assertFetchable(clientId);
    await assertPublicHost(new URL(clientId).hostname);
    const res = await fetch(clientId, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error('client_id document could not be read');
    /* Read a bounded amount and parse it here, rather than handing an
     * unknown host an open pipe into this function's memory. */
    const body = await res.text();
    if (body.length > 64 * 1024) {
      throw new Error('client_id document is too large');
    }
    let doc;
    try { doc = JSON.parse(body); }
    catch (e) { throw new Error('client_id document is not JSON'); }
    /* The document must claim the identity it is served from, or any page
     * on any host could nominate itself as somebody else's client. */
    if (String(doc.client_id) !== clientId) {
      throw new Error('client_id document does not name itself');
    }
    const uris = doc.redirect_uris || [];
    if (!uris.length) throw new Error('client_id document has no redirect_uris');
    return { redirects: uris, name: doc.client_name || clientId };
  }

  const { payload } = await jwtVerify(clientId, secret(),
    { issuer: origin, audience: origin + '#client' });
  if (payload.use !== 'client') throw new Error('not a client registration');
  return { redirects: payload.redirect_uris || [],
           name: payload.client_name || 'a connector' };
}

/* ---- the password ------------------------------------------------------ */

/* Compared without leaking how much of it was right, the same way
 * middleware.js compares the one on the front door. */
export function samePassword(given) {
  const want = process.env.TFP_PASSWORD;
  if (typeof want !== 'string' || typeof given !== 'string') return false;
  if (want.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export async function pkceMatches(challenge, verifier_) {
  if (!challenge || !verifier_) return false;
  const digest = await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(verifier_));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return b64 === challenge;
}

export const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json',
               'cache-control': 'no-store',
               'access-control-allow-origin': '*',
               'access-control-allow-headers': '*',
               'access-control-allow-methods': 'GET, POST, OPTIONS',
               ...extra },
  });

export const oauthError = (code, description, status = 400) =>
  json({ error: code, error_description: description }, status);

/* ---- the two discovery documents --------------------------------------- */

/* What the client reads to find the authorization server. RFC 9728. */
export function protectedResourceMetadata(origin) {
  return {
    resource: mcpUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'VADO — العرض الفني والمالي',
    resource_documentation: `${origin}/`,
  };
}

/* What the client reads to know how to ask for a token. RFC 8414.
 *
 * `authorization_response_iss_parameter_supported` is true because the
 * authorize endpoint really does send `iss` back, including on errors, and
 * the 2026-07-28 revision makes a client reject the response when the flag
 * is set and the parameter is missing. */
export function authorizationServerMetadata(origin) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    scopes_supported: [SCOPE],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: true,
    service_documentation: `${origin}/`,
  };
}
