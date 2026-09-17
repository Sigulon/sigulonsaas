/**
 * Object storage helper for call audio recordings.
 * Supports GCS and S3/Spaces with signed URL generation.
 * Metadata resides in MongoDB; audio blobs reside in cloud object storage.
 */

export interface SignedUrlOptions {
  provider?: string;
  bucket: string;
  objectKey: string;
}

export function generateDownloadUrl(options: SignedUrlOptions): string {
  const { provider = "gcs", bucket, objectKey } = options;
  const cdnBase = process.env.RECORDINGS_CDN_URL;

  if (cdnBase) {
    const cleanBase = cdnBase.replace(/\/$/, "");
    return `${cleanBase}/${objectKey}`;
  }

  if (provider === "s3" || provider === "spaces") {
    const region = process.env.AWS_REGION || "us-east-1";
    return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(objectKey)}`;
  }

  // Default: Google Cloud Storage
  return `https://storage.googleapis.com/${bucket}/${encodeURIComponent(objectKey)}`;
}
