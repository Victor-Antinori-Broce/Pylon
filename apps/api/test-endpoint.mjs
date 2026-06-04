const { app } = await import("./src/index.js");
const res = await app.request("http://localhost:3000/api/system/init-check");
console.log("status:", res.status);
try {
  console.log("body:", await res.json());
} catch {
  console.log("body:", await res.text());
}

const res2 = await app.request("http://localhost:3000/api/system/themes");
console.log("themes status:", res2.status);
try {
  console.log("themes body:", await res2.json());
} catch {
  console.log("themes body:", await res2.text());
}
