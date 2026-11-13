// YouTube Data API calls for the Reply Desk. Reading and replying to comments
// need the youtube.force-ssl scope (connect with ?comments=1). Costs: reading
// is 1 quota unit a call, a reply is 50.

const API = "https://www.googleapis.com/youtube/v3";

async function call<T>(url: string, token: string, init?: { method?: "GET" | "POST"; json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) {
    throw new Error(`YouTube ${res.status}: ${body?.error?.message ?? "request failed"}`.slice(0, 300));
  }
  return body as T;
}

/** The signed-in channel's id (the account stores Google's user id instead). */
export async function myChannelId(token: string): Promise<string | null> {
  const res = await call<{ items?: { id: string }[] }>(`${API}/channels?part=id&mine=true`, token);
  return res.items?.[0]?.id ?? null;
}

export interface YouTubeComment {
  id: string; // the thread id, which is also its top-level comment's id
  videoId: string;
  text: string;
  author: string | null;
  authorChannelId: string | null;
  publishedAt: string;
}

function decode(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** The newest top-level comments across the channel's videos. */
export async function listChannelComments(token: string, channelId: string, max = 50): Promise<YouTubeComment[]> {
  type Item = {
    id: string;
    snippet: {
      videoId?: string;
      topLevelComment: {
        snippet: {
          textOriginal?: string;
          textDisplay?: string;
          authorDisplayName?: string;
          authorChannelId?: { value?: string };
          publishedAt: string;
        };
      };
    };
  };
  const res = await call<{ items?: Item[] }>(
    `${API}/commentThreads?part=snippet&allThreadsRelatedToChannelId=${encodeURIComponent(channelId)}&maxResults=${max}&order=time&textFormat=plainText`,
    token,
  );
  return (res.items ?? [])
    .filter((i) => i.snippet.videoId)
    .map((i) => {
      const c = i.snippet.topLevelComment.snippet;
      return {
        id: i.id,
        videoId: i.snippet.videoId!,
        text: c.textOriginal ?? decode(c.textDisplay ?? ""),
        author: c.authorDisplayName ?? null,
        authorChannelId: c.authorChannelId?.value ?? null,
        publishedAt: c.publishedAt,
      };
    });
}

/** Titles for up to 50 video ids, in one call. */
export async function videoTitles(token: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const res = await call<{ items?: { id: string; snippet: { title: string } }[] }>(
    `${API}/videos?part=snippet&id=${ids.slice(0, 50).map(encodeURIComponent).join(",")}`,
    token,
  );
  for (const v of res.items ?? []) out.set(v.id, v.snippet.title);
  return out;
}

/** Replies under a top-level comment, as the channel. */
export async function replyToYouTubeComment(token: string, parentId: string, text: string): Promise<string> {
  const res = await call<{ id: string }>(`${API}/comments?part=snippet`, token, {
    method: "POST",
    json: { snippet: { parentId, textOriginal: text } },
  });
  return res.id;
}
