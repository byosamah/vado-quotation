/* Walk the whole login, in process, with no deployment.
 *
 *     node tools/oauth_selftest.mjs
 *
 * The four route files are imported and called with real Requests, so a
 * broken import, a wrong redirect or a check in the wrong order is caught
 * here rather than after a deploy. `tools/mcp_live.sh` runs the same shape
 * against a real URL once it is up; this is the version that costs nothing.
 *
 * The cases that matter are the refusals. An authorization server that
 * hands out a code is easy; one that refuses a code with no proof key, a
 * redirect the client never registered, a token minted for somebody else's
 * audience and a password that is almost right is the job.
 */
const ORIGIN = 'https://vado-tfp.test';
const REDIRECT = 'http://127.0.0.1:47821/callback';
const RESOURCE = ORIGIN + '/mcp';

process.env.TFP_PASSWORD = 'the office password';
process.env.TFP_MCP_SECRET = 'a-secret-long-enough-to-sign-with';

const at = p => new URL('../web/api/' + p, import.meta.url).href;
const register = (await import(at('oauth/register.mjs'))).default;
const authorize = (await import(at('oauth/authorize.mjs'))).default;
const token = (await import(at('oauth/token.mjs'))).default;
const prm = (await import(at('oauth/protected-resource.mjs'))).default;
const asm = (await import(at('oauth/authorization-server.mjs'))).default;
const auth = await import(at('_mcp/auth.mjs'));

let failures = 0;
const ok = (what, cond, detail) => {
  if (cond) return console.log('  ok    ' + what);
  failures += 1;
  console.log('  FAIL  ' + what + (detail ? '\n        ' + detail : ''));
};

const headers = { host: 'vado-tfp.test', 'x-forwarded-proto': 'https' };
const get = (route, url) => route.fetch(new Request(url, { headers }));
const post = (route, url, form) => route.fetch(new Request(url, {
  method: 'POST', headers,
  body: new URLSearchParams(form),
}));

/* PKCE, generated the way a client does. */
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const VERIFIER = b64u(crypto.getRandomValues(new Uint8Array(48)));
const CHALLENGE = b64u(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(VERIFIER)));

console.log('OAuth self-test\n');

/* ---- discovery --------------------------------------------------------- */

const prmDoc = await (await get(prm, ORIGIN + '/.well-known/oauth-protected-resource/mcp')).json();
ok('the protected resource is this server', prmDoc.resource === RESOURCE, prmDoc.resource);
ok('it names its authorization server',
   prmDoc.authorization_servers[0] === ORIGIN,
   JSON.stringify(prmDoc.authorization_servers));

const asmDoc = await (await get(asm, ORIGIN + '/.well-known/oauth-authorization-server')).json();
ok('PKCE with S256 is the only method offered',
   JSON.stringify(asmDoc.code_challenge_methods_supported) === '["S256"]',
   JSON.stringify(asmDoc.code_challenge_methods_supported));
ok('the client is told iss will come back',
   asmDoc.authorization_response_iss_parameter_supported === true);
ok('client id metadata documents are supported',
   asmDoc.client_id_metadata_document_supported === true);

/* ---- registration ------------------------------------------------------ */

const regRes = await register.fetch(new Request(ORIGIN + '/oauth/register', {
  method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({ client_name: 'a connector',
                         redirect_uris: [REDIRECT] }),
}));
const reg = await regRes.json();
ok('a client can register', regRes.status === 201 && !!reg.client_id,
   JSON.stringify(reg).slice(0, 200));
const CLIENT = reg.client_id;

const evilReg = await register.fetch(new Request(ORIGIN + '/oauth/register', {
  method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({ redirect_uris: ['http://evil.example/cb'] }),
}));
ok('a plain http redirect off the loopback is refused at registration',
   evilReg.status === 400, String(evilReg.status));

/* ---- the refusals ------------------------------------------------------ */

const base = new URLSearchParams({
  client_id: CLIENT, redirect_uri: REDIRECT, response_type: 'code',
  code_challenge: CHALLENGE, code_challenge_method: 'S256',
  resource: RESOURCE, state: 'selftest',
});
const authorizeUrl = extra =>
  ORIGIN + '/oauth/authorize?' + new URLSearchParams({ ...Object.fromEntries(base), ...extra });

const noPkce = await get(authorize, authorizeUrl({ code_challenge: '', code_challenge_method: '' }));
ok('a request with no proof key is refused', noPkce.status === 400, String(noPkce.status));

const plainPkce = await get(authorize, authorizeUrl({ code_challenge_method: 'plain' }));
ok('a plaintext proof key is refused', plainPkce.status === 400, String(plainPkce.status));

const badRedirect = await get(authorize, authorizeUrl({ redirect_uri: 'https://evil.example/steal' }));
ok('an unregistered redirect is refused on the page, not by redirecting to it',
   badRedirect.status === 400 && !badRedirect.headers.get('location'),
   String(badRedirect.status) + ' ' + badRedirect.headers.get('location'));

const badClient = await get(authorize, authorizeUrl({ client_id: 'not-a-client' }));
ok('an unknown client is refused', badClient.status === 400, String(badClient.status));

/* ---- the login page ---------------------------------------------------- */

const page = await get(authorize, authorizeUrl({}));
const html = await page.text();
ok('the login page asks for the office password',
   page.status === 200 && html.includes('name="password"'));
ok('the login page names the connector asking',
   html.includes('a connector'));
ok('the login page carries the request forward',
   html.includes('name="code_challenge"') && html.includes(CHALLENGE));

ok('the login page refuses to be framed',
   page.headers.get('x-frame-options') === 'DENY' &&
   /frame-ancestors 'none'/.test(page.headers.get('content-security-policy') || ''),
   page.headers.get('content-security-policy'));
ok('the login page may only post back to itself',
   /form-action 'self'/.test(page.headers.get('content-security-policy') || ''));
ok('the login page is never cached',
   page.headers.get('cache-control') === 'no-store');

const head = await authorize.fetch(new Request(authorizeUrl({}),
  { method: 'HEAD', headers }));
ok('a HEAD reaches the same headers as a GET',
   head.status === 200 && head.headers.get('x-frame-options') === 'DENY',
   String(head.status));

const wrong = await post(authorize, ORIGIN + '/oauth/authorize',
  { ...Object.fromEntries(base), password: 'the office passwore' });
ok('a password that is one letter out is refused', wrong.status === 401,
   String(wrong.status));

/* ---- the code ---------------------------------------------------------- */

const good = await post(authorize, ORIGIN + '/oauth/authorize',
  { ...Object.fromEntries(base), password: 'the office password' });
ok('the right password redirects back', good.status === 303, String(good.status));
const back = new URL(good.headers.get('location'));
const CODE = back.searchParams.get('code');
ok('a code comes back', !!CODE);
ok('iss comes back, so a mixed-up code can be spotted',
   back.searchParams.get('iss') === ORIGIN, back.searchParams.get('iss'));
ok('state comes back', back.searchParams.get('state') === 'selftest');
ok('the code goes to the registered callback',
   back.origin + back.pathname === REDIRECT, back.origin + back.pathname);

/* ---- redeeming it ------------------------------------------------------ */

const redeem = form => post(token, ORIGIN + '/oauth/token', form);
const grant = { grant_type: 'authorization_code', code: CODE,
                client_id: CLIENT, redirect_uri: REDIRECT,
                resource: RESOURCE, code_verifier: VERIFIER };

const noVerifier = await (await redeem({ ...grant, code_verifier: 'wrong' })).json();
ok('a code without its verifier is worthless',
   noVerifier.error === 'invalid_grant', JSON.stringify(noVerifier));

const otherRedirect = await (await redeem({ ...grant, redirect_uri: 'http://127.0.0.1:1/cb' })).json();
ok('a code redeemed against another callback is refused',
   otherRedirect.error === 'invalid_grant', JSON.stringify(otherRedirect));

const otherResource = await (await redeem({ ...grant, resource: 'https://elsewhere.test/mcp' })).json();
ok('a token for somebody else\'s resource is refused',
   otherResource.error === 'invalid_target', JSON.stringify(otherResource));

const refresh = await (await redeem({ grant_type: 'refresh_token', refresh_token: 'x' })).json();
ok('there is no refresh grant, and it says why',
   refresh.error === 'unsupported_grant_type' &&
   refresh.error_description.includes('thirty days'),
   JSON.stringify(refresh));

const granted = await (await redeem(grant)).json();
ok('the code becomes an access token', !!granted.access_token,
   JSON.stringify(granted).slice(0, 200));
ok('the token lasts thirty days', granted.expires_in === 30 * 24 * 60 * 60);
ok('the token carries the one scope', granted.scope === 'tfp');

/* ---- what the endpoint makes of it ------------------------------------- */

const verified = await auth.verifier(ORIGIN).verifyAccessToken(granted.access_token);
ok('the endpoint accepts its own token',
   verified.scopes.includes('tfp') && verified.expiresAt > Date.now() / 1000,
   JSON.stringify(verified.scopes));

let refused = null;
try { await auth.verifier('https://somewhere.else').verifyAccessToken(granted.access_token); }
catch (e) { refused = e.message; }
ok('a token minted by another server is refused', refused !== null, String(refused));

let notACode = null;
try { await auth.readCode(ORIGIN, granted.access_token); }
catch (e) { notACode = e.message; }
ok('an access token cannot be spent as a code', notACode !== null, String(notACode));

let notAToken = null;
try { await auth.verifier(ORIGIN).verifyAccessToken(CODE); }
catch (e) { notAToken = e.message; }
ok('a code cannot be spent as an access token', notAToken !== null, String(notAToken));

/* ---- the two the security review found --------------------------------- */

/* A wrong password used to be written back into the page as a hidden input,
 * where it sat in the view source and in any proxy log on the way. */
const retry = await (await post(authorize, ORIGIN + '/oauth/authorize',
  { ...Object.fromEntries(base), password: 'a wrong password' })).text();
ok('a wrong password is not written back into the page',
   !retry.includes('a wrong password'),
   retry.split('\n').filter(l => l.includes('wrong')).join(' '));
ok('the request itself still survives the retry',
   retry.includes(CHALLENGE) && retry.includes('name="client_id"'));

/* client_id is a URL this server fetches, chosen by whoever is asking. */
for (const bad of ['https://localhost/cimd.json',
                   'https://127.0.0.1/cimd.json',
                   'https://[::1]/cimd.json',
                   'https://169.254.169.254/latest/meta-data',
                   'https://intranet/cimd.json',
                   'https://box.local/cimd.json',
                   'https://user:pw@example.com/cimd.json',
                   'https://example.com:8080/cimd.json',
                   'http://example.com/cimd.json']) {
  let stopped = false;
  try { await auth.clientRedirects(ORIGIN, bad); }
  catch (e) { stopped = true; }
  ok('a client_id pointing at ' + bad.replace(/\/cimd.*|\/latest.*/, '') +
     ' is refused', stopped);
}

/* This server signs for one audience and no other. */
const elsewhere = await get(authorize, authorizeUrl({ resource: 'https://evil.test/mcp' }));
const elseBody = await elsewhere.json();
ok('a token for another audience is refused, not quietly retargeted',
   elsewhere.status === 400 && elseBody.error === 'invalid_target',
   JSON.stringify(elseBody));

const noResource = await post(authorize, ORIGIN + '/oauth/authorize',
  { ...Object.fromEntries(base), resource: '', password: 'the office password' });
ok('naming no resource still gets a token for this server',
   noResource.status === 303, String(noResource.status));

const manyReg = await register.fetch(new Request(ORIGIN + '/oauth/register', {
  method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({ redirect_uris: Array(50).fill(REDIRECT) }),
}));
ok('a registration with fifty callbacks is refused', manyReg.status === 400,
   String(manyReg.status));

/* A name is not an address. Refusing IP literals in the URL leaves the
 * ordinary-looking name that resolves to somewhere private. */
for (const bad of ['https://localtest.me/cimd.json',        /* resolves to 127.0.0.1 */
                   'https://no-such-host.invalid/cimd.json']) {
  let stopped = null;
  try { await auth.clientRedirects(ORIGIN, bad); }
  catch (e) { stopped = e.message; }
  ok('a name resolving badly is refused: ' + bad.split('/')[2],
     stopped !== null && /private address|does not resolve/.test(stopped),
     String(stopped));
}

/* ---- the front door ----------------------------------------------------- */

/* The middleware now lets four path families past the office password. This
 * is the check that they are the only four, and that everything else still
 * meets a password box. Getting it wrong publishes the office IBAN, which
 * has happened once already; see DEPLOY.md.
 *
 * Loaded from its own source through a data URL, because `web/middleware.js`
 * is ESM in a folder Node reads as CommonJS. Vercel always treats it as ESM;
 * this reads the same bytes. */
const { readFileSync } = await import('node:fs');
const sessionUrl = new URL('../web/api/_mcp/session.mjs', import.meta.url).href;
const mwSrc = readFileSync(new URL('../web/middleware.js', import.meta.url), 'utf8')
  /* One specifier rewritten to an absolute URL, because a data: module has
   * no folder to resolve a relative import from. Every other byte is the
   * file Vercel runs. */
  .replace("'./api/_mcp/session.mjs'", JSON.stringify(sessionUrl));
const middleware = (await import('data:text/javascript;base64,' +
  Buffer.from(mwSrc).toString('base64'))).default;

/* The middleware is async now: it may have a cookie to verify. */
const asks = async (path, extra = {}) => {
  const res = await middleware(new Request(ORIGIN + path,
    { headers: { ...headers, ...extra } }));
  return res === undefined ? 'let through' : res.status;
};

for (const path of ['/mcp', '/api/mcp', '/oauth/authorize', '/oauth/token',
                    '/api/oauth/token', '/login', '/api/login',
                    '/.well-known/oauth-protected-resource/mcp',
                    '/.well-known/oauth-authorization-server']) {
  ok('the connector path ' + path + ' is let past the password',
     await asks(path) === 'let through', String(await asks(path)));
}

/* Everything else, including every shape of "nearly a connector path" a
 * prefix match used to let through. */
for (const path of ['/', '/index.html', '/api/job?id=x', '/api/templates',
                    '/.well-known/other', '/oauthsomething',
                    '/mcp/../index.html',
                    '/oauth/%2e%2e/index.html',
                    '/oauth/../index.html',
                    '/oauth/anything-else',
                    '/api/oauth/../templates',
                    '/.well-known/oauth-anything',
                    '/%6dcp',
                    '/mcp/',
                    '/mcp/../../index.html',
                    '/MCP',
                    '//mcp']) {
  ok('the password is still asked for ' + path, await asks(path) === 401,
     String(await asks(path)));
}

/* ---- the link an assistant hands over ----------------------------------- */

const login = (await import(at('login.mjs'))).default;
const session = await import(at('_mcp/session.mjs'));

/* A browser opening a page must meet somewhere to type, not a bare 401. The
 * panel inside Claude does not draw the dialog Basic Auth asks for, and a
 * link nobody can open is not a link. */
ok('a browser opening the deck is sent to the password page',
   await asks('/?job=4d64h5pv68', { accept: 'text/html' }) === 303,
   String(await asks('/?job=4d64h5pv68', { accept: 'text/html' })));
ok('a program still gets the header it asked for',
   await asks('/api/job?id=x') === 401);

const form = await login.fetch(new Request(ORIGIN + '/login?next=/?job=abc',
  { headers }));
const formHtml = await form.text();
ok('the password page has a box and remembers where you were going',
   form.status === 200 && formHtml.includes('name="password"') &&
   formHtml.includes('value="/?job=abc"'));
ok('the password page cannot be framed either',
   form.headers.get('x-frame-options') === 'DENY');

const badTry = await login.fetch(new Request(ORIGIN + '/login', {
  method: 'POST', headers,
  body: new URLSearchParams({ password: 'CANARY', next: '/?job=abc' }),
}));
const badHtml = await badTry.text();
ok('a wrong password is refused and not written back into the page',
   badTry.status === 401 && !badHtml.includes('CANARY'));

const goodTry = await login.fetch(new Request(ORIGIN + '/login', {
  method: 'POST', headers,
  body: new URLSearchParams({ password: 'the office password', next: '/?job=abc' }),
}));
ok('the right password sends you where you were going',
   goodTry.status === 303 && goodTry.headers.get('location') === '/?job=abc',
   goodTry.headers.get('location'));

const cookie = goodTry.headers.get('set-cookie') || '';
ok('the cookie is not readable by a script and not sent across sites',
   /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) && /SameSite=Lax/i.test(cookie),
   cookie.replace(/=[^;]+/, '=…'));

const value = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
ok('the cookie opens the deck', await asks('/', { cookie: 'vado_session=' + value })
   === 'let through');
ok('a cookie with a bent signature does not',
   await asks('/', { cookie: 'vado_session=' + value.slice(0, -2) + 'xy' }) === 401);
ok('an expired cookie does not',
   await session.valid('1000000000.' + value.split('.')[1]) === false);
ok('somebody else\'s cookie does not',
   await asks('/', { cookie: 'vado_session=9999999999.notasignature' }) === 401);

/* `next` decides where a browser lands after typing the office password, so
 * a target that leaves this site is a phishing bounce off the real login
 * page, on the real domain, straight after the real password was typed.
 *
 * The ones that matter are the ones a browser reads differently from a
 * person. It removes tab, newline and carriage return BEFORE parsing, so a
 * target that starts with one slash here is `//evil.example` by the time it
 * is followed. Built from character codes rather than typed, so they
 * survive being read, copied and edited. */
const CH = n => String.fromCharCode(n);
const nextCases = [
  ['a tab that becomes a second slash', '/' + CH(9) + '/evil.example'],
  ['a newline', '/' + CH(10) + '/evil.example'],
  ['a carriage return', '/' + CH(13) + '/evil.example'],
  ['a null', '/' + CH(0) + '/evil.example'],
  ['a tab before a backslash', '/' + CH(9) + '\\evil.example'],
  ['protocol relative', '//evil.example'],
  ['a backslash', '/\\evil.example'],
  ['slash backslash', '/\\/evil.example'],
  ['three slashes', '///evil.example'],
  ['an absolute url', 'https://evil.example'],
  ['a script url', 'javascript:alert(1)'],
  ['nothing at all', null],
];
for (const [what, given] of nextCases) {
  const out = session.safeNext(given);
  ok('after signing in, ' + what + ' cannot leave the site',
     new URL(out, ORIGIN).origin === ORIGIN, JSON.stringify(out));
}
for (const [given, want] of [['/', '/'],
                             ['/?job=abc', '/?job=abc'],
                             ['/index.html', '/index.html'],
                             ['/a/b?x=1&y=2', '/a/b?x=1&y=2']]) {
  ok('and a real page still survives: ' + given,
     session.safeNext(given) === want, session.safeNext(given));
}

/* ---- with nothing configured ------------------------------------------- */

delete process.env.TFP_MCP_SECRET;
ok('with no signing secret the server says it is not ready', auth.ready() === false);
const shut = await get(authorize, authorizeUrl({}));
ok('and the login page serves nothing', shut.status === 503, String(shut.status));

console.log(failures ? `\n${failures} failure(s).` : '\nall good');
process.exit(failures ? 1 : 0);
