import { auth } from "../lib/auth";
import { db } from "./index";
import { authUsers as user } from "./schema";
import { eq } from "drizzle-orm";

import { randomBytes } from "crypto";

async function addVantinori() {
    const email = "vantinori@fpacifico.com";
    const password = process.env.USER_SEED_PASSWORD || randomBytes(16).toString("hex");

    console.log(`Checking if ${email} exists...`);
    const existing = await db.select().from(user).where(eq(user.email, email)).limit(1);

    if (existing.length) {
        console.log("User already exists. Making sure it has admin role...");
        await db.update(user).set({ role: "admin" }).where(eq(user.id, existing[0].id));
        console.log("Done.");
    } else {
        console.log("Creating user...");
        const result = await auth.api.signUpEmail({
            body: {
                email,
                password,
                name: "Vantinori",
            },
            headers: new Headers({ "Content-Type": "application/json" }),
            asResponse: false,
        });

        if (result && 'user' in result && result.user?.id) {
            await db.update(user).set({ role: "admin" }).where(eq(user.id, result.user.id));
            console.log(`✅ Created admin ${email}`);
            console.log(`   Password: ${password}`);
            console.log(`   ⚠ IMPORTANT: Save this password or set USER_SEED_PASSWORD env var.`);
        } else {
            console.log("❌ Failed to create user.");
        }
    }
    process.exit(0);
}

addVantinori();
