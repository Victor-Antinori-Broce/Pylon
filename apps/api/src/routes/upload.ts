import { Hono } from "hono";
import { uploadFile } from "../lib/storage";

export const uploadRoutes = new Hono();

uploadRoutes.post("/", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body["file"];

        if (!file || !(file instanceof File)) {
            return c.json({ error: "No file uploaded" }, 400);
        }

        const { url, s3Key } = await uploadFile(file, file.name, file.type);

        return c.json({
            url,
            key: s3Key,
            filename: file.name,
            size: file.size,
            mimeType: file.type
        });
    } catch (err: any) {
        console.error("Upload Error:", err);
        return c.json({ error: "Upload failed", details: err.message }, 500);
    }
});
