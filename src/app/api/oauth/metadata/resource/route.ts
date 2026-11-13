import { protectedResourceMetadata } from "@/lib/connector/metadata";

// Served at /.well-known/oauth-protected-resource[/api/mcp] (next.config.ts).

export async function GET(req: Request) {
  return protectedResourceMetadata(req);
}
