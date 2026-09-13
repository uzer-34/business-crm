import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#3730a3"/>
  <path d="M32 70V30h22a11 11 0 0 1 6 20 11 11 0 0 1-6 20H32Zm10-24h11a3 3 0 0 0 0-6H42v6Zm0 16h12a3.5 3.5 0 0 0 0-7H42v7Z" fill="white"/>
  <circle cx="72" cy="30" r="6" fill="#818cf8"/>
</svg>
`;

const outDir = new URL("../public/icons/", import.meta.url);
await mkdir(outDir, { recursive: true });

const targets = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const target of targets) {
  await sharp(Buffer.from(svg))
    .resize(target.size, target.size)
    .png()
    .toFile(fileURLToPath(new URL(target.name, outDir)));
  console.log(`wrote ${target.name}`);
}
