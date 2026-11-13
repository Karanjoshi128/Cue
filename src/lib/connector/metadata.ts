import { AUTHORIZE_PATH, MCP_PATH, REGISTER_PATH, SCOPE, TOKEN_PATH, originOf } from "./config";

// Discovery documents: where an assistant learns how to sign in. Built from
// the request's origin so they match the address the person pasted.

const PUBLIC_JSON = {
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
};

/** RFC 9728: the MCP endpoint and who issues its tokens. */
export function protectedResourceMetadata(req: Request): Response {
  const origin = originOf(req);
  return Response.json(
    {
      resource: `${origin}${MCP_PATH}`,
      authorization_servers: [origin],
      scopes_supported: [SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "Cue",
    },
    { headers: PUBLIC_JSON },
  );
}

/** RFC 8414: this site as the authorization server. */
export function authorizationServerMetadata(req: Request): Response {
  const origin = originOf(req);
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}${AUTHORIZE_PATH}`,
      token_endpoint: `${origin}${TOKEN_PATH}`,
      registration_endpoint: `${origin}${REGISTER_PATH}`,
      scopes_supported: [SCOPE],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      authorization_response_iss_parameter_supported: true,
    },
    { headers: PUBLIC_JSON },
  );
}
