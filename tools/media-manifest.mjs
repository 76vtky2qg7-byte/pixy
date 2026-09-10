/**
 * List every store image with its real dimensions and file size, read from the
 * PNG headers rather than assumed. Writes store/MEDIA.md.
 *
 *   node tools/media-manifest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE = path.join(ROOT, 'store');

/** Read width/height straight out of the PNG IHDR chunk. */
function pngSize(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(24);
  fs.readSync(fd, buf, 0, 24, 0);
  fs.closeSync(fd);
  if (buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function walk(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, rel));
    else if (e.name.endsWith('.png')) out.push({ rel, abs });
  }
  return out;
}

const rows = walk(STORE).map((f) => {
  const size = pngSize(f.abs);
  const bytes = fs.statSync(f.abs).size;
  return {
    file: f.rel,
    format: 'PNG',
    width: size?.width ?? 0,
    height: size?.height ?? 0,
    kb: +(bytes / 1024).toFixed(1),
  };
}).sort((a, b) => a.file.localeCompare(b.file));

const lines = [
  '# Store media inventory',
  '',
  'Measured from the files themselves — dimensions come from each PNG header,',
  'sizes from the filesystem. Nothing here is asserted to match the Yandex',
  'draft form: **the required dimensions could not be read from this**',
  '**environment** (see TEST_REPORT.md), so check each field against the form',
  'when filling the draft and re-export only what actually mismatches.',
  '',
  'Every image is a real render of the built game or is composed from the',
  "game's own generated sprites and font — none are mock-ups.",
  '',
  '| File | Format | Width | Height | Size |',
  '|---|---|---|---|---|',
  ...rows.map((r) => `| \`${r.file}\` | ${r.format} | ${r.width} | ${r.height} | ${r.kb} KB |`),
  '',
  `Total: ${rows.length} images, ${(rows.reduce((n, r) => n + r.kb, 0) / 1024).toFixed(2)} MB.`,
  '',
  '## What each one is for',
  '',
  '| File | Purpose |',
  '|---|---|',
  '| `icon-512x512.png` | Game icon. Composed scene: the salvage robot mid-fight. |',
  '| `cover-800x470.png` | Catalogue cover with the title and the 2x3 panel. |',
  '| `cover-1280x720.png` | Same artwork at 16:9, if a wider banner is wanted. |',
  '| `screenshots/1-menu-*` | Main menu. |',
  '| `screenshots/2-combat-*` | Combat on the foundry floor, full six-cell panel. |',
  '| `screenshots/3-panel-*` | The equipment panel with live adjacency links, plus stores. |',
  '| `screenshots/4-boss-*` | Boss wave with the health bar and a telegraphed attack. |',
  '| `screenshots/5-workshop-*` | Permanent upgrades. |',
  '| `screenshots/6-contracts-*` | Contract and robot selection. |',
  '',
  'Screenshots exist at three widths (`360x800`, `390x844`, `1366x768`) so the',
  'draft form can be filled with whichever aspect it asks for.',
  '',
];

fs.writeFileSync(path.join(STORE, 'MEDIA.md'), lines.join('\n'));
console.log(`store/MEDIA.md — ${rows.length} images`);
for (const r of rows) console.log(`  ${String(r.width).padStart(5)}x${String(r.height).padEnd(5)} ${String(r.kb).padStart(7)} KB  ${r.file}`);
