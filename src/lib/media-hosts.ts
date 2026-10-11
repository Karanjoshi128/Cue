// Hosts next/image may fetch and resize (next.config.ts reads this list).
// Only Cue's own media hosts: a wildcard would turn the deployment into an
// open image-resizing proxy for the whole internet, billed to us.
export const OPTIMIZED_MEDIA_HOSTS = [
  // Current R2_PUBLIC_URL (r2.dev development host).
  "pub-38504d71563d474a94538ff712ce61c6.r2.dev",
  // Planned R2 custom domain, see docs/dns-migration-cloudflare.md.
  // Listed ahead of the switch so the cutover doesn't break images.
  "media.trycue.space",
];

/**
 * Whether next/image can optimize this src. Media in a workspace's own bucket
 * can live on any host, so it must render with `unoptimized` (served as-is),
 * or next/image refuses the unlisted host outright.
 */
export function canOptimizeMedia(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === "https:" && OPTIMIZED_MEDIA_HOSTS.includes(url.hostname);
  } catch {
    return true; // a relative path is local, always fine
  }
}
