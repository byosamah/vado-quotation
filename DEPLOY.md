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
`middleware.js` guarding it, and `api/templates.js` holding the office's
shared templates.

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
deliberate choice, made knowing the cost.
