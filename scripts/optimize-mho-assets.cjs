const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require(path.resolve("node_modules/.pnpm/sharp@0.35.5_@types+node@22.19.13/node_modules/sharp"));

const MEDIA_DIR = path.resolve("gamedata/media/juegos/monsterhunteroutlanders");
const MANIFEST_PATH = path.resolve("gamedata/media/manifiesto.json");
const ICONOS_PATH = path.resolve("gamedata/games/monster-hunter-outlanders/data/iconos.json");

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const iconos = JSON.parse(fs.readFileSync(ICONOS_PATH, "utf8"));

function getMediaFile(url) {
  const info = manifest[url];
  if (!info) throw new Error(`URL not in manifest: ${url}`);
  return path.resolve("gamedata/media", info.clave);
}

function saveAsset(url, buffer) {
  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 20);
  const filename = `${hash}.webp`;
  const diskPath = path.join(MEDIA_DIR, filename);
  fs.writeFileSync(diskPath, buffer);

  manifest[url] = {
    clave: `juegos/monsterhunteroutlanders/${filename}`,
    origen: "monsterhunteroutlanders",
    bytes: buffer.length,
    descargado: "2026-10-29",
  };
  return url;
}

// 1. Process character portrait into clean transparent cutout
async function makeCutout(inputFile, slug) {
  const { data, info } = await sharp(inputFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  const alpha = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];

      // Remove top gold border and top-right corner embellishment
      if (y < 7 || (x > 218 && y < 24 && r > 160 && g > 140)) {
        alpha[y * w + x] = 0;
        continue;
      }

      let m = 1;
      if (a < 245) {
        m = Math.max(0, Math.min(1, (a - 212) / (245 - 212)));
      }
      alpha[y * w + x] = m;
    }
  }

  // Flood fill for pepper's grey background
  if (slug === "pepper") {
    const visited = new Uint8Array(w * h);
    const queue = [];
    for (let x = 0; x < w; x++) queue.push([x, 8]);
    for (let y = 8; y < h * 0.72; y++) queue.push([0, y], [1, y], [w - 1, y]);
    while (queue.length > 0) {
      const [cx, cy] = queue.pop();
      if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
      const p = cy * w + cx;
      if (visited[p]) continue;
      visited[p] = 1;
      const idx = p * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (sat < 26 && r > 105 && g > 100 && b > 95) {
        alpha[p] = 0;
        queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
    }
  }

  // Smooth blur and edge feather
  const smoothed = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, count = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            sum += alpha[ny * w + nx];
            count++;
          }
        }
      }
      const aVal = sum / count;
      const leftFade = x < 28 ? Math.max(0, (x - 2) / 26) : 1;
      const topFade = y < 24 ? Math.max(0, (y - 7) / 17) : 1;
      smoothed[y * w + x] = aVal * leftFade * topFade;
    }
  }

  const out = Buffer.from(data);
  for (let i = 0; i < w * h; i++) {
    out[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, smoothed[i])) * 255);
  }

  return await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .resize(512, 512, { kernel: "lanczos3" })
    .webp({ quality: 92, alphaQuality: 95 })
    .toBuffer();
}

// 2. Medallion generator for roles and weapons
async function makeMedallion(inputFile, accentHex = "#d97706") {
  const size = 256;
  const svgBg = Buffer.from(`
    <svg width="${size}" height="${size}" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bg" cx="50%" cy="42%" r="55%">
          <stop offset="0%" stop-color="#332c27" />
          <stop offset="70%" stop-color="#1c1815" />
          <stop offset="100%" stop-color="#110e0c" />
        </radialGradient>
        <linearGradient id="rim" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fde68a" />
          <stop offset="50%" stop-color="${accentHex}" />
          <stop offset="100%" stop-color="#78350f" />
        </linearGradient>
      </defs>
      <circle cx="128" cy="128" r="116" fill="url(#bg)" stroke="url(#rim)" stroke-width="8" />
      <circle cx="128" cy="128" r="102" fill="none" stroke="#fde68a" stroke-opacity="0.22" stroke-width="2" />
    </svg>
  `);

  const glyph = await sharp(inputFile)
    .resize(168, 168, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .modulate({ brightness: 1.05, saturation: 1.2 })
    .toBuffer();

  return await sharp(svgBg)
    .composite([{ input: glyph, gravity: "center" }])
    .webp({ quality: 92, alphaQuality: 95 })
    .toBuffer();
}

// 3. Composite emblem for characters without headshots
async function makeHunterEmblem(monsterFile, weaponOrRoleFile, accentHex) {
  const size = 512;
  const auraSvg = Buffer.from(`
    <svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glow" cx="58%" cy="56%" r="40%">
          <stop offset="0%" stop-color="${accentHex}" stop-opacity="0.45" />
          <stop offset="60%" stop-color="#1c1917" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </radialGradient>
      </defs>
      <circle cx="290" cy="280" r="195" fill="url(#glow)" />
    </svg>
  `);

  const monsterBuf = await sharp(monsterFile)
    .resize(420, 420, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const badgeSvg = Buffer.from(`
    <svg width="148" height="148" viewBox="0 0 148 148" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="b" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stop-color="#292524" />
          <stop offset="100%" stop-color="#0c0a09" />
        </radialGradient>
      </defs>
      <circle cx="74" cy="74" r="66" fill="url(#b)" stroke="${accentHex}" stroke-width="6" />
      <circle cx="74" cy="74" r="56" fill="none" stroke="#fde68a" stroke-opacity="0.35" stroke-width="2" />
    </svg>
  `);

  const subGlyph = await sharp(weaponOrRoleFile)
    .resize(92, 92, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const badgeBuf = await sharp(badgeSvg)
    .composite([{ input: subGlyph, gravity: "center" }])
    .toBuffer();

  return await sharp(auraSvg)
    .composite([
      { input: monsterBuf, left: 68, top: 64 },
      { input: badgeBuf, left: 344, top: 344 },
    ])
    .webp({ quality: 92, alphaQuality: 95 })
    .toBuffer();
}

async function main() {
  console.log("Starting MHO asset optimization...");

  // 1. Process 9 adventurer portraits
  const nineAdventurers = [
    "pyro", "midori", "luka", "ouyang-varen", "keres", "raya", "pepper", "arkaya", "madelyn"
  ];
  for (const slug of nineAdventurers) {
    const rawUrl = `https://monsterhunteroutlanders.com/media/aventurero/${slug}.webp`;
    const inputFile = getMediaFile(rawUrl);
    const buf = await makeCutout(inputFile, slug);
    const newUrl = `https://monsterhunteroutlanders.com/media/aventurero/${slug}-v2.webp`;
    saveAsset(newUrl, buf);
    iconos[`aventurero:${slug}`] = newUrl;
    console.log(`✓ Processed cutout for ${slug}`);
  }

  // 2. Roles medallions
  const roles = [
    { key: "asalto", color: "#ef4444" },
    { key: "apoyo", color: "#60a5fa" },
    { key: "disruptor", color: "#f59e0b" },
  ];
  for (const r of roles) {
    const rawUrl = `https://monsterhunteroutlanders.com/media/rol/${r.key}.webp`;
    const inputFile = getMediaFile(rawUrl);
    const buf = await makeMedallion(inputFile, r.color);
    const newUrl = `https://monsterhunteroutlanders.com/media/rol/${r.key}-v2.webp`;
    saveAsset(newUrl, buf);
    iconos[`rol:${r.key}`] = newUrl;
    console.log(`✓ Processed medallion for rol:${r.key}`);
  }

  // 3. Weapons medallions
  const armas = [
    { key: "gran-espada", color: "#ef4444" },
    { key: "espada-larga", color: "#f59e0b" },
    { key: "espadas-dobles", color: "#38bdf8" },
    { key: "lanza", color: "#a855f7" },
    { key: "ballesta-pesada", color: "#10b981" },
    { key: "arco", color: "#facc15" },
  ];
  for (const a of armas) {
    const rawUrl = `https://monsterhunteroutlanders.com/media/arma/${a.key}.webp`;
    const inputFile = getMediaFile(rawUrl);
    const buf = await makeMedallion(inputFile, a.color);
    const newUrl = `https://monsterhunteroutlanders.com/media/arma/${a.key}-v2.webp`;
    saveAsset(newUrl, buf);
    iconos[`arma:${a.key}`] = newUrl;
    console.log(`✓ Processed medallion for arma:${a.key}`);
  }

  // 4. Emblems for 6 missing adventurers
  const missingAdventurers = [
    {
      slug: "cazador-predestinado",
      monster: "capturas/radiant-rathalos-render.webp",
      sub: "arma/espada-larga.webp",
      color: "#f59e0b",
    },
    {
      slug: "freya",
      monster: "monstruo/rathalos.webp",
      sub: "arma/gran-espada.webp",
      color: "#ef4444",
    },
    {
      slug: "rhodes",
      monster: "monstruo/legiana.webp",
      sub: "rol/asalto.webp",
      color: "#38bdf8",
    },
    {
      slug: "haze",
      monster: "monstruo/tzitzi-ya-ku.webp",
      sub: "arma/espadas-dobles.webp",
      color: "#facc15",
    },
    {
      slug: "ryunosuke",
      monster: "monstruo/rathian.webp",
      sub: "arma/espada-larga.webp",
      color: "#10b981",
    },
    {
      slug: "luxheart",
      monster: "monstruo/great-jagras.webp",
      sub: "arma/gran-espada.webp",
      color: "#eab308",
    },
  ];

  for (const a of missingAdventurers) {
    const monsterFile = getMediaFile(`https://monsterhunteroutlanders.com/media/${a.monster}`);
    const subFile = getMediaFile(`https://monsterhunteroutlanders.com/media/${a.sub}`);
    const buf = await makeHunterEmblem(monsterFile, subFile, a.color);
    const newUrl = `https://monsterhunteroutlanders.com/media/aventurero/${a.slug}-v2.webp`;
    saveAsset(newUrl, buf);
    iconos[`aventurero:${a.slug}`] = newUrl;
    console.log(`✓ Generated emblem for ${a.slug}`);
  }

  // 5. Emblems for 3 missing companions
  const missingCompanions = [
    {
      slug: "kojirou",
      monster: "monstruo/rathian.webp",
      sub: "rol/asalto.webp",
      color: "#ef4444",
    },
    {
      slug: "lucky",
      monster: "monstruo/barroth.webp",
      sub: "rol/apoyo.webp",
      color: "#f59e0b",
    },
    {
      slug: "hoppy",
      monster: "monstruo/paolumu.webp",
      sub: "rol/disruptor.webp",
      color: "#a855f7",
    },
  ];

  for (const c of missingCompanions) {
    const monsterFile = getMediaFile(`https://monsterhunteroutlanders.com/media/${c.monster}`);
    const subFile = getMediaFile(`https://monsterhunteroutlanders.com/media/${c.sub}`);
    const buf = await makeHunterEmblem(monsterFile, subFile, c.color);
    const newUrl = `https://monsterhunteroutlanders.com/media/companero/${c.slug}-v2.webp`;
    saveAsset(newUrl, buf);
    iconos[`companero:${c.slug}`] = newUrl;
    console.log(`✓ Generated emblem for companero:${c.slug}`);
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
  fs.writeFileSync(ICONOS_PATH, JSON.stringify(iconos, null, 2), "utf8");
  console.log("Updated manifiesto.json and iconos.json successfully.");
}

main().catch(err => {
  console.error("Error running optimization:", err);
  process.exit(1);
});
