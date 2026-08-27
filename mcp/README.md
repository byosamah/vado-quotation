# The connector

An employee opens Claude or ChatGPT, says «عندي عرض جديد لعميل في الخبر»,
sends the WhatsApp thread and a بلدي screenshot, answers four questions, and
gets back a link that opens the deck already filled. They read pages 5 and
12, press **حمّل الـ PDF**, and send it.

That is the whole product. This directory holds the prose the assistant is
given; the server itself is `web/api/`.

## Connecting

One URL:

    https://vado-tfp.vercel.app/mcp

**Claude** (web or desktop): Settings → Connectors → Add custom connector →
paste the URL.
**ChatGPT**: Settings → Apps → Advanced → Developer mode on, then add the
URL as a connector. Developer mode is on Pro, Team, Enterprise and Edu.

Either way a VADO login page opens once. Type the office password, the same
one the website asks for. The connector holds a token for thirty days and
then asks again.

## What it exposes

Eight tools:

| Tool | What it does |
|---|---|
| `proposal_start` | Begin one; returns a `job_id` and what is still missing |
| `proposal_set` | Write values, services, rooms, durations, payments |
| `proposal_review` | The pre-send check and the full read-back |
| `proposal_finish` | The link that opens the filled deck, and the job file |
| `proposal_get` | Reopen a proposal from an earlier conversation |
| `proposal_list` | The office's recent proposals, for an amendment |
| `balady_read` | Fifteen regulatory values out of one pasted بلدي panel |
| `reference_lookup` | The house English spelling of an Arabic name |

Nine resources, of which `vado://guide` is the one that matters: it is
`mcp/guide.md`, and it is what teaches the assistant not to invent a setback.
The rest are the skill's own reference files, unchanged.

Three prompts: `new_proposal`, `amend_proposal`, `read_balady`.

## How it is built

Nothing in the server decides what a field means. Every fact is read from
the file that already owns it, and `tools/build_mcp.py` copies them in:

| Generated | From | Holding |
|---|---|---|
| `_data.mjs` | `theme.json`, `content.json`, the skill's `fields.md`, a blank build | the three layers, the Arabic labels, which page prints which value |
| `_engine.mjs` | `html/src/ctx.js`, `html/src/checks.js` | the browser's own engine, verbatim |
| `_knowledge.mjs` | `mcp/guide.md` and the skill's references | the resources |

`_engine.mjs` is the important one. The fee in Arabic words, the riyal
amount on each payment row, which phases appear, how long the programme
runs and what قبل الإرسال finds are all computed by the same JavaScript the
browser runs. A port would have been a second answer to every one of those.

The page map is read off a blank build of the PowerPoint, where every
unfilled value prints as its own `{{tag}}`. So «صفحة ٤» in a review is
wherever the deck really draws that value, not a list somebody maintained.

## The state

The 2026-07-28 revision has no session and no `initialize` handshake, so
every request stands alone. A proposal lives in the Vercel Blob store and
travels as `job_id`, an ordinary tool argument, which is exactly what the
revision says to do with server state.

Reads go by pathname with the CDN cache off. Never through `list`: an
assistant hands over a link seconds after saving, and `list` lags about ten.

## The password

`web/api/oauth/` is a small OAuth 2.1 authorization server. It exists
because an MCP client cannot be handed a password: Claude and ChatGPT both
expect to open a browser, have somebody prove who they are, and come back
with a token.

Everything is stateless and signed rather than stored, because Vercel Blob
is eventually consistent by about ten seconds and an authorization code is
redeemed inside two. The costs of that are written out at the top of
`web/api/_mcp/auth.mjs`: a code cannot be marked used inside its sixty
seconds, there are no refresh tokens, and revocation means changing
`TFP_MCP_SECRET`, which invalidates every token at once.

It fails closed. With no `TFP_MCP_SECRET` set there is nothing to verify a
token against, and `/mcp` answers 503 rather than serving the office's bank
details to whoever finds the URL.

Four things there are worth knowing, because each is a way this kind of
server is normally got wrong:

**The login page carries the request forward, never the body.** It used to
build its hidden fields from everything it had parsed, and a POST body holds
the password, so a wrong password was written back into the page as a hidden
input. It now copies only the eight parameters of the authorization request.

**`client_id` may be a URL this server fetches.** That is what Client ID
Metadata Documents are, and it is a request forgery unless it is fenced. The
fence is crude on purpose: HTTPS, default port, a public host name, no IP
literal, no credentials in the URL, no redirect followed, and at most 64 kB
read. A real client metadata document is never anything else.

**The origin is a fact, not a header.** In production it comes from the
project, not from `x-forwarded-host`. Every token audience, the issuer, and
the link handed to an employee are built from it, and a spoofed host would
send somebody to a page of somebody else's choosing wearing this name.

**It signs for one audience.** A client naming any other `resource` is
refused before the password page is drawn, rather than quietly handed a
token for here.

## Two environment variables

    TFP_PASSWORD     the office password, already set; the login page uses it
    TFP_MCP_SECRET   at least 24 characters, for signing tokens

Both are set for production only, because `TFP_PASSWORD` always has been. A
preview deployment therefore has neither and answers 503 from the login page
and from `/mcp`, which is the intended answer rather than a gap. A blob store
must be connected too, which it already is for the templates.

## Checking it

    PYTHON=python3 tools/smoke.sh          builds and runs everything
    node tools/mcp_selftest.mjs            one proposal, end to end, no server
    python3 tools/check_parity.py          the two pre-send checks must agree
    tools/mcp_live.sh https://…            the OAuth flow against a deployment

`mcp_selftest.mjs` drives the real wire protocol against the real handler,
so it catches a broken schema or a tool that stopped answering. What it does
not touch is Vercel's routing and the login page; `mcp_live.sh` does those.

`check_parity.py` is the referee. There are two pre-send checks and there
have to be: `tools/presend.py` reads a built .pptx and can see a `{{tag}}`
the PowerPoint really printed, and `html/src/checks.js` runs where there is
no .pptx at all. Two implementations of one rule is how a rule ends up with
two answers, so every job file is run through both and the facts that must
agree are compared.

## What it deliberately does not do

**It does not make the PDF.** The link opens the deck and a person presses
the button. That is not a missing feature: the browser prints with the real
fonts embedded, and somebody looks at fifteen pages before a client does.

**It does not refuse to hand over an unfinished proposal.** One goes out
while a بلدي value is still being chased, and a tool that refuses to print
gets worked around by rebuilding the deck by hand, which is how a proposal
leaves with no check at all. It says what is still open and hands it over.

**It does not know who is asking.** One office password, no identity, the
same as the rest of this deployment. Anyone who can fill a proposal can read
every other proposal in the store.
