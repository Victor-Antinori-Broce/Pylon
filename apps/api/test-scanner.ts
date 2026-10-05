// @ts-nocheck
import { scanPackages } from "./src/services/scanner";

async function main() {
  const grimoires = await scanPackages("themes");
  console.log(
    "Grimoires:",
    grimoires.length,
    grimoires.map((r) => r.name)
  );

  const kons = await scanPackages("modules");
  console.log(
    "Kons:",
    kons.length,
    kons.map((g) => g.name)
  );
}

main().catch(console.error);
