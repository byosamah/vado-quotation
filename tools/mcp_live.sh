#!/usr/bin/env bash
# Check a deployment the way a connector and a stranger would.
#
#   TFP_PASSWORD=… tools/mcp_live.sh https://vado-tfp.vercel.app
#
# `tools/mcp_selftest.mjs` proves the tools work. This proves the parts that
# only exist once it is deployed: Vercel's routing, the discovery documents,
# the login page, and the whole authorization flow end to end.
#
# It starts with the check DEPLOY.md was written around, because it is the
# one that cost twenty minutes of the office IBAN being public: fetch the
# site with no credentials and grep for something secret. Letting the MCP
# paths past the front-door password is exactly the kind of change that
# could undo that, so it is re-proved every time.
set -uo pipefail

BASE="${1:-}"
if [ -z "$BASE" ]; then
  echo "usage: TFP_PASSWORD=… $0 https://vado-tfp.vercel.app" >&2
  exit 2
fi
BASE="${BASE%/}"
fail=0
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

ok()   { echo "ok    $1"; }
bad()  { echo "FAIL  $1"; [ -n "${2:-}" ] && echo "      $2"; fail=1; }

say()  { echo; echo "-- $1"; }

# ---------------------------------------------------------------- the door

say "the front door is still shut"

body="$(curl -sS --max-time 20 "$BASE/")"
code="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$BASE/")"
[ "$code" = 401 ] && ok "the deck asks for the password ($code)" \
                  || bad "the deck answered $code, not 401"

# The IBAN, the signature and the client's phone are all inside index.html.
# Grep for the bank mark rather than the number itself, so this script can
# live in the repository without carrying the number.
if printf '%s' "$body" | grep -qiE 'IBAN|alinma|SA[0-9]{10}'; then
  bad "something from the office bank block was served without a password"
else
  ok "nothing secret came back unauthenticated"
fi

code="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$BASE/api/job?id=x")"
[ "$code" = 401 ] && ok "a saved proposal asks for the password ($code)" \
                  || bad "/api/job answered $code, not 401"

# ------------------------------------------------------------- discovery

say "what a connector reads first"

hdr="$(curl -sS --max-time 20 -D - -o /dev/null -X POST "$BASE/mcp" \
        -H 'content-type: application/json' -H 'mcp-method: tools/list' \
        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}')"
printf '%s' "$hdr" | grep -qi '^HTTP/[0-9.]* 401' \
  && ok "an unauthenticated call is refused" \
  || bad "the MCP endpoint did not answer 401" "$(printf '%s' "$hdr" | head -3)"
printf '%s' "$hdr" | grep -qi 'www-authenticate: *bearer.*resource_metadata' \
  && ok "the refusal says where the metadata is" \
  || bad "no resource_metadata in WWW-Authenticate" \
         "$(printf '%s' "$hdr" | grep -i www-authenticate)"

prm="$(curl -sS --max-time 20 "$BASE/.well-known/oauth-protected-resource/mcp")"
printf '%s' "$prm" | grep -q '"authorization_servers"' \
  && ok "the protected resource names its authorization server" \
  || bad "no protected resource metadata" "$prm"

asm="$(curl -sS --max-time 20 "$BASE/.well-known/oauth-authorization-server")"
printf '%s' "$asm" | grep -q '"S256"' \
  && ok "the authorization server requires PKCE with S256" \
  || bad "no S256 in the authorization server metadata" "$asm"

# --------------------------------------------------------------- the flow

if [ -z "${TFP_PASSWORD:-}" ]; then
  echo
  echo "skip  the login flow: set TFP_PASSWORD to run it"
  echo
  [ "$fail" = 0 ] && echo "all good, as far as it went" || echo "SOMETHING IS BROKEN"
  exit $fail
fi

say "the whole login, as a connector does it"

reg="$(curl -sS --max-time 20 -X POST "$BASE/oauth/register" \
        -H 'content-type: application/json' \
        -d '{"client_name":"vado live check","redirect_uris":["http://127.0.0.1:47821/callback"],"application_type":"native"}')"
CLIENT="$(printf '%s' "$reg" | sed -n 's/.*"client_id":"\([^"]*\)".*/\1/p')"
[ -n "$CLIENT" ] && ok "a client can register" \
                 || { bad "registration failed" "$reg"; }

# PKCE, generated the way a client does.
VERIFIER="$(head -c 48 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=' | tr -d '\n')"
CHALLENGE="$(printf '%s' "$VERIFIER" | openssl dgst -binary -sha256 \
             | base64 | tr '+/' '-_' | tr -d '=' | tr -d '\n')"

AUTHZ="$BASE/oauth/authorize"
RESOURCE="$BASE/mcp"
REDIRECT="http://127.0.0.1:47821/callback"

# No PKCE must be refused before anything else happens.
noc="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' \
      --get "$AUTHZ" --data-urlencode "client_id=$CLIENT" \
      --data-urlencode "redirect_uri=$REDIRECT" --data-urlencode 'response_type=code')"
[ "$noc" = 400 ] && ok "a request with no proof key is refused ($noc)" \
                 || bad "authorize answered $noc to a request with no PKCE"

# A redirect the client never registered must be refused on the page, never
# by redirecting to it.
evil="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' \
       --get "$AUTHZ" --data-urlencode "client_id=$CLIENT" \
       --data-urlencode 'redirect_uri=https://example.com/steal' \
       --data-urlencode "code_challenge=$CHALLENGE" \
       --data-urlencode 'code_challenge_method=S256' \
       --data-urlencode 'response_type=code')"
[ "$evil" = 400 ] && ok "an unregistered redirect is refused ($evil)" \
                  || bad "authorize answered $evil to an unregistered redirect"

page="$(curl -sS --max-time 20 --get "$AUTHZ" \
       --data-urlencode "client_id=$CLIENT" --data-urlencode "redirect_uri=$REDIRECT" \
       --data-urlencode "code_challenge=$CHALLENGE" \
       --data-urlencode 'code_challenge_method=S256' \
       --data-urlencode 'response_type=code' --data-urlencode "resource=$RESOURCE" \
       --data-urlencode 'state=livecheck')"
printf '%s' "$page" | grep -q 'name="password"' \
  && ok "the login page asks for the office password" \
  || bad "no password box on the authorize page" "$(printf '%s' "$page" | head -3)"

wrong="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' -X POST "$AUTHZ" \
        --data-urlencode "client_id=$CLIENT" --data-urlencode "redirect_uri=$REDIRECT" \
        --data-urlencode "code_challenge=$CHALLENGE" \
        --data-urlencode 'code_challenge_method=S256' \
        --data-urlencode 'response_type=code' --data-urlencode "resource=$RESOURCE" \
        --data-urlencode 'password=not the password')"
[ "$wrong" = 401 ] && ok "the wrong password is refused ($wrong)" \
                   || bad "a wrong password answered $wrong, not 401"

loc="$(curl -sS --max-time 20 -o /dev/null -w '%{redirect_url}' -X POST "$AUTHZ" \
      --data-urlencode "client_id=$CLIENT" --data-urlencode "redirect_uri=$REDIRECT" \
      --data-urlencode "code_challenge=$CHALLENGE" \
      --data-urlencode 'code_challenge_method=S256' \
      --data-urlencode 'response_type=code' --data-urlencode "resource=$RESOURCE" \
      --data-urlencode 'state=livecheck' \
      --data-urlencode "password=$TFP_PASSWORD")"
CODE="$(printf '%s' "$loc" | sed -n 's/.*[?&]code=\([^&]*\).*/\1/p')"
[ -n "$CODE" ] && ok "the right password hands back a code" \
               || bad "no code came back" "$loc"
printf '%s' "$loc" | grep -q 'iss=' \
  && ok "the redirect carries iss, as RFC 9207 wants" \
  || bad "no iss on the authorization response" "$loc"
printf '%s' "$loc" | grep -q 'state=livecheck' \
  && ok "state is handed back" || bad "state was dropped" "$loc"

badpk="$(curl -sS --max-time 20 -X POST "$BASE/oauth/token" \
        --data-urlencode 'grant_type=authorization_code' \
        --data-urlencode "code=$CODE" --data-urlencode "client_id=$CLIENT" \
        --data-urlencode "redirect_uri=$REDIRECT" \
        --data-urlencode 'code_verifier=the wrong verifier')"
printf '%s' "$badpk" | grep -q 'invalid_grant' \
  && ok "a code without its verifier is worthless" \
  || bad "the token endpoint accepted a bad verifier" "$badpk"

tok="$(curl -sS --max-time 20 -X POST "$BASE/oauth/token" \
      --data-urlencode 'grant_type=authorization_code' \
      --data-urlencode "code=$CODE" --data-urlencode "client_id=$CLIENT" \
      --data-urlencode "redirect_uri=$REDIRECT" \
      --data-urlencode "resource=$RESOURCE" \
      --data-urlencode "code_verifier=$VERIFIER")"
TOKEN="$(printf '%s' "$tok" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
[ -n "$TOKEN" ] && ok "the code becomes an access token" \
                || bad "no access token" "$tok"

# --------------------------------------------------------------- the tools

say "the tools, through the real endpoint"

res="$(curl -sS --max-time 30 -X POST "$BASE/mcp" \
      -H "authorization: Bearer $TOKEN" \
      -H 'content-type: application/json' \
      -H 'accept: application/json, text/event-stream' \
      -H 'mcp-method: tools/list' \
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}')"
printf '%s' "$res" | grep -q 'proposal_start' \
  && ok "tools/list answers with the proposal tools" \
  || bad "tools/list did not answer" "$(printf '%s' "$res" | head -c 400)"

res="$(curl -sS --max-time 30 -X POST "$BASE/mcp" \
      -H "authorization: Bearer $TOKEN" \
      -H 'content-type: application/json' \
      -H 'accept: application/json, text/event-stream' \
      -H 'mcp-method: resources/read' -H 'mcp-name: vado://guide' \
      -d '{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"vado://guide","_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}')"
printf '%s' "$res" | grep -q 'Never invent a regulatory value' \
  && ok "the guide reaches the assistant" \
  || bad "the guide did not come back" "$(printf '%s' "$res" | head -c 400)"

echo
[ "$fail" = 0 ] && echo "all good" || echo "SOMETHING IS BROKEN"
exit $fail
