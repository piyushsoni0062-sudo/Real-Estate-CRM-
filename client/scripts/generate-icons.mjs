// Rasterizes public/favicon.svg into the PWA PNG icons.
// Run with: node scripts/generate-icons.mjs
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(dir, "..", "public");
const svg = fs.readFileSync(path.join(publicDir, "favicon.svg"), "utf8");

// A maskable variant: full-bleed blue background with the glyph in the safe zone.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#2563eb"/>
  <g transform="translate(72,72) scale(0.72)">
    <g fill="none" stroke="#ffffff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
      <path d="M170 400 V150 a26 26 0 0 1 26-26 h120 a26 26 0 0 1 26 26 V400 Z"/>
      <path d="M170 250 H140 a26 26 0 0 0 -26 26 v98 a26 26 0 0 0 26 26 h30"/>
      <path d="M342 210 h30 a26 26 0 0 1 26 26 v138 a26 26 0 0 1 -26 26 h-30"/>
      <path d="M222 178 h68 M222 226 h68 M222 274 h68 M222 322 h68"/>
    </g>
  </g>
</svg>`;

function render(source, size, outfile) {
  const png = new Resvg(source, { fitTo: { mode: "width", value: size } }).render().asPng();
  fs.writeFileSync(path.join(publicDir, outfile), png);
  console.log(`  ${outfile} (${size}px, ${(png.length / 1024).toFixed(1)} KB)`);
}

console.log("Generating PWA icons from favicon.svg…");
render(svg, 192, "pwa-192x192.png");
render(svg, 512, "pwa-512x512.png");
render(svg, 180, "apple-touch-icon.png");
render(maskableSvg, 512, "pwa-maskable-512x512.png");
console.log("Done.");
