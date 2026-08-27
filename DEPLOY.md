# Hosting

The fillable deck is at **https://vado-tfp.vercel.app**, behind a password.
Employees need no account: any username, and the password.

Production deploys from GitHub. Push to `main` and Vercel builds it:

    python3 html/build_html.py                # rebuild out/VADO-TFP.html
    cp out/VADO-TFP.html web/index.html       # the build is not copied for you
    git add -A && git commit && git push

The repository is `byosamah/vado-quotation`, private. It holds the office
IBAN, the signature images and real client contact details, so it must stay
private: deleting those files later would not remove them from the history.

The project's **Root Directory is `web`**. Vercel clones the whole
repository and serves that folder. Set it back and the site would serve the
repository root, which has no `middleware.js` in it, so the proposal would
be published with no password at all.

    cd web && vercel deploy --prod --yes      # the old way, still works

`web/` is the whole deployment: `index.html` built by `html/build_html.py`,
`middleware.js` guarding it, `api/templates.js` holding the office's shared
templates, and `api/mcp.mjs` plus `api/oauth/` serving the connector an
employee points their own Claude or ChatGPT at. See `mcp/README.md`.

## The connector

    https://vado-tfp.vercel.app/mcp

It needs one more environment variable, `TFP_MCP_SECRET`, at least 24
characters. It signs the tokens the connector holds, so changing it logs
every connector out at once, which is the only revocation there is.

    vercel env add TFP_MCP_SECRET production
    vercel env add TFP_MCP_SECRET preview

**The MCP paths are outside the password.** `middleware.js` lets `/mcp`,
`/oauth/*` and `/.well-known/oauth-*` past the front door, because no MCP
client offers a Basic Auth box. They prove themselves their own way: the
OAuth endpoints ask for the same office password on a page of their own, and
`/mcp` refuses anything without a token it issued. Both answer 503 with no
`TFP_MCP_SECRET` set, so letting them past cannot publish anything.

That is a change to the file this whole document was written around, so it
gets re-proved on every deployment:

    TFP_PASSWORD=… tools/mcp_live.sh https://vado-tfp.vercel.app

Its first check is the one from twenty minutes of a public IBAN: fetch the
site with no credentials and grep for something secret. Then it walks the
whole login flow the way a connector does, including the two attacks that
matter: a code redeemed without its proof key, and a redirect the client
never registered.

`web/api/_mcp/` holds the server. Vercel does not turn a file whose path
starts with an underscore into a route, so those modules are imported and
never served. `_data.mjs`, `_engine.mjs` and `_knowledge.mjs` are generated
by `tools/build_mcp.py` and committed, the way `index.html` is, because
Vercel builds only the `web` directory and cannot reach the rest of the
repository.

## The password

Vercel's own Password Protection is a Pro feature. This does the same job on
the free plan with Edge Middleware, which runs on Vercel's side before a
single byte of the proposal is sent. A password box built into the HTML
would be theatre: the file, the IBAN and the signature would already be on
the visitor's machine before the box appeared.

The password is the `TFP_PASSWORD` environment variable on the project, set
for production and preview. Changing it needs a redeploy.

**It fails closed.** With no password configured the middleware serves a 503
and nothing else, so forgetting to set the variable cannot quietly publish
the office's bank details.

## Shared templates

`api/templates.js` keeps the office's templates in a private Vercel Blob
store, **one small file per template**. The browser also caches the list so
it draws instantly, but the office copy is the truth.

Behind the same password: the middleware matches every path, `/api/*`
included.

## Three traps, all of which bit

**An HTTP header value must be ASCII.** The `WWW-Authenticate` realm said
`VADO — العرض الفني والمالي`, so the whole header was dropped on the way out
and browsers showed a bare `HTTP ERROR 401` with no password box. Keep the
realm in Latin characters.

**Hobby does not protect production.** Vercel Authentication covers preview
deployments only, so a production deployment on this plan is public no
matter what the protection screen appears to say. The first deployment here
served the office IBAN to anyone with the link for about twenty minutes.
Always fetch the live URL with no credentials and grep for something secret
before calling it protected.

**Vercel Blob is eventually consistent, about ten seconds.** The first
version of the template store kept everything in one JSON file, so two
people saving inside that window each read the same stale copy, applied
their own change and wrote it back. The second write silently erased the
first; deleting three templates in a row resurrected two of them. One blob
per template removes the read-modify-write entirely, and a write can no
longer touch anyone else's work.

Also: `@vercel/blob` needs v2 or later for private stores, and passing
`access: 'public'` to a private store is an error.

## What this setup does not do

There is no identity. One shared password means anyone who can add a
template can delete one, and nothing records who did either. That was a
deliberate choice, made knowing the cost. The connector inherits it: every
employee's token says the same thing about who they are, which is nothing,
and any of them can read every proposal in the store.

There are no refresh tokens either. OAuth 2.1 wants a public client's
refresh token rotated, and rotation needs somewhere to remember the last
one, which this deliberately does not have. An access token lasts thirty
days and then the connector asks for the password again.
