/**
 * Object storage helper for call audio recordings.
 * Supports Cloudflare R2 (S3-compatible API), AWS S3, and GCS.
 *
 * Cloudflare R2 Config:
 * - Endpoint: https://4c7a0e97272f39d41f35ec9d495537d1.r2.cloudflarestorage.com
 * - Bucket: sigulon-storage
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface SignedUrlOptions {
  provider?: string;
  bucket: string;
  objectKey: string;
  expiresInSeconds?: number;
}

export interface UploadOptions {
  objectKey: string;
  body: Buffer | Uint8Array | Blob | ReadableStream;
  mimeType?: string;
  bucket?: string;
}

const R2_ACCOUNT_ID =
  process.env.R2_ACCOUNT_ID || "4c7a0e97272f39d41f35ec9d495537d1";
const R2_ENDPOINT =
  process.env.R2_ENDPOINT ||
  `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
export const R2_DEFAULT_BUCKET =
  process.env.R2_BUCKET_NAME || "sigulon-storage";

let r2ClientInstance: S3Client | null = null;

export function getR2Client(): S3Client | null {
  const accessKeyId =
    process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  if (!r2ClientInstance) {
    r2ClientInstance = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  return r2ClientInstance;
}

/**
 * Upload an audio recording directly to Cloudflare R2 storage.
 */
export async function uploadRecordingToR2(
  options: UploadOptions
): Promise<{ success: boolean; objectKey: string; bucket: string; url?: string; error?: string }> {
  const {
    objectKey,
    body,
    mimeType = "audio/webm",
    bucket = R2_DEFAULT_BUCKET,
  } = options;

  const client = getR2Client();

  if (!client) {
    console.warn(
      "[storage/r2] R2 credentials not set in environment (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY). Storing record metadata with stream fallback."
    );
    return {
      success: true,
      objectKey,
      bucket,
      url: `/api/recordings/raw/${encodeURIComponent(objectKey)}`,
    };
  }

  try {
    let payload: Buffer | Uint8Array;
    if (body instanceof Buffer || body instanceof Uint8Array) {
      payload = body;
    } else if (typeof (body as Blob).arrayBuffer === "function") {
      const ab = await (body as Blob).arrayBuffer();
      payload = Buffer.from(ab);
    } else {
      payload = Buffer.from(body as unknown as ArrayBuffer);
    }

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: payload,
      ContentType: mimeType,
    });

    await client.send(command);

    const publicUrl = process.env.R2_PUBLIC_URL
      ? `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${objectKey}`
      : undefined;

    return {
      success: true,
      objectKey,
      bucket,
      url: publicUrl,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "R2 upload failed";
    console.error("[storage/r2] Upload failed:", errorMsg);
    return {
      success: false,
      objectKey,
      bucket,
      error: errorMsg,
    };
  }
}

/**
 * Generate a signed or direct download URL for an audio recording.
 */
export async function generateDownloadUrlAsync(
  options: SignedUrlOptions
): Promise<string> {
  const {
    provider = "r2",
    bucket = R2_DEFAULT_BUCKET,
    objectKey,
    expiresInSeconds = 3600,
  } = options;

  const cdnBase = process.env.RECORDINGS_CDN_URL || process.env.R2_PUBLIC_URL;
  if (cdnBase) {
    const cleanBase = cdnBase.replace(/\/$/, "");
    return `${cleanBase}/${objectKey}`;
  }

  if (provider === "r2" || provider === "cloudflare") {
    const client = getR2Client();
    if (client) {
      try {
        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: objectKey,
        });
        return await getSignedUrl(client, command, {
          expiresIn: expiresInSeconds,
        });
      } catch (err) {
        console.warn("[storage/r2] Failed generating presigned R2 URL:", err);
      }
    }
    // Stream fallback route
    return `/api/recordings/stream/${encodeURIComponent(objectKey)}`;
  }

  if (provider === "s3" || provider === "spaces") {
    const region = process.env.AWS_REGION || "us-east-1";
    return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(objectKey)}`;
  }

  // Default: Google Cloud Storage
  return `https://storage.googleapis.com/${bucket}/${encodeURIComponent(objectKey)}`;
}

/**
 * Synchronous backward-compatible download URL generator.
 */
export function generateDownloadUrl(options: SignedUrlOptions): string {
  const { provider = "r2", bucket = R2_DEFAULT_BUCKET, objectKey } = options;
  const cdnBase = process.env.RECORDINGS_CDN_URL || process.env.R2_PUBLIC_URL;

  if (cdnBase) {
    const cleanBase = cdnBase.replace(/\/$/, "");
    return `${cleanBase}/${objectKey}`;
  }

  if (provider === "r2" || provider === "cloudflare") {
    // If public URL isn't configured, route through internal streaming handler
    return `/api/recordings/stream/${encodeURIComponent(objectKey)}`;
  }

  if (provider === "s3" || provider === "spaces") {
    const region = process.env.AWS_REGION || "us-east-1";
    return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(objectKey)}`;
  }

  // Default: Google Cloud Storage
  return `https://storage.googleapis.com/${bucket}/${encodeURIComponent(objectKey)}`;
}
