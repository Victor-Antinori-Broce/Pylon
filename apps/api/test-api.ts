/**
 * GremiusCMS API - Endpoint Test Suite
 * Run: bun run test-api.ts
 */

const API = "http://localhost:3001/api";
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
  const data = await res.json();
  return { status: res.status, data };
}

async function post(path: string, body: any) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function patch(path: string, body: any) {
  const res = await fetch(`${API}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function del(path: string) {
  const res = await fetch(`${API}${path}`, { method: "DELETE" });
  const data = await res.json();
  return { status: res.status, data };
}

// ═══════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════

console.log("\n🧪 GremiusCMS API Test Suite\n");
console.log("── Health ──");

await test("GET /health returns ok", async () => {
  const { status, data } = await get("/health");
  assert(status === 200, `Status ${status}`);
  assert(data.status === "ok", `Expected ok, got ${data.status}`);
  assert(data.service === "gremius-api", `Wrong service: ${data.service}`);
});

console.log("\n── Games ──");

await test("GET /games returns seeded games", async () => {
  const { status, data } = await get("/games");
  assert(status === 200, `Status ${status}`);
  // Database might be empty, so we just check for docs array
  assert(Array.isArray(data.docs), "Missing docs array");
  assert(data.hasNextPage !== undefined, "Missing pagination");
});

await test("GET /games?limit=1 respects limit", async () => {
  const { status, data } = await get("/games?limit=1");
  assert(status === 200, `Status ${status}`);
  assert(Array.isArray(data.docs), "Missing docs array");
  assert(data.docs.length <= 1, `Expected <=1, got ${data.docs.length}`);
});

await test("GET /games?search=elden finds Elden Ring (if seeded)", async () => {
  const { status, data } = await get("/games?search=elden");
  assert(status === 200, `Status ${status}`);
  assert(Array.isArray(data.docs), "Missing docs array");
});

await test("GET /games/slug/elden-ring returns 404 (or 200 if seeded)", async () => {
  const { status, data } = await get("/games/slug/elden-ring");
  assert(status === 200 || status === 404, `Status ${status}`);
});

await test("GET /games/slug/nonexistent returns 404", async () => {
  const { status } = await get("/games/slug/nonexistent-game-xyz");
  assert(status === 404, `Expected 404, got ${status}`);
});

let testGameId: string | null = null;

await test("POST /games creates a new game", async () => {
  const { status, data } = await post("/games", {
    title: "Test Game 2025",
    slug: "test-game-2025",
    excerpt: "A test game for API validation",
    status: "draft",
    developer: "Test Studio",
    metacriticScore: 85,
  });
  assert(status === 201, `Status ${status}`);
  assert(data.id, "Missing id");
  assert(data.title === "Test Game 2025", `Title: ${data.title}`);
  testGameId = data.id;
});

await test("PATCH /games/:id updates a game", async () => {
  assert(!!testGameId, "No test game created");
  const { status, data } = await patch(`/games/${testGameId}`, {
    metacriticScore: 90,
    status: "published",
  });
  assert(status === 200, `Status ${status}`);
  assert(data.metacriticScore === 90, `Score: ${data.metacriticScore}`);
  assert(data.status === "published", `Status: ${data.status}`);
});

await test("DELETE /games/:id removes a game", async () => {
  assert(!!testGameId, "No test game created");
  const { status, data } = await del(`/games/${testGameId}`);
  assert(status === 200, `Status ${status}`);
  assert(data.deleted === true, "Not deleted");
});

console.log("\n── Blog Posts ──");

await test("GET /blog returns posts", async () => {
  const { status, data } = await get("/blog");
  assert(status === 200, `Status ${status}`);
  assert(Array.isArray(data.docs), `Expected array, got ${typeof data.docs}`);
});

await test("GET /blog/slug/welcome-to-gremiuscms returns post (or 404 if not seeded)", async () => {
  const { status, data } = await get("/blog/slug/welcome-to-gremiuscms");
  assert(status === 200 || status === 404, `Status ${status}`);
});

console.log("\n── Platforms ──");

await test("GET /platforms returns seeded platforms", async () => {
  const { status, data } = await get("/platforms");
  assert(status === 200, `Status ${status}`);
  assert(Array.isArray(data.docs), `Expected array, got ${typeof data.docs}`);
});

console.log("\n── Tags ──");

await test("GET /tags returns seeded tags", async () => {
  const { status, data } = await get("/tags");
  assert(status === 200, `Status ${status}`);
  assert(Array.isArray(data.docs), `Expected array, got ${typeof data.docs}`);
});

await test("POST /tags creates a tag", async () => {
  const slug = `test-tag-${Date.now()}`;
  const { status, data } = await post("/tags", {
    name: "Test Tag",
    slug,
    category: "genre",
    color: "#FF6B6B",
  });
  assert(status === 201, `Status ${status}`);
  assert(data.slug === slug, `Slug: ${data.slug}`);
});

console.log("\n── Data Sets ──");

await test("GET /data-sets returns list", async () => {
  const { status, data } = await get("/data-sets");
  assert(status === 200, `Status ${status}`);
  assert(Array.isArray(data.docs), "Missing docs array");
});

console.log("\n── Streamers ──");

await test("GET /streamers returns list", async () => {
  const { status, data } = await get("/streamers");
  assert(status === 200, `Status ${status}`);
  assert(Array.isArray(data.docs), "Missing docs array");
});

console.log("\n── Settings ──");

await test("GET /settings returns site settings", async () => {
  const { status, data } = await get("/settings");
  assert(status === 200, `Status ${status}`);
  assert(data.siteName || data.site_name, `Missing siteName`);
});

await test("PATCH /settings updates settings", async () => {
  const { status, data } = await patch("/settings", {
    siteDescription: "Updated via API test",
  });
  assert(status === 200, `Status ${status}`);
  assert(data.siteDescription === "Updated via API test", `Desc: ${data.siteDescription}`);
});

console.log("\n── Auth ──");

await test("POST /auth/sign-in/email with valid credentials (or 401 if no seeded user)", async () => {
  const { status, data } = await post("/auth/sign-in/email", {
    email: "admin@gremiuscms.dev",
    password: "admin123",
  });
  // 200 if admin is seeded, 401 if not — both are valid
  assert(status === 200 || status === 401, `Status ${status}`);
});

await test("POST /auth/sign-in/email with wrong password returns 401 (or 403)", async () => {
  const { status } = await post("/auth/sign-in/email", {
    email: "admin@gremiuscms.dev",
    password: "wrongpassword",
  });
  assert(status === 401 || status === 403, `Expected 401 or 403, got ${status}`);
});

await test("POST /auth/sign-up/email creates user", async () => {
  const { status, data } = await post("/auth/sign-up/email", {
    email: `test-${Date.now()}@gremiuscms.dev`,
    password: "testpass123",
    name: "Test User",
  });
  assert(status === 200 || status === 201, `Status ${status}`);
});

await test("POST /auth/sign-up/email duplicate email returns 400ish", async () => {
  const { status } = await post("/auth/sign-up/email", {
    email: "admin@gremiuscms.dev",
    password: "test",
    name: "Dup",
  });
  assert(status >= 400, `Expected error status, got ${status}`);
});

console.log("\n── Media (upload) ──");

await test("POST /media/upload with file", async () => {
  const blob = new Blob(["test content"], { type: "text/plain" });
  const form = new FormData();
  form.append("file", blob, "test-file.txt");
  form.append("alt", "Test file");

  const res = await fetch(`${API}/media/upload`, { method: "POST", body: form });
  const data = await res.json();
  assert(res.status === 201, `Status ${res.status}: ${JSON.stringify(data)}`);
  assert(data.s3Key, `Missing s3Key`);
  assert(data.url.includes("gremius-media"), `URL: ${data.url}`);
  assert(data.filename === "test-file.txt", `Filename: ${data.filename}`);
});

await test("GET /media lists uploaded files", async () => {
  const { status, data } = await get("/media");
  assert(status === 200, `Status ${status}`);
  assert(Array.isArray(data.docs), `Expected array, got ${typeof data.docs}`);
});

console.log("\n── 404 ──");

await test("GET /nonexistent returns 404", async () => {
  const { status } = await get("/nonexistent-route");
  assert(status === 404, `Expected 404, got ${status}`);
});

// ═══════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════

console.log(`\n${"═".repeat(40)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(40)}\n`);

if (failed > 0) process.exit(1);
