import { handleMcp } from "@/lib/connector/mcp";

// The Claude and ChatGPT connector's MCP endpoint (src/lib/connector).

export const dynamic = "force-dynamic";
// create_post with action "now" publishes inline.
export const maxDuration = 120;

export async function POST(req: Request) {
  return handleMcp(req);
}

// No standalone event stream and no sessions to end.
function notAllowed() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export const GET = notAllowed;
export const DELETE = notAllowed;
