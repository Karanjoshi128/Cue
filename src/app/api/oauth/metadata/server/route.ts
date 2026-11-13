import { authorizationServerMetadata } from "@/lib/connector/metadata";

// Served at /.well-known/oauth-authorization-server (next.config.ts).

export async function GET(req: Request) {
  return authorizationServerMetadata(req);
}
