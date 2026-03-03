import { scanPackages } from "./src/services/scanner";

async function main() {
    const realms = await scanPackages("themes");
    console.log("Realms:", realms.length, realms.map(r => r.name));

    const grimoires = await scanPackages("modules");
    console.log("Grimoires:", grimoires.length, grimoires.map(g => g.name));
}

main().catch(console.error);
