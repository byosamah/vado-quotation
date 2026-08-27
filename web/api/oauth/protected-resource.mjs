/* RFC 9728 Protected Resource Metadata.
 *
 * The first thing an MCP client reads after a 401. It says where the
 * authorization server is. Served at both
 * `/.well-known/oauth-protected-resource` and
 * `/.well-known/oauth-protected-resource/mcp`, because a client may probe
 * the origin or the resource path and either has to answer.
 */
import { originOf, protectedResourceMetadata, json } from '../_mcp/auth.mjs';

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return json({}, 204);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'method not allowed' }, 405, { allow: 'GET, HEAD' });
    }
    return json(protectedResourceMetadata(originOf(request)));
  },
};
