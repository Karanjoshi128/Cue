import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 via the S3-compatible API.

let _client: S3Client | null = null;

function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
  });
  return _client;
}

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

/** Public URL for an object key. */
export function publicUrl(key: string): string {
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

/**
 * Presigned PUT URL so the browser uploads straight to R2, never routing the
 * bytes through a serverless function. Vercel caps request bodies at ~4.5 MB,
 * which any real video blows past, so this is the only workable path for video.
 *
 * Requires a CORS policy on the bucket allowing PUT from the app's origins.
 */
export async function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn },
  );
}

export async function deleteFromR2(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  // S3 DeleteObjects handles up to 1000 keys per call.
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await client().send(
      new DeleteObjectsCommand({
        Bucket: process.env.R2_BUCKET,
        Delete: { Objects: batch.map((Key) => ({ Key })) },
      }),
    );
  }
}
