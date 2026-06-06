// @ts-nocheck
import { db } from "./src/db";
import { siteSettings } from "./src/db/schema";

async function update() {
  await db.update(siteSettings).set({ activeTheme: "gremio-cms" });
  console.log("Updated activeTheme");
  process.exit(0);
}
update();
