// @ts-nocheck
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
let S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand;
let getSignedUrl;
async function loadAwsSdk() {
    if (!S3Client) {
        const s3 = await import("@aws-sdk/client-s3");
        S3Client = s3.S3Client;
        HeadBucketCommand = s3.HeadBucketCommand;
        PutObjectCommand = s3.PutObjectCommand;
        GetObjectCommand = s3.GetObjectCommand;
        DeleteObjectCommand = s3.DeleteObjectCommand;
        const presigner = await import("@aws-sdk/s3-request-presigner");
        getSignedUrl = presigner.getSignedUrl;
    }
}
import { existsSync, mkdirSync } from "fs";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
// ═══════════════════════════════════════════════════════════════════════════
// Test Connection
// ═══════════════════════════════════════════════════════════════════════════
export async function testStorageConnection(config) {
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
    }
    catch (err) {
        return { success: false, message: err.message || "Connection failed" };
    }
}
async function testMinioConnection(config) {
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
    }
    catch (err) {
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
async function testS3Connection(config) {
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
    }
    catch (err) {
        if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
            return { success: false, message: `Bucket "${config.bucket}" not found` };
        }
        if (err.name === "Forbidden" || err.$metadata?.httpStatusCode === 403) {
            return { success: false, message: "Invalid AWS credentials" };
        }
        return { success: false, message: err.message || "AWS S3 connection failed" };
    }
}
async function testLocalConnection(config) {
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
    }
    catch (err) {
        return { success: false, message: `Cannot access ${config.path}: ${err.message}` };
    }
}
async function testR2Connection(config) {
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
    }
    catch (err) {
        if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
            return { success: false, message: `Bucket "${config.bucket}" not found` };
        }
        if (err.name === "Forbidden" || err.$metadata?.httpStatusCode === 403) {
            return { success: false, message: "Invalid R2 credentials" };
        }
        return { success: false, message: err.message || "R2 connection failed" };
    }
}
export async function createStorageAdapter(config) {
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
            throw new Error(`Unknown storage provider: ${config.provider}`);
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// MinIO Adapter
// ═══════════════════════════════════════════════════════════════════════════
class MinioAdapter {
    client;
    bucket;
    publicUrl;
    constructor(config) {
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
    async upload(key, data, contentType) {
        await this.client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: data,
            ContentType: contentType,
        }));
    }
    async download(key) {
        const response = await this.client.send(new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        }));
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    }
    async delete(key) {
        await this.client.send(new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key,
        }));
    }
    async getSignedUploadUrl(key, expiresIn = 3600) {
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        return getSignedUrl(this.client, command, { expiresIn });
    }
    async getSignedDownloadUrl(key, expiresIn = 3600) {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        return getSignedUrl(this.client, command, { expiresIn });
    }
    getPublicUrl(key) {
        if (!this.publicUrl)
            return null;
        return `${this.publicUrl}/${key}`;
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// AWS S3 Adapter
// ═══════════════════════════════════════════════════════════════════════════
class S3Adapter {
    client;
    bucket;
    publicUrl;
    constructor(config) {
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
    async upload(key, data, contentType) {
        await this.client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: data,
            ContentType: contentType,
        }));
    }
    async download(key) {
        const response = await this.client.send(new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        }));
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    }
    async delete(key) {
        await this.client.send(new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key,
        }));
    }
    async getSignedUploadUrl(key, expiresIn = 3600) {
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        return getSignedUrl(this.client, command, { expiresIn });
    }
    async getSignedDownloadUrl(key, expiresIn = 3600) {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        return getSignedUrl(this.client, command, { expiresIn });
    }
    getPublicUrl(key) {
        if (this.publicUrl) {
            return `${this.publicUrl}/${key}`;
        }
        return `https://${this.bucket}.s3.amazonaws.com/${key}`;
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// Local Filesystem Adapter
// ═══════════════════════════════════════════════════════════════════════════
class LocalAdapter {
    basePath;
    publicUrl;
    constructor(config) {
        this.basePath = config.path;
        this.publicUrl = config.publicUrl;
        // Ensure directory exists
        if (!existsSync(this.basePath)) {
            mkdirSync(this.basePath, { recursive: true });
        }
    }
    async upload(key, data) {
        const filePath = join(this.basePath, key);
        const dir = filePath.substring(0, filePath.lastIndexOf("/"));
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        await writeFile(filePath, data);
    }
    async download(key) {
        const filePath = join(this.basePath, key);
        return readFile(filePath);
    }
    async delete(key) {
        const filePath = join(this.basePath, key);
        await unlink(filePath);
    }
    async getSignedUploadUrl(key) {
        // Local storage doesn't need signed URLs
        return this.getPublicUrl(key) || "";
    }
    async getSignedDownloadUrl(key) {
        return this.getPublicUrl(key) || "";
    }
    getPublicUrl(key) {
        return `${this.publicUrl}/${key}`;
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// Cloudflare R2 Adapter
// ═══════════════════════════════════════════════════════════════════════════
class R2Adapter {
    client;
    bucket;
    publicUrl;
    constructor(config) {
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
    async upload(key, data, contentType) {
        await this.client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: data,
            ContentType: contentType,
        }));
    }
    async download(key) {
        const response = await this.client.send(new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        }));
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    }
    async delete(key) {
        await this.client.send(new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key,
        }));
    }
    async getSignedUploadUrl(key, expiresIn = 3600) {
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        return getSignedUrl(this.client, command, { expiresIn });
    }
    async getSignedDownloadUrl(key, expiresIn = 3600) {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        return getSignedUrl(this.client, command, { expiresIn });
    }
    getPublicUrl(key) {
        if (!this.publicUrl)
            return null;
        return `${this.publicUrl}/${key}`;
    }
}
//# sourceMappingURL=storage.adapter.js.map