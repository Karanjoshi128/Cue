import { originOf } from "@/lib/connector/config";
import { exchangeCode, isOurResource, OAuthError, refreshGrant } from "@/lib/connector/oauth";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

/** The request's fields: form-encoded per RFC 6749, JSON tolerated. */
async function fields(req: Request): Promise<Record<string, string | undefined>> {
  const type = req.headers.get("content-type") ?? "";
  const out: Record<string, string | undefined> = {};
  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    for (const [k, v] of Object.entries(body ?? {})) if (typeof v === "string") out[k] = v;
  } else {
    for (const [k, v] of new URLSearchParams(await req.text())) out[k] = v;
  }
  // A client may send its id as HTTP Basic (with no secret: all are public).
  const basic = /^Basic\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (basic && !out.client_id) {
    out.client_id = decodeURIComponent(Buffer.from(basic, "base64").toString("utf8").split(":")[0]);
  }
  return out;
}

/** Swaps a code for tokens, or a refresh token for new ones. */
export async function POST(req: Request) {
  try {
    const f = await fields(req);
    if (!isOurResource(f.resource, originOf(req))) {
      throw new OAuthError("invalid_target", "That resource isn't served here.");
    }
    let tokens;
    if (f.grant_type === "authorization_code") {
      tokens = await exchangeCode({
        code: f.code,
        redirectUri: f.redirect_uri,
        clientId: f.client_id,
        verifier: f.code_verifier,
      });
    } else if (f.grant_type === "refresh_token") {
      tokens = await refreshGrant({ refreshToken: f.refresh_token, clientId: f.client_id });
    } else {
      throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
    }
    return Response.json(tokens, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof OAuthError) {
      return Response.json({ error: e.code, error_description: e.message }, { status: e.status, headers: NO_STORE });
    }
    throw e;
  }
}
