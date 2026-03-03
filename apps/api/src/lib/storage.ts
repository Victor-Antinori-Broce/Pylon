/**
 * S3 Storage Library
 * Unified storage service for MinIO / S3.
 * Supports upload, delete, signed URLs, and file access.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

export const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "gremius_minio",
    secretAccessKey: process.env.S3_SECRET_KEY || "gremius_minio_secret_2025",
  },
  forcePathStyle: true,
});

export const BUCKET = process.env.S3_BUCKET || "gremius-media";
export const PUBLIC_URL = process.env.S3_PUBLIC_URL || "http://localhost:9000";

export function generateS3Key(filename: string, prefix = "public"): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const id = randomUUID().slice(0, 8);
  return `${prefix}/${year}/${month}/${id}-${sanitized}`;
}

function buildPublicUrl(s3Key: string): string {
  return `${PUBLIC_URL}/${BUCKET}/${s3Key}`;
}

export async function uploadFile(
  file: File | Blob,
  filename: string,
  mimeType: string,
  prefix = "public"
): Promise<{ s3Key: string; url: string; size: number }> {
  const s3Key = generateS3Key(filename, prefix);
  const buffer = Buffer.from(await file.arrayBuffer());

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType,
      ContentLength: buffer.length,
    })
  );

  return {
    s3Key,
    url: buildPublicUrl(s3Key),
    size: buffer.length,
  };
}

/**
 * Upload a raw buffer to S3 (used by image optimization pipeline).
 */
export async function uploadBuffer(
  buffer: Buffer,
  s3Key: string,
  mimeType: string
): Promise<{ s3Key: string; url: string; size: number }> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType,
      ContentLength: buffer.length,
    })
  );

  return {
    s3Key,
    url: buildPublicUrl(s3Key),
    size: buffer.length,
  };
}

export async function deleteFile(s3Key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
    })
  );
}

export async function fileExists(s3Key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: s3Key }));
    return true;
  } catch {
    return false;
  }
}

export async function getFile(s3Key: string): Promise<ReadableStream | null> {
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
    return response.Body as unknown as ReadableStream;
  } catch {
    return null;
  }
}

// ── Signed URLs ────────────────────────────────────────────────

/**
 * Generate a time-limited signed URL for secure file access.
 * @param s3Key     The S3 object key
 * @param expiresIn TTL in seconds (default 3600 = 1 hour, max 86400 = 24h)
 */
export async function generateSignedDownloadUrl(
  s3Key: string,
  expiresIn = 3600
): Promise<string> {
  const clampedExpiry = Math.min(Math.max(expiresIn, 60), 86400);
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  return getSignedUrl(s3, command, { expiresIn: clampedExpiry });
}
