/* Authorization code for access token.
 *
 * Four things are checked and every one of them has a job:
 *
 *   the signature   the code came from this server
 *   the verifier    the client redeeming it is the one that started the flow
 *   the redirect    the code was issued for this exact callback
 *   the client      the code was issued to this exact client
 *
 * There is no refresh grant. See the note at the top of `_mcp/auth.mjs`:
 * rotating a public client's refresh token needs somewhere to remember the
 * last one, and this deployment deliberately remembers nothing.
 */
import {
  originOf, ready, readCode, pkceMatches, mintAccessToken, oauthError, json,
} from '../_mcp/auth.mjs';

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return json({}, 204);
    if (request.method !== 'POST') {
      return oauthError('invalid_request', 'POST only', 405);
    }
    if (!ready()) {
      return oauthError('server_error',
        'the connector is not configured yet', 503);
    }

    const origin = originOf(request);
    let form;
    try { form = await request.formData(); }
    catch (e) {
      return oauthError('invalid_request',
        'expected application/x-www-form-urlencoded');
    }
    const get = k => { const v = form.get(k); return v == null ? '' : String(v); };

    if (get('grant_type') !== 'authorization_code') {
      return oauthError('unsupported_grant_type',
        'only authorization_code is supported. This server issues no refresh '
        + 'tokens; the access token lasts thirty days.');
    }

    let claims;
    try { claims = await readCode(origin, get('code')); }
    catch (e) { return oauthError('invalid_grant', 'the code is not valid or has expired'); }

    if (get('client_id') !== claims.client_id) {
      return oauthError('invalid_grant', 'the code was issued to another client');
    }
    if (get('redirect_uri') !== claims.redirect_uri) {
      return oauthError('invalid_grant', 'redirect_uri does not match the code');
    }
    if (!await pkceMatches(claims.code_challenge, get('code_verifier'))) {
      return oauthError('invalid_grant', 'code_verifier does not match');
    }

    /* RFC 8707: a token is minted for one resource. When the client names
     * one at this step it must be the one the code was issued against, or a
     * token for somewhere else could be obtained with a code from here. */
    const asked = get('resource');
    if (asked && asked !== claims.resource) {
      return oauthError('invalid_target',
        'the resource does not match the one authorized');
    }

    const access_token = await mintAccessToken(origin, {
      clientId: claims.client_id,
      resource: claims.resource,
    });
    return json({
      access_token,
      token_type: 'Bearer',
      expires_in: 30 * 24 * 60 * 60,
      scope: 'tfp',
    });
  },
};
