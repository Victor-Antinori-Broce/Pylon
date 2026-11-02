const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require(path.resolve("node_modules/.pnpm/sharp@0.35.5_@types+node@22.19.13/node_modules/sharp"));

const MEDIA_DIR = path.resolve("gamedata/media/juegos/monsterhunteroutlanders");
const MANIFEST_PATH = path.resolve("gamedata/media/manifiesto.json");
const ICONOS_PATH = path.resolve("gamedata/games/monster-hunter-outlanders/data/iconos.json");

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const iconos = JSON.parse(fs.readFileSync(ICONOS_PATH, "utf8"));

async function generateGreyPlaceholder() {
  const svg = `
    <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glowB" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#94a3b8" stop-opacity="0.3" />
          <stop offset="70%" stop-color="#64748b" stop-opacity="0.1" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#334155" stop-opacity="0.95" />
          <stop offset="60%" stop-color="#1e293b" stop-opacity="0.95" />
          <stop offset="100%" stop-color="#0f172a" stop-opacity="0.95" />
        </linearGradient>
        <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f1f5f9" />
          <stop offset="50%" stop-color="#94a3b8" />
          <stop offset="100%" stop-color="#475569" />
        </linearGradient>
      </defs>

      <circle cx="256" cy="256" r="220" fill="url(#glowB)" />

      <!-- Outer dragon tooth ring -->
      <circle cx="256" cy="256" r="200" fill="none" stroke="url(#borderGrad)" stroke-width="3" stroke-dasharray="14,10" stroke-opacity="0.6" />
      <circle cx="256" cy="256" r="185" fill="none" stroke="#64748b" stroke-width="1.5" stroke-opacity="0.4" />

      <!-- Guild Shield -->
      <path d="M 256 75 L 375 125 C 375 260 330 365 256 425 C 182 365 137 260 137 125 Z" fill="url(#shieldGrad)" stroke="url(#borderGrad)" stroke-width="6" />

      <!-- Inner shield bevel -->
      <path d="M 256 95 L 355 137 C 355 250 318 340 256 395 C 194 340 157 250 157 137 Z" fill="none" stroke="#94a3b8" stroke-width="2" stroke-opacity="0.4" />

      <!-- Crossed Hunter daggers in grey behind the question mark -->
      <line x1="190" y1="160" x2="322" y2="320" stroke="#64748b" stroke-width="5" stroke-linecap="round" stroke-opacity="0.5" />
      <line x1="322" y1="160" x2="190" y2="320" stroke="#64748b" stroke-width="5" stroke-linecap="round" stroke-opacity="0.5" />

      <!-- Question Mark in silver/grey -->
      <path d="M 256 165 C 285 165 305 185 305 212 C 305 235 285 255 265 270 L 265 295 L 247 295 L 247 262 C 272 245 285 232 285 212 C 285 195 272 182 256 182 C 240 182 227 195 225 210 L 207 205 C 211 180 230 165 256 165 Z M 246 318 L 266 318 L 266 338 L 246 338 Z" fill="url(#borderGrad)" />
      
      <!-- Guild Star -->
      <polygon points="256,115 261,128 275,128 264,136 268,149 256,141 244,149 248,136 237,128 251,128" fill="#cbd5e1" fill-opacity="0.7" />
    </svg>
  `;

  const buf = await sharp(Buffer.from(svg))
    .webp({ quality: 92, alphaQuality: 95 })
    .toBuffer();

  const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 20);
  const filename = `${hash}.webp`;
  const diskPath = path.join(MEDIA_DIR, filename);
  fs.writeFileSync(diskPath, buf);

  const placeholderUrl = "https://monsterhunteroutlanders.com/media/comun/silueta-gris.webp";
  manifest[placeholderUrl] = {
    clave: `juegos/monsterhunteroutlanders/${filename}`,
    origen: "monsterhunteroutlanders",
    bytes: buf.length,
    descargado: "2026-10-29",
  };

  // 6 missing adventurers
  const missingAdventurers = [
    "cazador-predestinado",
    "freya",
    "rhodes",
    "haze",
    "ryunosuke",
    "luxheart",
  ];
  for (const slug of missingAdventurers) {
    iconos[`aventurero:${slug}`] = placeholderUrl;
  }

  // 3 missing companions
  const missingCompanions = [
    "kojirou",
    "lucky",
    "hoppy",
  ];
  for (const slug of missingCompanions) {
    iconos[`companero:${slug}`] = placeholderUrl;
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
  fs.writeFileSync(ICONOS_PATH, JSON.stringify(iconos, null, 2), "utf8");
  console.log(`Saved grey placeholder as ${filename} and assigned to all 9 missing characters.`);
}

generateGreyPlaceholder().catch(err => {
  console.error(err);
  process.exit(1);
});
