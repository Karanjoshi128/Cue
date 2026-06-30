/**
 * Full media path test: fetch a JPEG → upload to R2 (real code) → publish via
 * the real Instagram adapter using the R2 public URL.
 * Run: npx tsx --env-file=.env scripts/test-ig-post.ts
 */
import { uploadToR2 } from "../src/lib/r2";
import { instagramAdapter } from "../src/lib/platforms/instagram";

async function main() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error("INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_ACCOUNT_ID not set");
  }

  console.log("1/3  Fetching a sample JPEG…");
  const imgRes = await fetch(
    "https://upload.wikimedia.org/wikipedia/commons/3/3a/Cat03.jpg",
  );
  if (!imgRes.ok) throw new Error(`Sample image fetch failed: ${imgRes.status}`);
  const bytes = Buffer.from(await imgRes.arrayBuffer());

  console.log("2/3  Uploading to Cloudflare R2…");
  const key = `posts/test-${Date.now()}.jpg`;
  const url = await uploadToR2(key, bytes, "image/jpeg");
  console.log("     R2 public URL:", url);

  console.log("3/3  Publishing to Instagram (image hosted on R2)…");
  const result = await instagramAdapter.publish({
    body: "Cue media test ✅ — image served from Cloudflare R2.",
    media: [{ type: "IMAGE", url }],
    accessToken: token,
    externalId: accountId,
  });

  console.log("\n✅ Full pipeline works (R2 → Instagram)!");
  console.log("   media id :", result.externalPostId);
  console.log("   permalink:", result.permalink ?? "(none returned)");
}

main().catch((err) => {
  console.error("\n❌ Test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
