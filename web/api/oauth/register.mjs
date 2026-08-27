/* Dynamic Client Registration, RFC 7591.
 *
 * Deprecated by the 2026-07-28 revision in favour of Client ID Metadata
 * Documents, and kept because several clients in the field still do this
 * and would otherwise not connect at all.
 *
 * Nothing is written down. The client_id handed back IS the client's own
 * metadata, signed by this server, so the authorize endpoint can read the
 * registered redirect URIs straight out of it. A registration cannot go
 * stale, cannot be lost, and cannot be read from a stale list.
 */
import { originOf, ready, registerClient, json, oauthError } from '../_mcp/auth.mjs';

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return json({}, 204);
    if (request.method !== 'POST') {
      return oauthError('invalid_request', 'POST only', 405);
    }
    if (!ready()) {
      return oauthError('server_error', 'the connector is not configured yet', 503);
    }

    let body;
    try { body = await request.json(); }
    catch (e) {
      return json({ error: 'invalid_client_metadata',
                    error_description: 'expected a JSON body' }, 400);
    }

    try {
      return json(await registerClient(originOf(request), body), 201);
    } catch (e) {
      return json({ error: 'invalid_redirect_uri',
                    error_description: e.message }, 400);
    }
  },
};
