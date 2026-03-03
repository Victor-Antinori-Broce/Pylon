/**
 * Seed Script — Creates the initial superadmin user
 *
 * Run: bun run src/db/seed.ts
 */

import { auth } from "../lib/auth";
import { db } from "./index";
import { authUsers as user } from "./schema";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = "admin@gremius.gg";
const ADMIN_PASSWORD = "gremius123";
const ADMIN_NAME = "Gremius Admin";

async function seed() {
  console.log("🌱 Seeding superadmin user...");
  let userId = "";

  // Check if admin already exists
  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, ADMIN_EMAIL))
    .limit(1);

  if (existing.length) {
    console.log(`  ⚠ Admin exists: ${existing[0].email}. Recreating to ensure password match...`);
    // Delete validation (cascade set null in schema handles relations)
    await db.delete(user).where(eq(user.id, existing[0].id));
  }
  // let userId = ""; // Removed duplicate
  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        name: ADMIN_NAME,
      },
    });

    if (!result?.user?.id) {
      console.error("  ✗ Failed to create admin user");
      process.exit(1);
    }
    userId = result.user.id;

    // Upgrade role to admin
    await db
      .update(user)
      .set({ role: "admin" })
      .where(eq(user.id, result.user.id));

    console.log(`  ✓ Created admin: ${ADMIN_EMAIL}`);
    console.log(`    Password: ${ADMIN_PASSWORD}`);
    console.log(`    Role: admin`);
  } catch (err: any) {
    // If it failed but user might exist in auth tables but not checked above?
    // Retry finding user
    const [u] = await db.select().from(user).where(eq(user.email, ADMIN_EMAIL));
    if (u) {
      userId = u.id;
      console.log(`  ✓ Admin recovered: ${u.email}`);
    } else {
      console.error("  ✗ Error creating admin:", err.message || err);
      process.exit(1);
    }
  }

  // ══════════════════════════════════════════════
  // Seed Content (Games, Posts, etc.)
  // ══════════════════════════════════════════════

  console.log("🌱 Seeding content...");

  // Import schema tables dynamically to avoid top-level issues if needed, 
  // but we already imported user. Let's import the rest.
  const { games, blogPosts, platforms, tags, siteSettings } = await import("./schema");

  // 1. Platforms
  const platformData = [
    { name: "PC", slug: "pc", shortName: "PC" },
    { name: "PlayStation 5", slug: "ps5", shortName: "PS5" },
    { name: "Xbox Series X", slug: "xbox-series-x", shortName: "XSX" },
    { name: "Nintendo Switch", slug: "switch", shortName: "Switch" },
  ];

  for (const p of platformData) {
    await db.insert(platforms).values(p).onConflictDoNothing();
  }
  console.log("  ✓ Platforms seeded");

  // 2. Tags
  const tagData = [
    { name: "Action", slug: "action", category: "genre" },
    { name: "RPG", slug: "rpg", category: "genre" },
    { name: "Adventure", slug: "adventure", category: "genre" },
    { name: "Indie", slug: "indie", category: "genre" },
    { name: "Multiplayer", slug: "multiplayer", category: "feature" },
    { name: "Singleplayer", slug: "singleplayer", category: "feature" },
  ];

  for (const t of tagData) {
    await db.insert(tags).values(t as any).onConflictDoNothing();
  }
  console.log("  ✓ Tags seeded");

  // 3. Games
  const gameData = [
    {
      title: "Elden Ring",
      slug: "elden-ring",
      status: "published",
      metacriticScore: 96,
      developer: "FromSoftware",
      excerpt: "THE NEW FANTASY ACTION RPG. Rise, Tarnished, and be guided by grace to brandish the power of the Elden Ring and become an Elden Lord in the Lands Between.",
    },
    {
      title: "Baldur's Gate 3",
      slug: "baldurs-gate-3",
      status: "published",
      metacriticScore: 96,
      developer: "Larian Studios",
      excerpt: "Gather your party and return to the Forgotten Realms in a tale of fellowship and betrayal, sacrifice and survival, and the lure of absolute power.",
    },
    {
      title: "Cyberpunk 2077",
      slug: "cyberpunk-2077",
      status: "published",
      metacriticScore: 86,
      developer: "CD Projekt Red",
      excerpt: "Cyberpunk 2077 is an open-world, action-adventure RPG set in the megalopolis of Night City, where you play as a cyberpunk mercenary wrapped up in a do-or-die fight for survival.",
    }
  ];

  for (const g of gameData) {
    await db.insert(games).values(g as any).onConflictDoNothing();
  }
  console.log("  ✓ Games seeded");

  // 4. Blog Posts
  const postData = [
    {
      title: "Welcome to GremiusCMS",
      slug: "welcome-to-gremiuscms",
      status: "published",
      excerpt: "Introducing GremiusCMS — the high-performance gaming CMS.",
      publishedAt: new Date(),
      authorId: userId,
    }
  ];

  for (const p of postData) {
    await db.insert(blogPosts).values(p as any).onConflictDoNothing();
  }
  console.log("  ✓ Blog Posts seeded");

  // 5. Settings
  await db.insert(siteSettings).values({
    siteName: "GremiusCMS",
    activeTheme: "gremio-cms",
    mainNav: [
      { label: "Home", url: "/" },
      { label: "Games", url: "/games" },
      { label: "Blog", url: "/blog" }
    ]
  }).onConflictDoNothing();

  console.log("🌱 Seed complete.");
  process.exit(0);
}

seed();
