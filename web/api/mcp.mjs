/* The MCP endpoint.
 *
 * Two lines of work: prove the caller holds a token this server issued,
 * then hand the request to the SDK. The SDK builds a fresh server for every
 * request, which is what the 2026-07-28 revision expects: no session, no
 * handshake, nothing kept between calls.
 *
 * `legacy: 'stateless'` serves the 2025 revisions from the same tools, so a
 * connector that has not caught up still works. Tools, resources and
 * prompts are declared once in `_mcp/server.mjs` and both eras get them.
 *
 * It fails closed. With no TFP_MCP_SECRET configured there is nothing to
 * verify a token against, and this answers 503 rather than serving the
 * office's bank details to whoever finds the URL. `middleware.js` lets this
 * path past the front-door password precisely because the check is here.
 */
import { createMcpHandler, requireBearerAuth } from '@modelcontextprotocol/server';

import { buildServer } from './_mcp/server.mjs';
import { originOf, ready, verifier, metadataUrl, SCOPE } from './_mcp/auth.mjs';
import { configured as storeReady } from './_mcp/store.mjs';

const handler = createMcpHandler(
  ({ requestInfo }) => buildServer({
    origin: requestInfo ? originOf(requestInfo) : '',
  }),
  {
    legacy: 'stateless',
    onerror: err => console.error('[mcp]', err && err.message),
  });

const notConfigured = what => new Response(
  JSON.stringify({ error: 'server_error', error_description: what }),
  { status: 503, headers: { 'content-type': 'application/json',
                            'cache-control': 'no-store' } });

export default {
  async fetch(request) {
    if (!ready()) {
      return notConfigured(
        'This MCP server has no TFP_MCP_SECRET or TFP_PASSWORD set, so it is '
        + 'refusing every request. Set both in the Vercel project settings '
        + 'and redeploy.');
    }
    if (!storeReady()) {
      return notConfigured(
        'No blob store is connected, so a proposal could not be saved. '
        + 'Connect one to the project and redeploy.');
    }

    /* A preflight carries no Authorization header by definition, so it has
     * to be answered before the gate rather than refused by it. */
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': '*',
        'access-control-max-age': '86400',
      } });
    }

    const origin = originOf(request);
    const gate = requireBearerAuth({
      verifier: verifier(origin),
      requiredScopes: [SCOPE],
      resourceMetadataUrl: metadataUrl(origin),
    });

    const auth = await gate(request);
    if (auth instanceof Response) return auth;
    return handler.fetch(request, { authInfo: auth });
  },
};
