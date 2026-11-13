import { OAuthError, registerClient } from "@/lib/connector/oauth";

export const dynamic = "force-dynamic";

/** Dynamic client registration (RFC 7591): how Claude and ChatGPT introduce themselves. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    return Response.json(await registerClient(body), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof OAuthError) {
      return Response.json({ error: e.code, error_description: e.message }, { status: e.status });
    }
    throw e;
  }
}
