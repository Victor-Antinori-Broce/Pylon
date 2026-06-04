
/**
 * Storage Adapter
 * 
 * Abstracción para múltiples proveedores de storage:
 * - MinIO (self-hosted S3)
 * - AWS S3
 * - Local filesystem
 * - Cloudflare R2
 */

// AWS SDK imported lazily to avoid breaking grimoire loading if packages aren't available
let S3Client: any, HeadBucketCommand: any, PutObjectCommand: any, GetObjectCommand: any, DeleteObjectCommand: any;
let getSignedUrl: any;

async function loadAwsSdk() {
  if (!S3Client) {
    // @ts-ignore
    const s3 = await import("@aws-sdk/client-s3");
    S3Client = s3.S3Client;
    HeadBucketCommand = s3.HeadBucketCommand;
    PutObjectCommand = s3.PutObjectCommand;
    GetObjectCommand = s3.GetObjectCommand;
    DeleteObjectCommand = s3.DeleteObjectCommand;
    // @ts-ignore
    const presigner = await import("@aws-sdk/s3-request-presigner");
    getSignedUrl = presigner.getSignedUrl;
  }
}

import { existsSync, mkdirSync } from "fs";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import type { StorageConfig } from "./config.schema";

// ═══════════════════════════════════════════════════════════════════════════
// Test Connection
// ═══════════════════════════════════════════════════════════════════════════

export async function testStorageConnection(
  config: StorageConfig
): Promise<{ success: boolean; message: string }> {
  try {
    switch (config.provider) {
      case "minio":
        return await testMinioConnection(config);
      case "s3":
        return await testS3Connection(config);
      case "local":
        return await testLocalConnection(config);
      case "r2":
        return await testR2Connection(config);
      default:
        return { success: false, message: "Unknown provider" };
    }
  } catch (err: any) {
    return { success: false, message: err.message || "Connection failed" };
  }
}

async function testMinioConnection(config: Extract<StorageConfig, { provider: "minio" }>): Promise<{ success: boolean; message: string }> {
  try {
    await loadAwsSdk();
    const client = new S3Client({
      endpoint: config.endpoint,
      region: "us-east-1", // MinIO doesn't care but SDK requires it
      credentials: {
        accessKeyId: config.accessKey || "minioadmin",
        secretAccessKey: config.secretKey || "minioadmin",
      },
      forcePathStyle: true, // Required for MinIO
    });

    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    return { success: true, message: "Connected to MinIO successfully" };
  } catch (err: any) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return { success: false, message: `Bucket "${config.bucket}" not found` };
    }
    if (err.name === "Forbidden" || err.$metadata?.httpStatusCode === 403) {
      return { success: false, message: "Invalid credentials" };
    }
    if (err.code === "ECONNREFUSED") {
      return { success: false, message: `Cannot connect to ${config.endpoint}. Is MinIO running?` };
    }
    return { success: false, message: err.message || "MinIO connection failed" };
  }
}

async function testS3Connection(config: Extract<StorageConfig, { provider: "s3" }>): Promise<{ success: boolean; message: string }> {
  try {
    await loadAwsSdk();
    const client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId || "",
        secretAccessKey: config.secretAccessKey || "",
      },
    });

    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    return { success: true, message: "Connected to AWS S3 successfully" };
  } catch (err: any) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return { success: false, message: `Bucket "${config.bucket}" not found` };
    }
    if (err.name === "Forbidden" || err.$metadata?.httpStatusCode === 403) {
      return { success: false, message: "Invalid AWS credentials" };
    }
    return { success: false, message: err.message || "AWS S3 connection failed" };
  }
}

async function testLocalConnection(config: Extract<StorageConfig, { provider: "local" }>): Promise<{ success: boolean; message: string }> {
  try {
    const path = config.path;
    
    // Check if directory exists or can be created
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
    
    // Test write/read/delete
    const testFile = join(path, ".gremius-test");
    await writeFile(testFile, "test", "utf-8");
    await readFile(testFile, "utf-8");
    await unlink(testFile);
    
    return { success: true, message: `Local storage ready at ${path}` };
  } catch (err: any) {
    return { success: false, message: `Cannot access ${config.path}: ${err.message}` };
  }
}

async function testR2Connection(config: Extract<StorageConfig, { provider: "r2" }>): Promise<{ success: boolean; message: string }> {
  try {
    await loadAwsSdk();
    const client = new S3Client({
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      region: "auto",
      credentials: {
        accessKeyId: config.accessKeyId || "",
        secretAccessKey: config.secretAccessKey || "",
      },
    });

    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    return { success: true, message: "Connected to Cloudflare R2 successfully" };
  } catch (err: any) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return { success: false, message: `Bucket "${config.bucket}" not found` };
    }
    if (err.name === "Forbidden" || err.$metadata?.httpStatusCode === 403) {
      return { success: false, message: "Invalid R2 credentials" };
    }
    return { success: false, message: err.message || "R2 connection failed" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Storage Adapter Factory
// ═══════════════════════════════════════════════════════════════════════════

export interface StorageAdapter {
  upload(key: string, data: Buffer | string, contentType?: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getSignedUploadUrl(key: string, expiresIn?: number): Promise<string>;
  getSignedDownloadUrl(key: string, expiresIn?: number): Promise<string>;
  getPublicUrl(key: string): string | null;
}

export async function createStorageAdapter(config: StorageConfig): Promise<StorageAdapter> {
  // Load AWS SDK for S3-based providers
  if (config.provider !== "local") {
    await loadAwsSdk();
  }
  switch (config.provider) {
    case "minio":
      return new MinioAdapter(config);
    case "s3":
      return new S3Adapter(config);
    case "local":
      return new LocalAdapter(config);
    case "r2":
      return new R2Adapter(config);
    default:
      throw new Error(`Unknown storage provider: ${(config as any).provider}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MinIO Adapter
// ═══════════════════════════════════════════════════════════════════════════

class MinioAdapter implements StorageAdapter {
  private client: any;
  private bucket: string;
  private publicUrl: string | undefined;

  constructor(config: Extract<StorageConfig, { provider: "minio" }>) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: "us-east-1",
      credentials: {
        accessKeyId: config.accessKey || "minioadmin",
        secretAccessKey: config.secretKey || "minioadmin",
      },
      forcePathStyle: true,
    });
    this.bucket = config.bucket;
    this.publicUrl = config.publicUrl;
  }

  async upload(key: string, data: Buffer | string, contentType?: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    }));
  }

  async download(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }

  async getSignedUploadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async getSignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  getPublicUrl(key: string): string | null {
    if (!this.publicUrl) return null;
    return `${this.publicUrl}/${key}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AWS S3 Adapter
// ═══════════════════════════════════════════════════════════════════════════

class S3Adapter implements StorageAdapter {
  private client: any;
  private bucket: string;
  private publicUrl: string | undefined;

  constructor(config: Extract<StorageConfig, { provider: "s3" }>) {
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId || "",
        secretAccessKey: config.secretAccessKey || "",
      },
    });
    this.bucket = config.bucket;
    this.publicUrl = config.publicUrl;
  }

  async upload(key: string, data: Buffer | string, contentType?: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    }));
  }

  async download(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }

  async getSignedUploadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async getSignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  getPublicUrl(key: string): string | null {
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }
    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Local Filesystem Adapter
// ═══════════════════════════════════════════════════════════════════════════

class LocalAdapter implements StorageAdapter {
  private basePath: string;
  private publicUrl: string;

  constructor(config: Extract<StorageConfig, { provider: "local" }>) {
    this.basePath = config.path;
    this.publicUrl = config.publicUrl;
    
    // Ensure directory exists
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  async upload(key: string, data: Buffer | string): Promise<void> {
    const filePath = join(this.basePath, key);
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    await writeFile(filePath, data);
  }

  async download(key: string): Promise<Buffer> {
    const filePath = join(this.basePath, key);
    return readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.basePath, key);
    await unlink(filePath);
  }

  async getSignedUploadUrl(key: string): Promise<string> {
    // Local storage doesn't need signed URLs
    return this.getPublicUrl(key) || "";
  }

  async getSignedDownloadUrl(key: string): Promise<string> {
    return this.getPublicUrl(key) || "";
  }

  getPublicUrl(key: string): string | null {
    return `${this.publicUrl}/${key}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Cloudflare R2 Adapter
// ═══════════════════════════════════════════════════════════════════════════

class R2Adapter implements StorageAdapter {
  private client: any;
  private bucket: string;
  private publicUrl: string | undefined;

  constructor(config: Extract<StorageConfig, { provider: "r2" }>) {
    this.client = new S3Client({
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      region: "auto",
      credentials: {
        accessKeyId: config.accessKeyId || "",
        secretAccessKey: config.secretAccessKey || "",
      },
    });
    this.bucket = config.bucket;
    this.publicUrl = config.publicUrl;
  }

  async upload(key: string, data: Buffer | string, contentType?: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    }));
  }

  async download(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }

  async getSignedUploadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async getSignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  getPublicUrl(key: string): string | null {
    if (!this.publicUrl) return null;
    return `${this.publicUrl}/${key}`;
  }
}
