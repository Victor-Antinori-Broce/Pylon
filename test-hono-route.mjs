import { Hono } from "hono";

const app = new Hono();
const sub = new Hono();

sub.get("/", (c) => c.json({ msg: "root" }));
sub.get("/posts", (c) => c.json({ msg: "posts" }));

app.route("/api/blog", sub);

// Test fetch
const req1 = new Request("http://localhost/api/blog");
const req2 = new Request("http://localhost/api/blog/");
const req3 = new Request("http://localhost/api/blog/posts");

console.log("Testing Hono route mounting...");
const res1 = await app.fetch(req1);
const res2 = await app.fetch(req2);
const res3 = await app.fetch(req3);

console.log("GET /api/blog     ->", res1.status, await res1.text());
console.log("GET /api/blog/    ->", res2.status, await res2.text());
console.log("GET /api/blog/posts ->", res3.status, await res3.text());
