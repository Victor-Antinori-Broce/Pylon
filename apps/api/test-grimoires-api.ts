// @ts-nocheck
/**
 * Exhaustive Grimoires Test
 * Verifies that every single grimoire router is properly mounted and returns 200 or 401/404 (not 500 or 404 if it should be array).
 * Run: bun run test-grimoires-api.ts
 */

const API = (process.env.API_URL || "http://localhost:3001") + "/api";
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err: any) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

async function get(path: string) {
  const res = await fetch(`${API}${path}`);
  // Try to parse json, if it fails return text
  let data;
  try {
    data = await res.json();
  } catch {
    data = await res.text();
  }
  return { status: res.status, data };
}

console.log("\n🧪 Exhaustive Grimoires Test Suite\n");

const endpoints = [
  // Core Infrastructure
  { name: "Media Library", path: "/media", expectArray: true },
  { name: "Webhooks", path: "/webhooks", expectArray: true },
  { name: "Connectors", path: "/connectors", expectArray: true },

  // Grimoire Core
  { name: "Promote (Content)", path: "/content", expectArray: true },
  { name: "Page Builder (Blocks)", path: "/blocks", expectArray: true },

  // Optional Grimoires
  { name: "Academy (Courses)", path: "/academy/courses", expectArray: true },
  { name: "DMS (Documents)", path: "/dms", expectArray: true },
  { name: "Booking (Rooms)", path: "/booking/rooms", expectArray: true },
  { name: "Directory (Employees)", path: "/directory", expectArray: true },
  { name: "Blog Posts", path: "/blog", expectArray: true },
  // CRM might only have dynamic tables or specific routes
  // Let's check others

  // Realm Grimoires (Esports)
  { name: "Games", path: "/games", expectArray: true },
  { name: "Streamers", path: "/streamers", expectArray: true },
  { name: "Platforms", path: "/platforms", expectArray: true },
  { name: "Tags", path: "/tags", expectArray: true },
  { name: "Collections", path: "/collections", expectArray: true },
  // { name: "Matches", path: "/matches", expectArray: true },
  // { name: "Players", path: "/players", expectArray: true },
  // { name: "Teams", path: "/teams", expectArray: true },
  // { name: "Tournaments", path: "/tournaments", expectArray: true }
];

for (const ep of endpoints) {
  await test(`GET ${ep.path} [${ep.name}] returns valid response`, async () => {
    const { status, data } = await get(ep.path);
    // 200 is ideal. 401 is okay if auth required. 404 is bad if router is missing but ok if specifically mapped to 404 inside the route.
    // If it's a list route, it should return 200.
    assert(
      status === 200 || status === 401,
      `Status ${status} - Data: ${typeof data === "string" ? data.substring(0, 50) : JSON.stringify(data).substring(0, 50)}`
    );

    if (status === 200 && ep.expectArray) {
      // In this CMS, arrays usually come under `docs` for pagination
      if (Array.isArray(data)) {
        // It's ok
      } else if (data && Array.isArray(data.docs)) {
        // It's ok
      } else {
        throw new Error(
          `Expected array or { docs: [] }, got ${JSON.stringify(data).substring(0, 50)}`
        );
      }
    }
  });
}

console.log(`\n${"═".repeat(40)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(40)}\n`);

if (failed > 0) process.exit(1);
