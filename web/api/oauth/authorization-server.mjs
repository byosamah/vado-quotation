/* RFC 8414 Authorization Server Metadata.
 *
 * Where the authorize and token endpoints are, and what this server will
 * accept: one scope, one grant, PKCE with S256 and nothing else.
 */
import { originOf, authorizationServerMetadata, json } from '../_mcp/auth.mjs';

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return json({}, 204);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'method not allowed' }, 405, { allow: 'GET, HEAD' });
    }
    return json(authorizationServerMetadata(originOf(request)));
  },
};
