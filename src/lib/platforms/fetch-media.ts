import https from "https";
import { isIP } from "net";
import { MAX_BYTES } from "@/lib/media";
import { isPrivateAddress, publicOnlyAgent } from "@/lib/storage";

/**
 * Downloads a post's media to hand to a platform. The URL is stored post
 * data, so this is where Cue's servers fetch an address a user supplied:
 * https only, public addresses only (enforced on the connection itself, see
 * publicOnlyAgent), no redirects, one deadline for the whole download, and
 * the upload size cap. A slow or endless file then fails its own target
 * instead of stalling the publish run every workspace shares.
 */
type Fetched = { bytes: Buffer<ArrayBuffer>; contentType: string | null };

export function fetchMedia(url: string, timeoutMs: number): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return reject(new Error("The media URL isn't valid."));
    }
    if (parsed.protocol !== "https:") {
      return reject(new Error("The media URL must use https."));
    }
    // The agent's lookup guards hostnames; a literal IP skips DNS entirely.
    const host = parsed.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && isPrivateAddress(host)) {
      return reject(new Error("The media URL points to a private network address."));
    }

    let settled = false;
    const finish = (err: Error | null, value?: Fetched) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(value!);
    };

    // https.get never follows redirects, so a 3xx lands below as a failure.
    const req = https.get(parsed, { agent: publicOnlyAgent() }, (res) => {
      const status = res.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        res.resume();
        return finish(new Error(`Could not fetch the media file (${status}).`));
      }
      if (Number(res.headers["content-length"]) > MAX_BYTES) {
        req.destroy();
        return finish(new Error("The media file is too large."));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          req.destroy();
          return finish(new Error("The media file is too large."));
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        const type = res.headers["content-type"];
        // concat always copies into a fresh, unshared ArrayBuffer.
        const bytes = Buffer.concat(chunks, size) as Buffer<ArrayBuffer>;
        finish(null, { bytes, contentType: type ?? null });
      });
      res.on("error", (e) => finish(e));
    });
    const timer = setTimeout(() => {
      req.destroy();
      finish(new Error(`Fetching the media file took longer than ${timeoutMs / 1000}s.`));
    }, timeoutMs);
    req.on("error", (e) => finish(e));
  });
}
